# Three-minute demo script

## 0:00–0:20 — The problem

“Personal assistants can draft text, but they usually cannot safely act. Jarvis connects the systems I already use while keeping me in control of every external change.”

Show the control center with **LIVE ACCOUNT** and all systems ready.

## 0:20–0:40 — The architecture

Briefly show the README diagram and agent manifest:

- Google Workspace through MCP
- Code in a Daytona sandbox
- Dynamic subagents
- Explicit TrueForge approval policies

## 0:40–1:45 — Give Jarvis a real task

Use voice input:

> I’m running one hour late. Check what this affects and handle it.

Keep the live trace visible while highlighting:

1. TrueForge session start
2. MCP initialization
3. Inbox and calendar subagents
4. Sandbox creation and scheduling calculation
5. Tool responses using owned account data

Do not expose unrelated personal messages or private event details.

## 1:45–2:25 — Human checkpoint

When TrueForge pauses, show:

- exact recipient and subject
- exact calendar change
- Allow and Deny controls
- no external action has happened yet

Approve the prepared actions. Point out that the UI sends `user.tool_approval`; it does not call Google directly.

## 2:25–2:45 — Confirm the result

Show the successful tool response, the updated event or sent test email, and the final audit trace. Mention that the session persists across reconnects.

## 2:45–3:00 — Close

“TrueForge provides the parts that turn this from a chatbot into an assistant I can trust: real tools, isolated execution, delegation, durable state and a mandatory human checkpoint.”
