# Submission write-up

## What Jarvis does

Jarvis is a voice-enabled personal operations agent for the moments when one real-world change affects several systems. A command such as “I’m running one hour late—check what this affects and handle it” makes Jarvis inspect Gmail and Google Calendar, calculate conflicts, prepare the necessary communication and schedule changes, and stop for approval before performing them.

## How it uses TrueForge

TrueForge runs the complete agent loop. It connects to a purpose-built Google Workspace MCP server, delegates inbox and calendar analysis to subagents, provisions an isolated Daytona sandbox for time-zone and conflict calculations, streams every execution event to the control center, and persists the session. Most importantly, TrueForge—not frontend code—pauses `send_email` and `move_calendar_event` calls until the user sends an explicit approval event.

## Why we built it

Most personal AI products stop at suggestions, while unsafe agent demos hide actions behind a polished chat box. Jarvis makes execution inspectable. The interface shows what the harness is doing, what it is waiting on and the exact arguments of every proposed side effect.

## What was difficult

The most important engineering work was preserving TrueForge’s approval semantics through a custom UI. Approval events contain references to tool calls in earlier model events, so the streaming bridge maintains an event index, resolves the original tool name and arguments, and sends one correctly scoped decision per call when the user responds. Credentials are also isolated: Google secrets stay in the MCP process and never enter the model or Daytona sandbox.

## AI assistance disclosure

AI coding assistance was used. The participant reviewed and verified the architecture, source, tests and safety behavior and can explain the implementation and technical decisions.
