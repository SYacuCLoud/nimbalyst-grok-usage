import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExtensionContext, SettingsPanelProps } from '@nimbalyst/extension-sdk'
import { extensionUsagePath, RING_CIRCUMFERENCE, RING_RADIUS, ringView } from './usage.js'

type UsageRecord = {
  percent?: number | null
  periodEnd?: string | null
  updatedAt?: string | null
  error?: string | null
}

type FileSystem = ExtensionContext['services']['filesystem']

const ANCHORS = ['gemini-usage', 'codex-usage', 'claude-usage']
const SLOT = 'ext-grok-usage'
const BUTTON_CLASS = 'relative w-9 h-9 flex items-center justify-center bg-transparent border-none rounded-md cursor-pointer transition-all duration-150 p-0 hover:bg-nim-tertiary active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--nim-primary)] focus-visible:outline-offset-2'

let filesystem: FileSystem | null = null
let extensionPath = ''

export function activate(context: ExtensionContext) {
  filesystem = context.services.filesystem
  extensionPath = context.extensionPath
}

export function deactivate() {
  filesystem = null
  extensionPath = ''
  document.querySelector(`[data-gutter-item="${SLOT}"]`)?.remove()
}

function findAnchor() {
  const nav = document.querySelector('.nav-settings')
  if (!nav) return null
  for (const id of ANCHORS) {
    const anchor = nav.querySelector(`[data-gutter-item="${id}"]`)
    if (anchor) return anchor
  }
  return null
}

function ensureSlot(anchor: Element) {
  const next = anchor.nextElementSibling
  if (next?.getAttribute('data-gutter-item') === SLOT) return next as HTMLElement
  document.querySelectorAll(`[data-gutter-item="${SLOT}"]`).forEach((node) => node.remove())
  const slot = document.createElement('div')
  slot.setAttribute('data-gutter-item', SLOT)
  anchor.insertAdjacentElement('afterend', slot)
  return slot
}

async function readUsage(): Promise<UsageRecord | null> {
  if (!filesystem || !extensionPath) return null
  const path = extensionUsagePath(extensionPath)
  try {
    if (!(await filesystem.fileExists(path))) return null
    return JSON.parse(await filesystem.readFile(path)) as UsageRecord
  } catch {
    return null
  }
}

function Ring({ record }: { record: UsageRecord | null }) {
  const view = ringView(record)
  return (
    <div className="relative">
      <button
        type="button"
        title={view.title}
        aria-label="Grok Usage"
        data-testid="grok-usage-indicator"
        className={BUTTON_CLASS}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" className="transform -rotate-90">
          <circle cx="16" cy="16" r={RING_RADIUS} fill="none" className="stroke-nim-tertiary" strokeWidth="3" />
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            fill="none"
            className={view.stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={view.dashOffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-nim">{view.label}</span>
      </button>
    </div>
  )
}

export function GrokUsageRing() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [record, setRecord] = useState<UsageRecord | null>(null)

  useEffect(() => {
    const sync = () => {
      const anchor = findAnchor()
      if (!anchor) return
      const next = ensureSlot(anchor)
      setSlot((prev) => (prev === next ? prev : next))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      document.querySelector(`[data-gutter-item="${SLOT}"]`)?.remove()
    }
  }, [])

  useEffect(() => {
    let stopped = false
    const tick = () => {
      void readUsage().then((next) => {
        if (!stopped) setRecord(next)
      })
    }
    tick()
    const timer = setInterval(tick, 60_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])

  if (!slot) return null
  return createPortal(<Ring record={record} />, slot)
}

export function GrokUsageSettings({ callBackendTool }: SettingsPanelProps) {
  const [status, setStatus] = useState('연결을 누르면 동의를 거친 뒤 주간 사용률을 받습니다.')

  const connect = async () => {
    if (!callBackendTool) {
      setStatus('백엔드 호출을 쓸 수 없습니다.')
      return
    }
    setStatus('불러오는 중…')
    try {
      const result = await callBackendTool('grok-usage.refresh') as UsageRecord
      if (result?.error) setStatus(result.error)
      else if (typeof result?.percent === 'number') setStatus(`주간 사용률 ${Math.round(result.percent)}%`)
      else setStatus('응답에 사용률이 없습니다.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--nim-text)', fontSize: 14 }}>
      <p style={{ margin: 0 }}>Grok CLI 로그인으로 SuperGrok 주간 사용률을 좌측 링에 표시합니다.</p>
      <button type="button" onClick={() => void connect()}>연결</button>
      <p style={{ margin: 0, color: 'var(--nim-text-muted)' }}>{status}</p>
    </div>
  )
}

export const hostComponents = { GrokUsageRing }

export const settingsPanel = { GrokUsageSettings }
