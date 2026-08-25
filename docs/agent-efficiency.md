# Agent-loop efficiency policy

Jarvis optimizes for the **shortest trustworthy path** to the user's requested outcome, not for the largest number of visible tool calls.

## Read planning

Before calling tools, the root agent determines which connected systems are actually required and the relevant time window. Independent Gmail and Calendar work should begin in parallel when both are necessary.

A successful read is reused for the rest of the current turn. Jarvis should not repeat an equivalent Gmail query, Calendar window, or memory lookup unless:

- a write changed the underlying data;
- the prior read failed or was materially incomplete; or
- new information changes what must be fetched.

This is an agent policy rather than an application cache. Every tool result shown in the trace still represents a real tool invocation, and fresh data is never silently replaced with stale cached data.

## Expensive capabilities

Persistent memory is recalled only when personalization can materially affect the plan. Dynamic subagents are used for actual parallelism/substantial isolated analysis rather than one trivial read. Daytona/Code Mode is reserved for conflict calculations, comparing windows, time-zone normalization, or other non-trivial structured analysis.

## Conversational progress

The root agent should briefly explain meaningful slow work. Runtime narration exists only as a truthful fallback when a read starts without a useful preamble.

Preamble suppression is system-aware. For example, if Jarvis says:

> I'll check your calendar and inbox in parallel.

then the following delegated Calendar and Gmail reads do not repeat those same announcements, even when unrelated subagent events interleave. A later system that was not covered by the preamble still receives a concise fallback narration.

## Measuring the result

Use the local timing telemetry in the Systems rail during rehearsals. A decreasing total turn time with the same successful tool evidence is a useful signal; removing safety checks, approval gates, or required data reads is not an acceptable optimization.
