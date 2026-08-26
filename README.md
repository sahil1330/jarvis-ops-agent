# Jarvis // Personal Operations

> A voice-first, approval-gated personal operations agent built on TrueForge for The Agent Harness Hackathon 2026.

Jarvis turns outcome-level requests into observable work across connected systems. The hackathon build is now centered on one golden mission:

> **“Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”**

The current runtime already provides persistent TrueForge sessions, dynamic subagents, MCP tool routing, Daytona sandbox execution, streaming UI events, explicit human approval checkpoints, natural voice output, and bounded explicit memory. See [`docs/golden-mission.md`](docs/golden-mission.md) for the mission and evidence contract.

## Why this is an agent

Jarvis does not require the user to name every application or tool. It can discover relevant calendar context and client communication, delegate independent investigation, use sandboxed code execution when verification is required, and stop before an external side effect until the user approves the exact action.

The Realtime voice channel is intentionally not a second autonomous agent. It receives no Gmail, Calendar, memory, sandbox, or approval authority; it only renders natural-language text already emitted by TrueForge.

## Repository layout

```text
apps/
  control-center/       React + Vite voice, mission, trace and approval interface
  orchestrator/         TrueForge SDK streaming + server-side audio bridge
  google-workspace-mcp/ Gmail, Calendar and persistent-memory MCP server
scripts/
  setup-trueforge.ts    Idempotent connector and agent registration
  doctor.ts             Read-only live-demo preflight
docs/
  architecture.md       Trust boundaries and execution flow
  design.md             Interface rationale and accessibility evidence
  golden-mission.md     Objective-driven hackathon mission contract
  demo-script.md        Three-minute judging walkthrough
  submission.md         Hackathon write-up
```

## Prerequisites

- Node.js 22.14 or newer
- A model provider configured inside TrueForge
- An OpenAI API key for neural STT and Realtime/TTS voice
- A Daytona API key for sandbox execution
- A Google Cloud project with Gmail API and Google Calendar API enabled
- Google OAuth credentials and a refresh token for an account you own

## Fresh local setup

```bash
git clone <your-fork-or-repository-url>
cd jarvis-ops-agent
cp .env.example .env
npm install
```

Before running setup, configure **all** required values in `.env`:

1. Start TrueForge with `npm run trueforge` and add a model under **Settings → Models**.
2. Copy that model’s exact FQN into `TRUEFORGE_MODEL`. Jarvis deliberately does not guess a provider/model name.
3. Set `OPENAI_API_KEY` for voice.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` for the Google account you own.
5. Generate `JARVIS_MCP_BEARER_TOKEN` with `openssl rand -hex 32`.
6. Configure Daytona under **TrueForge → Settings → Sandbox providers**.

Gmail always addresses the mailbox authenticated by the OAuth token through `users/me`; there is no runtime `GOOGLE_USER_EMAIL` setting.

Start the Google Workspace MCP:

```bash
npm run dev:mcp
```

Register/update Jarvis in TrueForge:

```bash
npm run setup:trueforge
```

Then start the orchestrator and UI:

```bash
npm run dev:api
npm run dev:ui
```

Open `http://localhost:5173`.

Before a live rehearsal, run:

```bash
npm run doctor
```

## Google OAuth scopes

Request only the scopes used by the hackathon workflow:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events
```

Keep development OAuth credentials private and never commit refresh tokens, API keys, inbox data, calendar data, or local memory.

## Voice interaction

Jarvis uses a persistent WebRTC Realtime voice path when available, with neural TTS and browser speech as fallbacks. Input uses browser recording, adaptive VAD and neural transcription. Raw tool arguments, sandbox diagnostics and connector traces are not spoken.

## Persistent memory

Explicit user memory is exposed through:

- `recall_memories`
- `remember_fact`
- `forget_memory`

Ordinary conversation is not silently persisted. Credentials and obvious secrets are rejected.

## Safe rehearsal mode

`JARVIS_DEMO_MODE=true` provides deterministic synthetic Google data for UI and orchestration rehearsal. The interface visibly labels demo data. The judged recording should follow the hackathon rules for authorized real tool usage; deterministic fixtures exist to make development and failure rehearsal repeatable, not to fake integrations.

## Safety model

- Read tools may run autonomously.
- Gmail and Calendar writes are named in TrueForge `requireApprovalForTools`.
- Approval decisions return to TrueForge as `user.tool_approval`; the UI does not call Google writes directly.
- The Google refresh token remains in the MCP process and never enters the sandbox or browser.
- The OpenAI API key remains in the orchestrator.
- The Realtime voice renderer has no tool authority.
- MCP requests require a bearer credential and bind to loopback by default.
- The orchestrator also binds to loopback by default; public/multi-user deployment is intentionally outside the current hackathon boundary.
- A denied action is terminal for that tool call.

See [`SECURITY.md`](SECURITY.md) and [`docs/architecture.md`](docs/architecture.md) for the detailed trust boundaries.

## Verification

```bash
npm run check
npm run build
```

The suite covers tool authentication, Gmail addressing, tool failures, approval reconstruction, stream isolation, voice lifecycle, VAD, persistent memory, accessibility, latency telemetry and setup scripts.

## Qodo Code Review Evidence

Every substantive feature goes through a pull request and Qodo review before merge. Earlier reviewed work includes:

- [PR #1 — Google Workspace MCP](https://github.com/sahil1330/jarvis-ops-agent/pull/1)
- [PR #2 — TrueForge streaming runtime](https://github.com/sahil1330/jarvis-ops-agent/pull/2)
- [PR #3 — voice control center](https://github.com/sahil1330/jarvis-ops-agent/pull/3)
- [PR #4 — accessibility and Best UI evidence](https://github.com/sahil1330/jarvis-ops-agent/pull/4)
- [PR #7 — visible failures/outcomes](https://github.com/sahil1330/jarvis-ops-agent/pull/7)
- [PR #8 — neural voice and persistent memory](https://github.com/sahil1330/jarvis-ops-agent/pull/8)
- [PR #9 — streamed speech](https://github.com/sahil1330/jarvis-ops-agent/pull/9)
- [PR #10 — Realtime voice and VAD](https://github.com/sahil1330/jarvis-ops-agent/pull/10)
- [PR #11 — live progress narration](https://github.com/sahil1330/jarvis-ops-agent/pull/11)
- [PR #12 — Realtime SDP fix](https://github.com/sahil1330/jarvis-ops-agent/pull/12)
- [PR #13 — conversational voice pacing](https://github.com/sahil1330/jarvis-ops-agent/pull/13)
- [PR #14 — voice/stream/approval hardening](https://github.com/sahil1330/jarvis-ops-agent/pull/14)
- [PR #15 — demo readiness doctor](https://github.com/sahil1330/jarvis-ops-agent/pull/15)
- [PR #16 — latency telemetry](https://github.com/sahil1330/jarvis-ops-agent/pull/16)
- [PR #17 — agent-loop efficiency](https://github.com/sahil1330/jarvis-ops-agent/pull/17)
- [PR #18 — runtime, Gmail identity and memory hardening](https://github.com/sahil1330/jarvis-ops-agent/pull/18)

Qodo findings are fixed in their PRs and follow-up review is requested before merge.

## AI assistance disclosure

AI coding assistance was used during implementation. The participant reviewed the architecture, code, tests, safety boundaries and technical decisions and remains responsible for the submitted work.

## License

[MIT](LICENSE) © 2026 Sahil Mane
