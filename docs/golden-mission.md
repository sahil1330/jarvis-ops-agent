# Jarvis Golden Mission

## Objective

The hackathon demo is built around one objective-driven command:

> "Jarvis, I have my client demo at 3 PM. Make sure I'm ready."

Jarvis must turn that outcome into observable, evidence-backed work rather than a sequence of user-authored app commands.

## Mission contract

1. Find the relevant meeting in Calendar.
2. Find the relevant client conversation in Gmail.
3. Read the complete bounded thread when a search result is relevant.
4. Extract the concrete demo acceptance criteria.
5. Delegate engineering verification to a separate subagent.
6. Use an isolated sandbox to reproduce any reported software problem against an exact repository revision.
7. Do not call a problem fixed until the reproduction and regression suite pass after the patch.
8. Present evidence and the exact external action before requesting approval.
9. Publish the verified fix only after TrueForge emits and resolves a human approval checkpoint.
10. Finish with a concise readiness briefing that separates verified facts, actions taken, and anything still pending.

## Deterministic rehearsal context

`JARVIS_DEMO_MODE=true` provides synthetic mission context for local UI and orchestration rehearsal:

- Calendar: **Atlas Product Demo**, starting roughly 90 minutes from process start.
- Client thread: Ava asks Jarvis to verify a roughly 5 MB PDF resume upload, job recommendations, and analytics events.
- Build message: the existing suite is green but explicitly does not cover untested file sizes.

The synthetic context contains no private user data. It exists to make failure cases and UI development repeatable. The final judged recording must follow the hackathon rules for real tool usage and authorized systems.

## Evidence standard

Jarvis may summarize evidence but must not invent it. Engineering claims require sandbox output tied to an exact repository SHA. A passing pre-existing test suite is not proof that a client-reported edge case works. The engineering agent must create or run a targeted reproduction first.

## Safety boundary

Read operations may run autonomously. Publishing code, sending email, or changing calendar state remains approval-gated in TrueForge. Credentials must stay in their connector processes and never enter the browser, model context, voice renderer, or sandbox.

## Scope rule

Until the submission is complete, a feature belongs in the hackathon build only if it makes this golden mission more reliable, understandable, safe, or visibly powered by TrueForge.
