# Jarvis failure and recovery matrix

A hackathon demo is only trustworthy when the failure states are as explicit as the happy path. Use this matrix during rehearsals after `npm run doctor` passes.

| Scenario | Expected Jarvis behavior | Evidence |
| --- | --- | --- |
| TrueForge offline | Health/status reports Harness unavailable/offline; no fake agent progress | Automated health tests + manual rehearsal |
| Google Workspace MCP offline | Turn surfaces connector/tool failure; no Google write is attempted through the UI | Existing runtime error propagation + manual rehearsal |
| Google refresh token invalid | Gmail/Calendar failure is named and preserved in the live outcome; `npm run doctor` blocks the demo first | Doctor + UI feedback tests |
| Gmail API unavailable/permission failure | Gmail becomes Failed; Jarvis may continue with unaffected systems but must not claim Gmail results | Runtime error tests + manual rehearsal |
| Calendar API unavailable/permission failure | Calendar becomes Failed; Jarvis may continue safely but must not claim calendar results | Runtime error tests + manual rehearsal |
| Legacy `GOOGLE_USER_EMAIL` literal value | Ignored; Gmail requests use OAuth-authenticated `users/me`; doctor warns to remove stale config | Automated doctor/Gmail regression tests |
| Realtime voice unavailable | Realtime attempt fails visibly in diagnostics and speech falls back to neural TTS | Voice hook tests + manual rehearsal |
| Neural TTS unavailable | Voice falls back to browser speech synthesis | Voice hook tests + manual rehearsal |
| Neural STT fails | Command remains usable through browser recognition or typing; no turn starts from an absent transcript | Manual rehearsal |
| Microphone permission denied | Clear input error; typing remains usable | Manual rehearsal |
| Mic/VAD unavailable after recording starts | Manual stop + 45-second hard cap remain available | Voice lifecycle tests |
| User presses New Session during speech | Current/queued speech and in-flight Realtime setup stop; stale session events are ignored | Voice/session cancellation tests |
| Approval denied | No email/calendar write occurs; Jarvis acknowledges the denial without retrying around it | Approval tests + live rehearsal |
| Approval request transport fails | Jarvis must not say “sending/updating now”; the action narration starts only after the approval stream is accepted | Approval regression from PR #14 |
| Gmail send fails after approval | Tool trace/system state show failure and Jarvis must not report success | Manual rehearsal with controlled failure |
| Calendar move fails after approval | Tool trace/system state show failure and Jarvis must not report success | Manual rehearsal with controlled failure |
| Memory file unavailable/unwritable | Doctor blocks the demo; agent’s Google tools remain separate from memory storage | Doctor + memory tests |
| Concurrent memory updates | All writes survive same-process concurrent MCP requests without temp-file collisions | Automated memory concurrency test |
| Very long streamed response | Visual reveal and speech continue across the rolling response cap without restarting/stalling | Streaming regression tests |
| Long tool loop | Jarvis gives truthful progress narration; local latency telemetry identifies the slowest tool/loop | Telemetry + agent-efficiency tests |
| Mobile viewport | Live outcome/approval is brought into view and no horizontal overflow hides the decision | Existing responsive evidence + manual browser check |

## Rehearsal rule

A failure counts as handled only if three things are true:

1. the UI clearly identifies the failed subsystem or action;
2. the spoken response does not claim work that did not happen; and
3. recovery never bypasses the TrueForge approval boundary.

Do not weaken or hide a failure to make the demo look cleaner. Fix the configuration/root cause or use a controlled, truthful fallback.

## Exposure rule

The orchestrator contains server-funded STT/TTS/Realtime endpoints and currently relies on a local application boundary rather than end-user HTTP authentication. For the hackathon desktop demo it therefore binds to `127.0.0.1` by default, and `npm run doctor` treats non-loopback exposure as a blocker. A future remote/mobile deployment must add proper authenticated application sessions and abuse/rate controls before changing this boundary.
