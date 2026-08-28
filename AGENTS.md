# Jarvis Ops Agent — Codex Project Instructions

## Project purpose

This repository is the hackathon submission for The Agent Harness Hackathon 2026.

Jarvis is an objective-driven personal operations agent built around one golden mission:

> “Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”

The hackathon version is not a general personal-assistant platform. Until submission is complete, optimize only for making this golden mission more reliable, understandable, safe, and visibly powered by TrueForge.

Before modifying code, read:

1. `README.md`
2. `docs/golden-mission.md`
3. `docs/architecture.md`
4. `docs/live-demo-setup.md`
5. `docs/demo-script.md`
6. `docs/submission.md`
7. `SECURITY.md`
8. `.env.example`
9. `docs/hackathon_rules.md`

Treat those files as the source of truth.

## Golden mission

The execution model is:

`CONTEXT → REQUIREMENTS → VERIFY → ACTION`

### Context

Use Calendar to discover the relevant meeting and deadline.

### Requirements

Use Gmail search and bounded thread retrieval to discover the client's explicit acceptance criteria.

The controlled Atlas scenario requires:

* roughly 5 MB PDF resume upload;
* job recommendations;
* analytics event capture.

Do not invent extra requirements.

### Verify

Use the allowlisted GitHub repository snapshot and its exact base SHA.

Delegate engineering verification to a TrueForge subagent using Daytona.

The engineering evidence standard is strict:

1. Work against the exact repository SHA.
2. Existing baseline tests should initially pass.
3. Derive a targeted reproduction from the client requirement.
4. Reproduce the client issue before editing.
5. Diagnose the cause.
6. Prepare the minimal patch.
7. Targeted reproduction must pass after the patch.
8. The broader regression suite must still pass.

Never call an issue “verified fixed” without this failure-before / pass-after evidence.

### Action

Only after verification should Jarvis propose publishing the fix.

`publish_verified_fix` is an approval-gated TrueForge tool.

It may create:

* a `jarvis/...` branch;
* a commit;
* a pull request.

It must never merge the pull request.

## Controlled regression

The submitted `main` branch must remain healthy.

The hackathon incident exists only on:

`demo/client-regression`

Repository:

`sahil1330/jarvis-ops-agent`

Healthy `main` behavior:

`MAX_RESUME_BYTES = 6 MiB`

Controlled regression:

`MAX_RESUME_BYTES = 1 MiB`

The regression branch should modify only:

`demo-lab/src/product.js`

Do not fix, merge, delete, or otherwise destroy `demo/client-regression` unless explicitly instructed.

The repair produced during a rehearsal must be published as a separate branch/PR.

## TrueForge must remain central

The submission must visibly demonstrate:

* real MCP tool calls;
* dynamic subagents;
* code executed in the Daytona sandbox;
* persistent TrueForge session identity;
* streamed execution evidence;
* a human approval checkpoint before an irreversible action.

Do not replace TrueForge behavior with frontend shortcuts, mocked execution, direct API calls from the browser, or deterministic fake success states.

The UI should show what actually happened in the TrueForge execution trace.

## Human approval

The frontend must not directly perform external writes.

TrueForge owns the approval boundary.

Approval decisions go through the existing `user.tool_approval` / `resolveApproval` path.

Voice approval is intentionally narrow:

Allowed examples:

* “Approve it”
* “Deny it”

Ambiguous phrases such as:

* “okay”
* “sounds good”
* “continue”

must not authorize an action.

A denied action must not be retried or bypassed.

## Refresh/reconnect claim

The current UI supports same-tab recovery of a **paused approval checkpoint**.

It preserves:

* TrueForge session ID;
* visible bounded response/trace;
* pending approval call IDs;
* approval card.

Do not claim or implement fake arbitrary mid-stream replay.

The demo explicitly states that active sandbox/tool-stream replay is not currently claimed.

## Security boundaries

Google credentials belong only in the Google Workspace MCP process.

GitHub credentials belong only in the GitHub MCP process.

OpenAI credentials belong only in the orchestrator.

The Daytona sandbox must receive no Google OAuth credentials, GitHub PAT, MCP bearer token, model provider credentials, or voice credentials.

The browser must not contain provider credentials.

The Realtime voice path is a renderer, not another autonomous agent and has no tool authority.

Local write-capable services stay on loopback.

Never commit `.env`, credentials, refresh tokens, PATs, inbox data, Calendar data, or memory data.

## Live judged demo

The judged demo should use:

`JARVIS_DEMO_MODE=false`

Use real Gmail, Calendar, GitHub, TrueForge and Daytona calls, but only synthetic/authorized data owned by the participant.

Do not expose unrelated personal email or calendar data.

Before rehearsal/recording:

```bash
npm run check
npm run build
npm run doctor
```

All three must pass.

If `doctor` reports a failure, fix the environment rather than bypassing the check.

## Hackathon workflow

Every substantive code change must follow:

1. Create a feature/fix branch.
2. Implement the smallest focused change.
3. Run relevant tests.
4. Open a GitHub pull request.
5. Trigger Qodo review if needed with `/agentic_review`.
6. Fix every valid High-severity finding.
7. For any dismissed High finding, record the reason in the Qodo thread.
8. Request/review the follow-up Qodo result against the latest code.
9. Require CI to pass.
10. Only then merge.

Never make substantive direct pushes to `main`.

Documentation-only typo-level edits are still preferably done through PRs while the hackathon is active.

## Hackathon requirements

The official rules require:

* TrueForge as the agent harness;
* the harness visibly doing real work;
* substantive changes through Qodo-reviewed PRs;
* a public repository;
* runnable setup instructions;
* approximately three-minute demo video;
* short explanation of what the agent does and how TrueForge is used;
* Qodo Code Review Evidence in the README;
* only authorized tools/data/accounts;
* disclosure of AI coding assistance;
* participant understanding of the code.

Judging has six equally weighted criteria:

1. Potential impact
2. Creativity and originality
3. Technical excellence
4. Use of sponsor tools
5. Control and safety
6. Presentation

There are three tracks:

* Best Use of TrueForge
* Best Code Quality
* Best UI

The submission is considered for all three.

## Scope restrictions until submission

Do not add unless explicitly instructed:

* WhatsApp;
* SMS;
* phone calling;
* native mobile application;
* production multi-user authentication;
* public Google OAuth rollout;
* Postgres/Redis production migration;
* generic arbitrary-repository coding agent;
* automatic PR merge;
* broad cloud deployment work;
* unrelated assistant features.

Do not resume the abandoned “productionize everything” direction.

One excellent golden mission is more important than feature count.

## UI truthfulness

Mission stages and system statuses must derive from actual execution evidence.

Never display:

* “Verified” merely because a sandbox was created;
* “Available” when an MCP call failed;
* “Complete” when a GitHub publication failed;
* fake successful system state to improve the demo.

Technical trace stays visible beneath the product-level mission view.

## Definition of done for any Codex task

Before reporting a task complete:

1. Inspect the relevant architecture and existing tests.
2. Keep the change narrowly scoped.
3. Add or update regression tests when behavior changes.
4. Run:

```bash
npm run check
npm run build
```

5. For environment/rehearsal changes also run:

```bash
npm run doctor
```

6. Review `git diff` and ensure no secrets or unrelated changes are present.
7. Open a PR rather than pushing substantive work directly to `main`.
8. Complete the Qodo review loop before merge.
9. State exactly what was changed, what was verified, and anything still unverified.

If a blocker is solvable from the repository/environment, solve it rather than stopping merely to report it.

Do not weaken tests or readiness checks merely to obtain a green result.
