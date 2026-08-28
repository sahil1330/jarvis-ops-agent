# Jarvis // Personal Operations

> A voice-first, approval-gated personal operations agent built on TrueForge for The Agent Harness Hackathon 2026.

Jarvis turns an **outcome** into observable work across the systems needed to achieve it. The submission is centered on one golden mission:

> **“Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”**

From that single command Jarvis discovers the meeting context, reads the relevant client requirements, inspects an allowlisted GitHub revision, delegates engineering verification into an isolated Daytona sandbox, reproduces a client-specific regression, proposes a verified repair, and stops at a TrueForge human-approval checkpoint before publication.

The user does not have to say “open Calendar, search Gmail, inspect GitHub, run tests, then create a PR.” The harness decides the shortest trustworthy path while keeping evidence and side effects visible.

## What makes this an agent

Jarvis uses TrueForge as the actual agent harness rather than as a chat wrapper:

- persistent sessions and streamed turn events;
- dynamic subagents for independent context/engineering work;
- Google Workspace and GitHub tools through isolated MCP trust boundaries;
- Daytona sandbox / Code Mode for untrusted code and verification;
- required human approval for external writes;
- explicit bounded memory;
- a custom control center that renders the real execution trace, mission progress, system failures, and approval calls.

The Realtime voice path is intentionally **not** a second autonomous agent. It receives no Gmail, Calendar, GitHub, memory, sandbox, or approval authority; it only speaks text already emitted by the TrueForge-driven workflow.

## Golden mission evidence contract

The mission is presented as four evidence-backed stages:

1. **Context** — identify the relevant meeting and deadline from Calendar.
2. **Requirements** — find/read the relevant Gmail conversation and extract explicit acceptance criteria.
3. **Verify** — snapshot the exact configured GitHub revision and use the sandbox to reproduce the client-reported case before changing code; after the patch, rerun the targeted reproduction and broader suite.
4. **Action** — show the exact publication call and wait for TrueForge approval before creating a branch/commit/PR. The connector cannot merge it.

A green pre-existing suite is not accepted as proof that a client-reported edge case works.

See [`docs/golden-mission.md`](docs/golden-mission.md) for the full contract and [`docs/demo-script.md`](docs/demo-script.md) for the three-minute judging flow.

## Repository layout

```text
apps/
  control-center/       React + Vite voice, mission, trace and approval interface
  orchestrator/         TrueForge SDK streaming + server-side audio bridge
  google-workspace-mcp/ Google MCP plus isolated GitHub MCP entrypoint
demo-lab/               Healthy self-contained product used by the engineering mission
scripts/
  setup-trueforge.ts    Idempotent connector and agent registration
  doctor.ts             Read-only live-demo preflight
docs/
  architecture.md       Trust boundaries and execution flow
  design.md             Interface rationale and accessibility evidence
  golden-mission.md     Objective-driven mission/evidence contract
  demo-script.md        Three-minute judging walkthrough
  live-demo-setup.md    Synthetic live data + repeatable rehearsal/reset procedure
  submission.md         Hackathon write-up
```

## Prerequisites

- Node.js 22.14 or newer
- A model provider configured inside TrueForge
- An OpenAI API key for neural STT and Realtime/TTS voice
- A Daytona API key configured as the TrueForge sandbox provider
- A Google Cloud project with Gmail API and Google Calendar API enabled
- OAuth credentials and a refresh token for a Google account you own
- A fine-grained GitHub token restricted to `sahil1330/jarvis-ops-agent`, with the repository permissions needed for the bounded demo publication flow

## Fresh local setup

```bash
git clone <repository-url>
cd jarvis-ops-agent
cp .env.example .env
npm install
```

Configure `.env` before running setup:

1. Start TrueForge with `npm run trueforge` and add a model under **Settings → Models**.
2. Copy the model’s exact configured FQN into `TRUEFORGE_MODEL`; Jarvis deliberately does not guess one.
3. Set `OPENAI_API_KEY`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` for the owned/test Google account.
5. Generate two independent connector bearers:

```bash
openssl rand -hex 32   # JARVIS_MCP_BEARER_TOKEN
openssl rand -hex 32   # JARVIS_GITHUB_MCP_BEARER_TOKEN
```

6. Configure the golden GitHub target exactly:

```text
JARVIS_GITHUB_REPOSITORY=sahil1330/jarvis-ops-agent
JARVIS_GITHUB_BASE_BRANCH=demo/client-regression
```

7. Set `JARVIS_GITHUB_TOKEN` to a fine-grained token restricted to that repository.
8. Configure Daytona under **TrueForge → Settings → Sandbox providers**.

Gmail always addresses the mailbox authenticated by OAuth through `users/me`; there is no runtime mailbox-override setting.

Start the two MCP services:

```bash
npm run dev:mcp
npm run dev:github
```

The Google MCP defaults to `127.0.0.1:8788`; the isolated GitHub MCP defaults to `127.0.0.1:8789`. Each has its own bearer.

Register/update both connectors and the Jarvis agent:

```bash
npm run setup:trueforge
```

Start the orchestrator and UI:

```bash
npm run dev:api
npm run dev:ui
```

Open `http://localhost:5173`.

## Live demo preparation

For the judged flow, use **real APIs with synthetic data you control** and keep:

```text
JARVIS_DEMO_MODE=false
```

Follow [`docs/live-demo-setup.md`](docs/live-demo-setup.md) to seed a harmless “Atlas” Gmail thread/calendar event and reset previous rehearsal PR branches.

Before every full rehearsal/recording:

```bash
npm run check
npm run build
npm run doctor
```

`doctor` verifies, read-only:

- required secrets/config are present without printing them;
- TrueForge and the registered Jarvis agent are reachable;
- Google OAuth refresh + Gmail/Calendar reads work;
- OpenAI voice/STT models are accessible;
- local memory storage is usable;
- the GitHub MCP bearer really authenticates to `/mcp`;
- the configured repository is exactly `sahil1330/jarvis-ops-agent`;
- the base branch is exactly `demo/client-regression`;
- the controlled regression commit changes only `demo-lab/src/product.js` from the healthy 6 MiB limit to the injected 1 MiB limit.

Do not record a “successful” mission while `doctor` reports a blocker.

## Controlled engineering incident

The submitted `main` branch is healthy. `demo-lab/src/product.js` supports the client-required roughly 5 MB PDF with a 6 MiB ceiling and its baseline suite is green.

For the live mission only, the throwaway branch:

```text
demo/client-regression
```

contains exactly one controlled change: `MAX_RESUME_BYTES` is lowered from 6 MiB to 1 MiB. Existing baseline tests remain green because they intentionally do not encode the client-specific ~5 MB reproduction. Jarvis must derive that missing case from Gmail, reproduce the failure in the sandbox, repair it, and verify it.

The incident branch is never merged into `main`.

## GitHub connector boundary

The GitHub MCP exposes a permission-aligned, fixed-repository surface:

- `get_repository_snapshot` reads only the configured repository/base branch and returns its exact SHA.
- repository content, pull-request, Actions workflow/run, environment, and Copilot agent-task reads are bounded and return explicit schemas;
- `list_pull_requests` is the authoritative route for open or remaining PR status;
- PR metadata/reviews, workflow dispatch/rerun/cancel, environment configuration, and agent-task start operations are available only through TrueForge approval;
- `publish_verified_fix` accepts only bounded changes under `demo-lab/`.
- the caller must supply the previously observed base SHA;
- the base SHA is rechecked before publication so stale evidence cannot publish;
- PR-creation failure cleans up the branch created by that attempt;
- the connector has no merge, delete, secrets, or unrestricted code-write tool;
- every GitHub write tool is in TrueForge `requireApprovalForTools`.

The GitHub PAT stays in the GitHub MCP process. It never enters Daytona, the browser, the Realtime renderer, or model context.

## Google OAuth scopes

Request only the scopes used by the hackathon workflow:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events
```

Never commit OAuth credentials, refresh tokens, API keys, inbox/calendar contents, GitHub tokens, MCP bearers, or local memory.

## Voice and human approval

Input uses browser recording, adaptive VAD and neural transcription when available. Realtime WebRTC voice is preferred for natural output, with neural TTS/browser speech fallbacks. Raw tool arguments, secrets and sandbox diagnostics are not spoken.

While a human checkpoint is pending, the user may use the buttons or a deliberately narrow set of explicit voice decisions such as **“Approve it”** / **“Deny it.”** Ambiguous phrases such as “okay” are not authorization.

A paused approval checkpoint is persisted in **tab-scoped `sessionStorage`** and can be restored after a refresh in the same tab. Jarvis does **not** claim arbitrary active mid-tool stream replay or cross-device recovery.

## Persistent memory

Explicit user memory is exposed through:

- `recall_memories`
- `remember_fact`
- `forget_memory`

Ordinary conversation is not silently persisted. Credentials and obvious secrets are rejected.

## Safety model

- Read tools may run autonomously.
- Gmail/Calendar writes and verified-fix publication are named in TrueForge approval policy.
- Approval decisions return to TrueForge as `user.tool_approval`; the browser never invokes provider writes directly.
- Google and GitHub credentials remain in their MCP processes.
- The OpenAI API key remains in the orchestrator.
- Model/MCP credentials never enter Daytona.
- The voice renderer has no tool authority.
- MCP services and the unauthenticated local orchestrator bind to loopback by default.
- A denied action is not retried or worked around.

See [`SECURITY.md`](SECURITY.md) and [`docs/architecture.md`](docs/architecture.md).

## Verification

```bash
npm run check
npm run build
```

The suite covers connector authentication, Gmail identity/thread handling, tool failures, bounded GitHub publication safeguards, controlled-regression invariants, approval reconstruction/recovery, stale voice decisions, microphone cancellation races, stream isolation, VAD/voice lifecycle, memory, mission-stage truthfulness, GitHub system observability, accessibility, latency telemetry and setup scripts.

## Qodo Code Review evidence

Substantive feature work goes through a PR, Qodo review, remediation, and re-review before merge. Key reviewed slices include:

- [PR #18 — runtime, Gmail identity and memory hardening](https://github.com/sahil1330/jarvis-ops-agent/pull/18)
- [PR #19 — objective-driven golden mission foundation](https://github.com/sahil1330/jarvis-ops-agent/pull/19)
- [PR #21 — objective-driven orchestration and verification rules](https://github.com/sahil1330/jarvis-ops-agent/pull/21)
- [PR #22 — healthy sandbox verification lab](https://github.com/sahil1330/jarvis-ops-agent/pull/22)
- [PR #23 — approval checkpoint recovery + explicit voice decisions](https://github.com/sahil1330/jarvis-ops-agent/pull/23)
- [PR #24 — evidence-backed mission progress UI](https://github.com/sahil1330/jarvis-ops-agent/pull/24)
- [PR #25 — GitHub golden-demo readiness doctor](https://github.com/sahil1330/jarvis-ops-agent/pull/25)

Earlier PRs in the repository document the Google MCP, TrueForge streaming runtime, voice stack, accessibility, failure visibility, realtime voice/VAD, latency telemetry and other supporting work. Qodo findings are fixed rather than merely acknowledged.

## AI assistance disclosure

AI coding assistance was used during implementation. The participant reviewed the architecture, code, tests, safety boundaries and technical decisions and remains responsible for the submitted work.

## License

[MIT](LICENSE) © 2026 Sahil Mane
