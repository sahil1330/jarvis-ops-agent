# Live demo data and reset guide

The judged run should use **real APIs with synthetic data you control**. This guide keeps the recording deterministic without exposing a personal inbox/client repository or pretending demo fixtures are live integrations.

## 1. Google account

Use a Google account you own and have added as an OAuth test user for the configured Google Cloud project.

Jarvis currently requests:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events
```

The refresh token in `.env` must belong to this same account. Gmail runtime addressing is always `users/me`.

### Synthetic client thread

Create a real Gmail conversation that Jarvis may safely show in the recording. A suggested subject/body is:

**Subject**

```text
Atlas demo checklist — resume upload issue
```

**Body**

```text
Hi Sahil,

For the Atlas product demo today, please make sure we can show:

1. PDF resume uploads around 5 MB. A larger resume failed when I tried it yesterday.
2. Job recommendations for a TypeScript / Node.js profile.
3. The resume_uploaded analytics event.

Thanks,
Ava
```

A message from another account you control is ideal because it looks like a real client thread while containing no private client information. Sending the synthetic message to yourself from another owned account is enough; do not commit message IDs or content from the real mailbox.

### Synthetic Calendar event

Create a same-day event around the time referenced in your spoken objective, for example:

```text
Title: Atlas product demo
Time: 3:00 PM – 3:30 PM
Attendees: only test/owned addresses
Description: Synthetic hackathon demo meeting
```

If you record at a different hour/day, keep the spoken objective and calendar seed consistent. The point is that Jarvis discovers the deadline from a live Calendar read rather than from hard-coded fixture data.

## 2. GitHub controlled regression

The submitted `main` branch is healthy. The engineering incident lives only on:

```text
repository: sahil1330/jarvis-ops-agent
branch: demo/client-regression
```

Expected difference from its parent:

```diff
- const MAX_RESUME_BYTES = 6 * 1024 * 1024;
+ const MAX_RESUME_BYTES = 1 * 1024 * 1024;
```

The regression tip must change exactly `demo-lab/src/product.js` and nothing else.

Configure:

```text
JARVIS_GITHUB_REPOSITORY=sahil1330/jarvis-ops-agent
JARVIS_GITHUB_BASE_BRANCH=demo/client-regression
```

Use a fine-grained GitHub token restricted to this repository with only the permissions required to read repository contents/metadata and create branch/commit/pull-request changes for the demo. Never put the token in the sandbox or browser.

## 3. Before every rehearsal

Start the services:

```bash
npm run trueforge
npm run dev
```

`npm run dev` starts the Google MCP, GitHub MCP, orchestrator, and control center in one terminal. Leave TrueForge in its own process; it is the harness, not one of the Jarvis workspace servers.

Run the deterministic gates:

```bash
npm run check
npm run build
npm run doctor
```

Do not continue until `doctor` confirms the exact golden repository/branch and the isolated 6 MiB → 1 MiB regression.

Then confirm the live Google data with a harmless read (through Jarvis or the provider UI) and start a **New session** in the control center.

## 4. Reset after a rehearsal

`publish_verified_fix` opens a new `jarvis/...` branch and PR **without modifying `demo/client-regression`**, so the incident itself remains reusable.

Before another full rehearsal:

1. Close any repair PR created only for the previous rehearsal if you no longer need it.
2. Delete its `jarvis/...` repair branch from GitHub so a repeated model-selected branch name cannot collide.
3. Leave `demo/client-regression` unchanged.
4. Run `npm run doctor` again.
5. Start a New session in the control center.

Do not merge the repair PR into `demo/client-regression` before the judged recording; doing so would remove the incident that Jarvis is meant to discover.

## 5. Recording privacy check

Before screen recording:

- hide unrelated browser tabs and notifications;
- ensure Gmail search results contain only synthetic/owned content relevant to the mission;
- ensure Calendar attendees/descriptions are synthetic;
- never show `.env`, OAuth screens containing secrets, PAT values, MCP bearer tokens, local memory files, or provider dashboards with credentials;
- keep `JARVIS_DEMO_MODE=false` for the judged live-integration run;
- if an integration fails, stop and fix it rather than editing the video to imply success.
