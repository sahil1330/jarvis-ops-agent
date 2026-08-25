# Interface design and accessibility evidence

## Design objective

Jarvis is designed around one question: **can a person understand and control an agent while it performs real work?** The interface therefore prioritizes execution state and consequences over conversational decoration. A user should be able to determine:

1. what they asked Jarvis to do;
2. which systems and subagents are working;
3. whether the harness is running, waiting, complete or unavailable;
4. the exact external change being proposed; and
5. whether anything has actually left their account.

The control center does not call Gmail or Calendar write APIs. It renders TrueForge events and returns a scoped approval decision to the paused TrueForge session.

## Information hierarchy

The desktop layout uses three stable regions:

- **Command** — voice/text input, a clear description of the safety promise and realistic starter commands.
- **Operations** — an always-visible live outcome above the ordered TrueForge, MCP, sandbox, subagent and tool trace.
- **Systems** — independent readiness labels for the harness, Gmail, Calendar and sandbox, plus the active safety policy and live/demo mode.

The live outcome never sits below the desktop fold. It shows working feedback immediately, retains tool-specific errors even when the agent continues, streams the final response in the same region and hosts any approval checkpoint. On smaller screens, starting a command scrolls this region into view. Operational errors and human checkpoints receive focus when they appear.

System readiness is not inferred from the TrueForge health check. Gmail, Calendar and Sandbox begin as **Not checked**, move to **Working** when their own operation starts and become **Available** or **Failed** only from that operation's result.

## Interaction states

| State | What the interface communicates | Available action |
|---|---|---|
| Checking | Harness health has not resolved; mode and agent identity remain unknown | Wait or start a new session |
| Ready | The command input and suggested tasks are available | Type, use voice input or choose a suggestion |
| Working | Header and live outcome report active execution; inputs are protected from duplicate submission | Watch the outcome and trace or cancel with New session |
| Approval needed | The proposed side effects and exact arguments are visible; no external write has happened | Deny or approve the displayed calls |
| Complete | Final response and token/cost metrics are visible | Review results or start a new session |
| Tool failed | A named persistent alert, failed trace step and per-system Failed state expose the error while Jarvis may still explain or recover | Read the reason, reconnect the service or retry |
| Error/unavailable | A textual fatal error is announced and the status is not presented as healthy | Read the reason and start a clean session |

Status is never communicated by colour alone. Text labels accompany system indicators, live execution phases and errors.

## Safety as an interface property

The approval card is intentionally visually distinct from ordinary agent output:

- it says **Human checkpoint** and **Permission required**;
- it states that nothing external happens before approval;
- it preserves every pending call rather than summarizing away arguments;
- email and calendar calls receive the correct per-action icon and name;
- Deny is a first-class action, not a small secondary link; and
- keyboard focus moves to the checkpoint heading when it appears.

These interface choices expose the TrueForge approval boundary without pretending the browser enforces it. TrueForge remains the enforcement layer.

## Accessibility implementation

The interface targets WCAG 2.2 AA principles without claiming formal conformance certification.

| Concern | Implemented evidence |
|---|---|
| Structure | Header, main, footer, labelled sections and a skip link provide predictable landmarks. |
| Keyboard access | Native controls, visible focus rings, a skip link and `Ctrl/⌘ + Enter` command submission are supported. |
| Critical focus | Operational errors and the approval heading receive programmatic focus when attention becomes necessary. |
| Accessible names | The command input, voice toggle, system rail, suggested commands and action controls have explicit or visible names. |
| Dynamic updates | Harness status, speech state, execution trace, agent response and errors use appropriate live/status semantics. |
| Non-colour communication | Every system dot and execution phase has a visible text label. |
| Motion | `prefers-reduced-motion` removes non-essential animation. |
| Target size | Primary interactive controls use a minimum 44px height; starter commands use at least 48px. |
| Legibility | Auxiliary text was raised from 8–9px to 10–11px and low-emphasis colours were strengthened. |

`axe-core` runs in Vitest/JSDOM against both the idle application shell and the approval checkpoint. JSDOM cannot calculate real rendered colour contrast, so the automated check disables only that rule; keyboard behavior, responsive layout, screen-reader announcements and contrast still require manual browser review. Automated checks reduce regressions but do not replace testing with assistive technology.

## Responsive behavior

- **Wide desktop:** command, live outcome, trace and systems remain simultaneously visible for judging and operational awareness.
- **Tablet:** command and operations stay side-by-side while systems collapse into a horizontal rail.
- **Mobile:** regions stack in task order, the current harness status remains visible and the live outcome is brought into view when execution begins.

The interface keeps the same action names, approval language and safety model across screen sizes. Mobile is a reflow, not a reduced-capability version.

## Visual language

The dark operations-console aesthetic separates three semantic colour roles:

- mint for ready, safe and active states;
- amber for waiting and human approval; and
- red for errors and denied/unsafe outcomes.

Colour reinforces the written state but never replaces it. Typography pairs a readable sans-serif for commands and results with a restrained monospace face for system metadata. Borders and spacing establish hierarchy without enclosing every item in a decorative card.

## Verification and limitations

The repository verifies the UI with:

- component tests for exact approval arguments and user decisions;
- protocol and interaction tests that preserve a failed Gmail call alongside the eventual agent response;
- focus behavior at the approval checkpoint;
- `axe-core` semantic checks for the idle shell and approval state;
- TypeScript type checking; and
- a production Vite build in GitHub Actions.

Known limitations are disclosed rather than hidden:

- browser speech recognition support varies and the text input remains the reliable fallback;
- the current automated environment cannot validate rendered colour contrast;
- a full screen-reader/browser compatibility matrix is outside the hackathon scope; and
- real Google data must be demonstrated carefully so the recording exposes no unrelated personal information.
