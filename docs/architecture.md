# Architecture and trust boundaries

## Runtime components

| Component | Responsibility | Holds secrets? |
|---|---|---|
| Control center | Command input, voice capture, trace rendering and approval UI | No |
| Orchestrator | TrueForge SDK session/turn streaming and approval responses | Optional TrueForge OIDC token |
| TrueForge | Model loop, MCP routing, subagents, sandbox lifecycle, approval enforcement and session state | Model/MCP configuration |
| Google Workspace MCP | Narrow Gmail/Calendar tools and Google token refresh | Google OAuth credentials |
| Daytona sandbox | Conflict calculation, time-zone normalization and Code Mode | No account credentials |

## Approval flow

1. The model proposes `send_email` or `move_calendar_event`.
2. The Jarvis agent manifest lists both under `requireApprovalForTools`.
3. TrueForge emits `tool.approval_required` without executing the call.
4. The orchestrator resolves each call reference against the original `model.message`, preserving the real tool name and serialized arguments.
5. The control center renders those exact arguments.
6. Allow or Deny returns one `user.tool_approval` item per pending call.
7. TrueForge—not the UI—decides whether the MCP tool may execute.

## Data flow guarantees

- Browser traffic contains tool arguments only when TrueForge has already paused the operation for that user.
- Google OAuth secrets remain server-side.
- MCP tool results stream back into TrueForge and are not written to this repository.
- The system has no endpoint that directly invokes Google write tools.
- Live/demo mode is visible in the UI to prevent accidental misrepresentation.

## Production direction

The hackathon build runs locally for a safe judging demonstration. A shared deployment should use TrueForge hosted mode with Postgres, Redis and OIDC enabled; the orchestrator and MCP server should sit behind authenticated HTTPS endpoints.
