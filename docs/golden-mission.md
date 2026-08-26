# Jarvis Golden Mission

## Objective

The hackathon demo is built around one outcome-level command:

> **“Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”**

Jarvis must decide which connected systems and evidence are needed. The user should not have to author a tool-by-tool workflow.

## Mission stages

### 1. CONTEXT

- Read Calendar and identify the relevant client demo/deadline.
- Report the actual event/time returned by the tool; never invent a meeting.

### 2. REQUIREMENTS

- Search Gmail narrowly for the relevant client conversation.
- Read the bounded thread when snippets are insufficient.
- Extract only explicit acceptance criteria.

For the controlled live demo, the synthetic-owned client thread asks for:

- roughly 5 MB PDF resume upload support;
- job recommendations for a TypeScript / Node.js profile;
- the `resume_uploaded` analytics event.

### 3. VERIFY

- Call `get_repository_snapshot` before engineering verification.
- Treat its exact repository, base branch and SHA as the source of truth.
- Delegate substantial engineering verification to a separate subagent.
- Use the Daytona sandbox against that exact revision.
- Run the existing baseline, but do **not** treat a green baseline as proof of an untested client case.
- Create/run the targeted ~5 MB reproduction first.
- Observe the failure before editing.
- Patch only what is required.
- Rerun the targeted reproduction and the broader regression suite.

A fix is verified only when the targeted case fails before the patch, passes after it, and the broader suite still passes.

### 4. ACTION

Only after verification evidence exists:

- show the base SHA, changed paths and verification evidence;
- propose `publish_verified_fix`;
- pause at the TrueForge human checkpoint;
- publish only after an explicit Allow / explicit voice approval;
- create a branch, commit and PR only — never merge it.

Finish with a concise readiness brief that separates deadline, requirements, verified facts, action result and anything still unverified.

## Controlled repository incident

The submitted `main` branch is healthy. Its demo product supports the client-required file size with:

```js
const MAX_RESUME_BYTES = 6 * 1024 * 1024;
```

The live engineering incident exists only on:

```text
repository: sahil1330/jarvis-ops-agent
branch: demo/client-regression
```

That branch tip changes exactly one file (`demo-lab/src/product.js`) and lowers the active limit to 1 MiB. Its ordinary baseline remains green; the missing ~5 MB reproduction must come from the client requirement rather than a pre-authored failing test.

The incident branch is reversible and is not merged into `main`.

## Judged live-integration context

For the recording, use:

```text
JARVIS_DEMO_MODE=false
```

Seed a Google account you own with a harmless synthetic Atlas client thread and Calendar event, then use the real Gmail/Calendar APIs against that data. Full setup/reset instructions are in [`live-demo-setup.md`](live-demo-setup.md).

`JARVIS_DEMO_MODE=true` remains useful only for deterministic local UI/orchestration development. Synthetic fixtures must never be presented as a live provider call.

## Preflight invariant

Before a full rehearsal/recording:

```bash
npm run check
npm run build
npm run doctor
```

Do not continue with a judged “successful” run while doctor reports a blocker. In particular, doctor must confirm the exact allowlisted repository, the `demo/client-regression` base branch, authenticated GitHub MCP access and the isolated 6 MiB → 1 MiB regression.

## Evidence and truthfulness rules

Jarvis may summarize evidence but must not invent it.

- “Client reported” is not the same as “reproduced.”
- “Existing tests pass” is not the same as “client requirement verified.”
- “Proposed patch” is not the same as “verified fix.”
- “Approval requested” is not the same as “external action completed.”

The control center keeps the underlying technical trace visible below its mission-level summary.

## Human-control and reconnect boundary

Read operations may run autonomously. Sending email, moving Calendar events and publishing a verified fix remain approval-gated in TrueForge.

A pending approval checkpoint is saved in tab-scoped `sessionStorage` and can be restored after a refresh in the same tab. This is deliberately narrower than arbitrary active-stream replay: Jarvis does **not** claim to reconstruct missing mid-tool events after an arbitrary disconnect or to resume approvals across devices/tabs.

Explicit voice approval uses the same TrueForge approval path as the UI buttons. Ambiguous phrases are not authorization.

## Credential boundary

Credentials stay in the component that needs them:

- Google OAuth secrets: Google Workspace MCP process;
- GitHub PAT: GitHub MCP process;
- OpenAI key: orchestrator;
- model/MCP credentials: harness;
- Daytona sandbox: no account/model/MCP credentials.

## Scope rule

Until submission is complete, a feature belongs in the hackathon build only if it makes this golden mission more reliable, understandable, safe, or visibly powered by TrueForge.
