# Architecture and trust boundaries

Jarvis is intentionally local-first for the hackathon. The browser is an interface to TrueForge execution; it is not an authority that can directly call Gmail, Calendar, GitHub, or the sandbox.

## Runtime components

| Component | Responsibility | Secrets / authority |
|---|---|---|
| Control center | Voice/text input, mission progress, technical trace, approval UI, paused-checkpoint recovery | No provider or account credentials |
| Orchestrator | TrueForge SDK session/turn streaming, `user.tool_approval`, STT/TTS/Realtime bridge | OpenAI key; optional TrueForge token |
| TrueForge | Model loop, dynamic subagents, MCP routing, sandbox lifecycle, context/session state, approval enforcement | Model/provider and connector configuration |
| Google Workspace MCP | Gmail search/thread read, email send, Calendar read/move, explicit bounded memory tools | Google OAuth credentials + dedicated MCP bearer |
| GitHub operations MCP | Permission-aligned repository, PR, Actions, environment and agent-task operations against one allowlisted repository | Fine-grained GitHub token + separate MCP bearer; all writes approval-gated |
| Daytona sandbox | Isolated code/test execution against the exact evidence SHA | No Google/GitHub/model/voice credentials |
| `demo-lab/` | Small deterministic product fixture used by the engineering verification loop | No secrets / external services |

## Objective execution

The golden mission is:

> “Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”

The TrueForge instructions organize the mission as:

```text
CONTEXT → REQUIREMENTS → VERIFY → ACTION
```

1. **Context** — Calendar evidence identifies the meeting/deadline.
2. **Requirements** — Gmail evidence identifies the relevant bounded client thread and explicit acceptance criteria.
3. **Verify** — GitHub returns the configured repository/base SHA. An engineering subagent uses the sandbox against that revision, creates/runs a targeted reproduction, diagnoses the regression, proposes a patch and reruns targeted + broader tests.
4. **Action** — only after verification evidence exists, Jarvis proposes the external publication. TrueForge pauses before `publish_verified_fix`.

The mission UI is derived from execution evidence; the complete technical TrueForge trace remains visible underneath. Sandbox creation itself is never treated as proof that a bug was verified.

## Healthy submission vs controlled incident

The submitted `main` branch keeps `demo-lab/` correct:

```text
MAX_RESUME_BYTES = 6 MiB
```

The live demo uses a separate authorized throwaway branch:

```text
demo/client-regression
MAX_RESUME_BYTES = 1 MiB
```

The regression branch has one parent and changes only `demo-lab/src/product.js`. The ordinary baseline tests remain green there because the client-specific ~5 MB positive case is intentionally not pre-authored. Jarvis must derive that missing reproduction from the client requirement.

`npm run doctor` independently verifies this invariant before rehearsal: exact repository allowlist, exact regression branch, authenticated GitHub MCP bearer, immutable branch SHA, single-file commit scope, and the 6 MiB → 1 MiB transition.

## Approval flow

External writes are named in the TrueForge agent manifest:

- `send_email`
- `move_calendar_event`
- all GitHub mutation tools, including verified-fix publication, PR updates/reviews, Actions dispatch/rerun/cancel, environment configuration, and agent-task start

The approval sequence is:

1. The model proposes an external write.
2. TrueForge emits `tool.approval_required` without executing it.
3. The orchestrator resolves each reference against the original `model.message`, preserving the real tool name and serialized arguments.
4. The control center renders those exact arguments.
5. The user chooses Allow/Deny, or while paused says an explicit voice phrase such as **“Approve it”** / **“Deny it.”**
6. Voice approval is parsed by a small deterministic vocabulary. Ambiguous phrases such as “okay” do not approve.
7. The control center sends the same `user.tool_approval` event path used by the buttons.
8. TrueForge—not frontend code—decides whether the pending MCP call may execute.

A denial is terminal for that tool call.

## Refresh recovery boundary

The browser keeps the TrueForge session ID in tab-scoped `sessionStorage`. Only a **paused approval checkpoint** is persisted for visual recovery: pending approval identifiers, visible response text, and bounded technical trace.

On refresh in the same tab, the control center validates the stored runtime shape before restoring it. Malformed data is discarded. Approval identity includes the original thread/tool-call IDs, and captured voice transcripts are tied to the exact checkpoint identity that existed when recording began.

This is deliberately narrower than arbitrary stream replay. The hackathon build does **not** claim to reconstruct missed in-flight sandbox/tool events after a refresh during active execution.

## Google trust boundary

- Gmail always addresses the account authenticated by the OAuth token through `users/me`.
- The Google refresh token never enters the browser, model prompt, voice renderer, or Daytona sandbox.
- Gmail/Calendar write tools are reachable only through the authenticated Google MCP.
- Thread bodies are bounded and MIME-decoded defensively; explicit memory is bounded and secrets are rejected.

## GitHub trust boundary

The GitHub MCP is a separate process/listener/credential from the Google MCP.

- The configured repository is fixed by environment and not supplied by the model.
- The golden demo doctor additionally pins it to `sahil1330/jarvis-ops-agent`.
- `get_repository_snapshot` is read-only and returns the exact configured base SHA.
- `list_pull_requests` is the authoritative authenticated route for open or remaining PR status; a snapshot is never treated as PR evidence.
- Bounded read tools cover repository text files, pull requests/files/reviews, Actions workflows/runs/jobs, environments, and Copilot agent tasks.
- Permission-aligned mutations cover PR metadata/reviews, workflow dispatch/rerun/cancel, environment configuration, and agent-task start, and all require TrueForge approval.
- `publish_verified_fix` only accepts files below `demo-lab/`, bounded count/content sizes, and `jarvis/…` branch names that satisfy Git ref restrictions.
- The base branch is rechecked immediately before making the fix commit visible through a branch.
- Failed PR creation cleans the new branch created by the attempt.
- The connector has no merge, delete, secrets, or unrestricted code-write operation.
- The GitHub PAT remains only in the GitHub MCP process. The sandbox works with public source/evidence, not that credential.

## Voice boundary

OpenAI Realtime is a renderer, not a second Jarvis agent. It receives only natural-language text already emitted by TrueForge and has no Gmail, Calendar, GitHub, memory, sandbox or approval tools.

Input uses browser recording/VAD and neural STT when available. Cancelling/resetting invalidates pending microphone-permission, recording and transcription generations so delayed browser callbacks cannot revive a cancelled microphone or resolve an obsolete approval.

## Network boundary

For the hackathon build:

- orchestrator defaults to `127.0.0.1`;
- Google MCP defaults to `127.0.0.1:8788`;
- GitHub MCP defaults to `127.0.0.1:8789`;
- each MCP has a distinct bearer credential;
- `npm run doctor` blocks non-loopback exposure of the write-capable local services.

The current browser/orchestrator path does not implement end-user multi-tenant HTTP authentication. Therefore public/multi-user deployment is intentionally outside this submission boundary.

## Data-flow guarantees

- Credentials are never committed and are redacted from readiness diagnostics.
- The browser cannot directly invoke Google/GitHub writes.
- The sandbox receives no Google, GitHub, MCP, model or voice credentials.
- Tool failures remain visible in the outcome/Systems UI rather than being flattened to successful-looking trace entries.
- GitHub Systems state changes only when the actual GitHub MCP tool identities appear in the TrueForge trace.
- Deterministic demo fixtures are labeled and are for development/rehearsal; the judged live-tool recording should use authorized synthetic account data with live APIs.
