# Submission write-up

## What Jarvis does

Jarvis is a voice-first personal operations agent that accepts an objective rather than a sequence of app commands.

The hackathon build is centered on one mission:

> **“Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”**

From that one instruction Jarvis can discover the relevant meeting, understand the client’s explicit requirements from Gmail, inspect the exact revision of an allowlisted GitHub repository, delegate engineering verification to an isolated sandbox, reproduce a missing edge case, prepare and verify a fix, and stop before publishing anything until the user approves the exact action.

## The golden loop

The controlled demo client asks for three capabilities:

1. a roughly 5 MB PDF resume upload;
2. job recommendations;
3. analytics events.

The submitted `main` branch contains a healthy, dependency-free `demo-lab/`. A separate authorized throwaway branch, `demo/client-regression`, lowers only the resume upload ceiling from 6 MiB to 1 MiB. Its ordinary baseline tests remain green because the client-specific 5 MB positive case is not pre-authored.

Jarvis therefore cannot call the build ready by running existing tests. It must derive a targeted reproduction from the Gmail requirement, reproduce the `413` failure in Daytona, diagnose the limit regression, patch it, then prove the targeted reproduction and broader suite pass afterward.

Only then may the agent propose `publish_verified_fix`. TrueForge pauses the call for human approval. After approval, the purpose-built GitHub MCP creates a repair branch, commit and pull request; it has no merge operation.

## How TrueForge is central

TrueForge runs the execution loop rather than sitting behind a chat wrapper:

- persistent agent sessions and streamed turn events;
- MCP routing to two purpose-built authenticated connectors;
- dynamic subagents for independent context/requirements work and substantial engineering analysis;
- isolated Daytona sandbox / Code Mode for real code and test execution;
- human approval enforcement through `requireApprovalForTools`;
- context management for large tool responses;
- execution events that drive the live mission/technical trace UI.

The external writes named in the manifest are:

- `send_email`
- `move_calendar_event`
- `publish_verified_fix`

The control center may submit a user decision, but it cannot bypass TrueForge and invoke those writes directly.

## Human control and voice

When an operation is paused, the UI displays the exact pending tool arguments and Allow/Deny controls. The user may also say an explicit phrase such as **“Approve it”** or **“Deny it.”**

Voice approval is not a second LLM judgment. A deliberately small deterministic phrase parser maps only explicit allow/deny phrases to the same existing `user.tool_approval` path as the buttons. Ambiguous phrases do not approve.

If the browser is refreshed while paused, the same tab can restore the TrueForge session ID and the exact validated approval checkpoint. This recovery is intentionally scoped to the human checkpoint; Jarvis does not claim arbitrary replay of missed in-flight sandbox/tool stream events.

## Interface

The control center has two complementary views:

- **Mission progress:** Context → Requirements → Verify → Action.
- **Technical evidence:** the underlying TrueForge MCP/subagent/sandbox/tool trace.

The mission view is derived from execution evidence and is deliberately conservative. For example, creating a sandbox does not mark verification complete.

The Systems rail shows TrueForge, Gmail, Calendar, GitHub and Sandbox independently. GitHub changes state only when the real `get_repository_snapshot` or `publish_verified_fix` tool identity appears in the trace. Tool failures remain visible and cause the final status to say **Completed with issues** instead of presenting a false clean success.

## Safety architecture

Credentials are compartmentalized:

- Google OAuth credentials stay in the Google Workspace MCP process.
- The fine-grained GitHub PAT stays in the separate GitHub MCP process.
- The OpenAI voice key stays in the orchestrator.
- Daytona receives no Google, GitHub, MCP, model or voice credentials.
- OpenAI Realtime is a voice renderer only and has no tool authority.

The GitHub connector is intentionally narrow: fixed repository/base configuration, writes only under `demo-lab/`, bounded file payloads, safe Git ref names, stale-base revalidation, cleanup on PR failure, and no merge tool.

The local hackathon runtime binds the orchestrator/MCP services to loopback. A public multi-user product would need an end-user authenticated application boundary and is outside this submission.

## Deterministic readiness

Before recording, `npm run doctor` checks the real integration boundary without performing external writes. In addition to the earlier Google/model/voice checks, the GitHub preflight verifies:

- the dedicated GitHub MCP bearer can pass its authentication boundary;
- loopback-only exposure;
- exact repository allowlist;
- exact `demo/client-regression` branch;
- immutable branch tip SHA;
- the regression tip changes exactly one file;
- parent has the healthy 6 MiB limit and tip has the isolated 1 MiB limit.

`npm run check` also runs the healthy `demo-lab` baseline suite.

## What was difficult

The difficult work was not generating an email or changing a constant. It was preserving trustworthy agent semantics across a custom experience:

- reconstructing TrueForge approval references without giving the browser write authority;
- ensuring an accepted approval cannot become retryable after a later stream failure;
- binding delayed speech results to the exact checkpoint they were captured for;
- making refresh recovery validate serialized state rather than trusting TypeScript casts;
- making mission progress conservative enough that infrastructure activity cannot masquerade as verification;
- creating a deterministic regression scenario without merging known-broken code into the submission branch;
- keeping GitHub publication safe under stale-base races and partial API failures.

Qodo reviews repeatedly surfaced correctness/reliability issues in these boundaries, and the findings were fixed before merge rather than dismissed.

## AI assistance disclosure

AI coding assistance was used during implementation. The participant reviewed the architecture, code, tests, safety boundaries, Qodo findings and final technical decisions and remains responsible for the submission.
