# Conversational performance telemetry

Jarvis keeps performance telemetry **local to the browser process** and records timing metadata only. It does not store or transmit command text, email content, recipients, calendar details, memory values, tool arguments, or tool results.

## What is measured

- neural STT request duration for the voice command immediately preceding a turn;
- command submission → first real TrueForge text/progress event;
- command submission → first tool start;
- command submission → first speech item queued for Jarvis voice;
- each completed tool's generic presentation duration (for example, `Searching Gmail`);
- approval click → successful approval-stream acceptance;
- total turn duration including any human approval pause.

The Systems rail shows a compact STT / TEXT / VOICE / TOTAL summary and the slowest completed tool for the current turn.

## UX targets

These are engineering targets rather than hard service guarantees because external APIs and network conditions vary:

| Metric | Target |
| --- | ---: |
| Mic stop → transcript | < 2s |
| Command → first TrueForge feedback | ~1.5s or less |
| Command → first Jarvis voice | ~1.5s or less |
| Approval click → accepted resume stream | ~500ms or less |
| Unexplained silence while work is running | never intentionally > 3s |

Tool durations are diagnostic rather than pass/fail thresholds. Rehearsals should use the slowest-tool timing and the TrueForge execution trace to identify redundant reads, sequential work that can run in parallel, or provider bottlenecks before changing the voice layer again.

## Reading the numbers

A slow `VOICE` value with a fast `TEXT` value points toward speech queue/rendering latency. A slow `TEXT` value points toward model/session startup. A slow tool with otherwise fast feedback is normally an external integration issue. A long `TOTAL` with low individual tool times often indicates unnecessary sequential tool calls or agent-loop overhead.

Resetting or starting a new Jarvis session clears the current timing snapshot. STT timing is one-shot: it is attached only to the next submitted turn, so a later typed command never inherits an old voice-transcription measurement.
