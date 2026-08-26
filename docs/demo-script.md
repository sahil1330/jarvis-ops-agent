# Three-minute judging demo

The recording should demonstrate one narrow objective end to end. Do not switch to unrelated feature demos unless there is spare time after the golden loop has completed.

## Before recording

Use an account and repository you are authorized to operate. Keep unrelated personal data out of view.

1. Confirm `.env` points the GitHub connector at:

```text
JARVIS_GITHUB_REPOSITORY=sahil1330/jarvis-ops-agent
JARVIS_GITHUB_BASE_BRANCH=demo/client-regression
```

2. In the Google account used for the recording, prepare synthetic Atlas context:
   - a calendar event around the recording time named **Atlas product demo**;
   - a client email/thread that explicitly asks to see a roughly **5 MB PDF resume upload**, **job recommendations**, and **analytics events**, and mentions that the larger resume failed previously.
3. Keep `main` healthy. The controlled regression must exist only on `demo/client-regression`, where `demo-lab/src/product.js` lowers `MAX_RESUME_BYTES` from 6 MiB to 1 MiB.
4. Start TrueForge, Google MCP, GitHub MCP, orchestrator, and control center.
5. Run:

```bash
npm run check
npm run build
npm run doctor
```

`doctor` must pass the real Google/provider checks plus the GitHub MCP bearer, repository allowlist, controlled branch SHA, and isolated 6 MiB → 1 MiB regression invariant. Do not record if any readiness check is red.

## 0:00–0:18 — Set the problem

Show the control center briefly.

> “Most assistants wait for app-by-app commands. Jarvis takes an objective, gathers evidence across my systems, verifies software claims in an isolated sandbox, and stops before any external write until I approve it.”

Keep **LIVE ACCOUNT** visible. Systems that have not yet been used should honestly show **Not checked**.

## 0:18–0:33 — One voice objective

Use the microphone:

> **“Jarvis, I have my client demo at 3 PM. Make sure I’m ready.”**

Do not add follow-up prompts that manually tell Jarvis which tools to use.

## 0:33–1:02 — Context and requirements

Let TrueForge run the independent work.

Show the Mission view moving through:

- **Context** — Calendar read finds the Atlas meeting/deadline.
- **Requirements** — Gmail search identifies the synthetic client thread and `get_email_thread` reads the bounded conversation.

Point out the subagent entries if Calendar and Gmail work run independently. The technical trace remains visible below the mission stages.

Expected extracted requirements:

1. roughly 5 MB PDF resume upload;
2. job recommendations;
3. analytics event capture.

## 1:02–1:50 — Evidence, not assumption

Show GitHub move from **Working** to **Available** when `get_repository_snapshot` returns the exact `demo/client-regression` SHA.

Let the engineering work continue in Daytona:

1. check out/work against that exact revision;
2. run the existing `demo-lab` baseline — it is green;
3. derive a targeted ~5 MB PDF reproduction from the client requirement;
4. reproduce the `413` failure;
5. diagnose the lowered upload ceiling;
6. prepare the minimal fix;
7. rerun the targeted reproduction;
8. rerun the broader baseline suite.

The key sentence for the recording:

> “The existing tests were green, so Jarvis had to create the missing client-specific reproduction before it was allowed to call the issue verified.”

Do not describe sandbox allocation itself as verification. Verification is complete only after the targeted failure-before / pass-after evidence and the broader suite remains green.

## 1:50–2:25 — Human checkpoint + truthful reconnect

When TrueForge pauses on `publish_verified_fix`, show the approval card. It should identify the exact pending tool arguments, including the base SHA and changed `demo-lab/` files.

At this point—and only while the operation is paused for approval—refresh the browser once.

The same tab should restore:

- the TrueForge session identifier;
- the visible response/technical trace saved with the checkpoint;
- the exact pending approval calls and tool-call IDs;
- the approval card.

Say explicitly:

> “Jarvis restores a paused approval checkpoint after refresh. I’m not claiming arbitrary replay of an in-flight sandbox stream.”

Then use the microphone and say:

> **“Approve it.”**

The phrase is parsed by a deliberately small approval vocabulary and sent through the same existing `resolveApproval` / `user.tool_approval` path as the button. It does not become a new model prompt.

## 2:25–2:48 — Real action

After TrueForge accepts the approval, show GitHub publication execute:

- branch created;
- verified `demo-lab/` file change committed;
- pull request opened against the controlled regression branch;
- no merge occurs.

The GitHub Systems row should reflect the actual tool trace. If publication fails, the UI must show **Failed** and the turn must not be presented as clean.

## 2:48–3:00 — Close

Show the final readiness brief:

- meeting/deadline;
- client requirements;
- what was reproduced;
- what was verified fixed;
- pull-request result;
- anything still unverified.

Close with:

> “TrueForge is the execution harness here: persistent sessions, real MCP tools, subagents, isolated code execution, streaming evidence, and a mandatory human checkpoint before the agent changes the outside world.”

## Recording rules

- Use synthetic/authorized Gmail and Calendar data even when the API calls are real.
- Never expose API keys, refresh tokens, PATs, MCP bearer values, unrelated inbox content, or local memory.
- Do not switch `JARVIS_DEMO_MODE=true` for the judged live-tool recording.
- Do not merge the repair PR during the video; opening the PR is the approved side effect.
- Do not claim active mid-tool browser replay; demonstrate the paused checkpoint recovery the application actually implements.
