# Grok Usage (Nimbalyst 확장)

Nimbalyst 왼쪽 레일의 내장 사용량 링(Claude · Codex · Gemini) 옆에, 같은 모양으로 SuperGrok 주간 사용률 링을 추가합니다.

## 주요 기능

- SuperGrok 주간 사용률을 링과 퍼센트로 표시
- 색: 50% 미만 초록, 50% 이상 노랑, 80% 이상 빨강
- 마우스를 올리면 사용률과 리셋 시각 표시 (예: `Grok 주간: 42% (resets 11/10 09:00)`)
- 5분마다 자동 갱신

## 필요한 것

- Grok CLI 설치 및 로그인 (`~/.grok`)
- SuperGrok 구독

## 설치

Windows 기준입니다. Node.js가 필요합니다.

1. 저장소를 받고 빌드합니다.
   ```bash
   git clone https://github.com/SYacuCLoud/nimbalyst-grok-usage.git
   cd nimbalyst-grok-usage
   npm install
   npm run build
   ```
2. `manifest.json`과 `dist/`를 `%APPDATA%\@nimbalyst\electron\extensions\com.syacucloud.grok-usage\`에 복사합니다.
3. Nimbalyst를 다시 시작합니다.

Nimbalyst **Settings > Advanced > Extension Dev Tools**를 켰다면 2~3 대신 `extension_build` / `extension_install`을 써도 됩니다.

## 첫 사용

1. 설정의 **Grok 사용량** 화면을 엽니다.
2. **연결**을 누르고 백엔드 모듈 실행에 동의합니다.

## 동작 방식

- 백엔드(utility-process)가 5분마다 Grok CLI 로그인 정보(`~/.grok/auth.json`)로 Grok CLI가 쓰는 사용량 엔드포인트를 호출하고, 결과를 `usage.json`에 기록합니다.
- 링은 `usage.json`을 1분마다 읽어 표시합니다.
- 토큰이 만료되기 직전이면 `grok models`를 실행해 CLI가 스스로 토큰을 갱신하게 합니다. 이 확장은 `auth.json`을 수정하지 않습니다.
- 토큰은 xAI 서버(`cli-chat-proxy.grok.com`) 외에는 보내지 않습니다.
- 로그인 정보를 읽지 못하면 `grok 실행 필요`를 표시합니다.

## 제한

- 공개 문서가 없는 엔드포인트와 Nimbalyst 레일의 내부 DOM을 사용하므로, 업데이트로 동작하지 않을 수 있습니다.
- 이 링에는 우클릭 숨기기와 순서 바꾸기가 없습니다.
- 마지막 갱신이 30분을 넘었거나 주간 사용 기간이 끝났으면 `--`를 표시합니다.
- 갱신 중 오류가 나면 `--`와 오류 내용을 마우스 툴팁에 표시합니다.

## 개발

```bash
npm test
npm run check:types
```

`npm run build`는 `vite build` 뒤에 `src/backend.js`와 `src/usage.js`를 `dist/`로 복사합니다.

Nimbalyst 공식 확장이 아닌 개인 프로젝트입니다.
