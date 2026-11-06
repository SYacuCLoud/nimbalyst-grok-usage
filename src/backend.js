import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expiresSoon, parseBilling, pickAuthEntry } from './usage.js'

const AUTH_PATH = join(homedir(), '.grok', 'auth.json')
const BILLING_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const REFRESH_MS = 5 * 60 * 1000
const GROK_TIMEOUT_MS = 45_000
const NEED_GROK = 'grok 실행 필요'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readAuth() {
  let lastError
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const entry = pickAuthEntry(JSON.parse(readFileSync(AUTH_PATH, 'utf8')))
      if (!entry) throw new Error(NEED_GROK)
      return entry
    } catch (error) {
      lastError = error
      if (error?.code === 'ENOENT') break
      await sleep(40)
    }
  }
  if (lastError?.code === 'ENOENT' || lastError?.message === NEED_GROK) throw new Error(NEED_GROK)
  throw lastError instanceof Error ? lastError : new Error(NEED_GROK)
}

function grokCandidates() {
  const commands = ['grok']
  if (process.platform === 'win32') commands.push(join(homedir(), '.grok', 'bin', 'grok.exe'))
  return commands
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const child = spawn(command, ['models'], { windowsHide: true, stdio: 'ignore' })
    timer = setTimeout(() => {
      child.kill()
      finish(reject, new Error('grok models timeout'))
    }, GROK_TIMEOUT_MS)
    child.on('error', (error) => finish(reject, error))
    child.on('exit', (code) => {
      if (code === 0) finish(resolve, undefined)
      else finish(reject, new Error(`grok models exited ${code}`))
    })
  })
}

async function runGrokModels() {
  let lastError
  for (const command of grokCandidates()) {
    try {
      await runCommand(command)
      return
    } catch (error) {
      lastError = error
      if (error?.code !== 'ENOENT') break
    }
  }
  throw lastError instanceof Error ? lastError : new Error(NEED_GROK)
}

async function freshAuth() {
  let auth = await readAuth()
  if (!expiresSoon(auth.expires_at)) return auth
  // The CLI refreshes its own token under its lock. We never write refresh_token.
  try {
    await runGrokModels()
  } catch {
    throw new Error(NEED_GROK)
  }
  auth = await readAuth()
  if (expiresSoon(auth.expires_at)) throw new Error(NEED_GROK)
  return auth
}

async function fetchBilling(auth) {
  const headers = {
    Authorization: `Bearer ${auth.key}`,
    'x-userid': auth.user_id
  }
  let response = await fetch(BILLING_URL, { headers })
  if (response.status === 401 || response.status === 403) {
    response = await fetch(BILLING_URL, {
      headers: { ...headers, 'X-XAI-Token-Auth': 'xai-grok-cli' }
    })
  }
  if (!response.ok) throw new Error(`billing ${response.status}`)
  return parseBilling(await response.json())
}

function writeUsage(dir, record) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'usage.json')
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(record))
  renameSync(tmp, file)
}

function publish(services, record) {
  writeUsage(services.dataDir, record)
  if (services.extensionPath) writeUsage(services.extensionPath, record)
  return record
}

async function refreshUsage(services) {
  try {
    const auth = await freshAuth()
    const billing = await fetchBilling(auth)
    const record = publish(services, {
      percent: billing.percent,
      periodEnd: billing.periodEnd,
      updatedAt: new Date().toISOString(),
      error: null
    })
    services.log('info', `[grok-usage] ${record.percent}%`)
    return record
  } catch (error) {
    const message = error instanceof Error && error.message === NEED_GROK ? NEED_GROK : (error instanceof Error ? error.message : NEED_GROK)
    const record = publish(services, {
      percent: null,
      periodEnd: null,
      updatedAt: new Date().toISOString(),
      error: message === NEED_GROK ? NEED_GROK : message
    })
    services.log('warn', `[grok-usage] ${record.error}`)
    return record
  }
}

export async function activate(ctx) {
  const { services } = ctx
  let chain = Promise.resolve(null)
  const refresh = () => {
    chain = chain.then(() => refreshUsage(services)).catch((error) => {
      services.log('warn', `[grok-usage] ${error instanceof Error ? error.message : String(error)}`)
      return null
    })
    return chain
  }

  if (services.hasPermission?.('mcp-server-register')) {
    try {
      await services.registerMcpTools([
        {
          name: 'refresh',
          description: 'Fetch SuperGrok weekly usage and write usage.json.',
          inputSchema: { type: 'object', properties: {} },
          scope: 'global',
          panelOnly: true
        }
      ])
    } catch (error) {
      services.log('warn', `[grok-usage] tool register failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  void refresh()
  const timer = setInterval(() => {
    void refresh()
  }, REFRESH_MS)
  timer.unref?.()

  return {
    methods: { refresh },
    deactivate: () => clearInterval(timer)
  }
}
