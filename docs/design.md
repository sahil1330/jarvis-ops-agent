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
- **Execution trace** — ordered TrueForge, MCP, sandbox, subagent and tool activity with explicit running, waiting and completed states.
- **Systems** — readable availability labels for the harness, Gmail, Calendar and sandbox, plus the active safety policy and live/demo mode.

The result dock appears only when there is output, an error or a decision to make. A human checkpoint receives focus as soon as it appears and shows the original tool name and arguments before presenting Deny and Approve controls.

## Interaction states

| State | What the interface communicates | Available action |
|---|---|---|
| Checking | Harness health has not resolved; mode and agent identity remain unknown | Wait or start a new session |
| Ready | The command input and suggested tasks are available | Type, use voice input or choose a suggestion |
| Working | Header and trace report active execution; inputs are protected from duplicate submission | Watch the trace or cancel with New session |
| Approval needed | The proposed side effects and exact arguments are visible; no external write has happened | Deny or approve the displayed calls |
| Complete | Final response and token/cost metrics are visible | Review results or start a new session |
| Error/unavailable | A textual error is announced and the status is not presented as healthy | Read the reason and start a clean session |

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
| Critical focus | The approval heading receives programmatic focus when a human decision becomes necessary. |
| Accessible names | The command input, voice toggle, system rail, suggested commands and action controls have explicit or visible names. |
| Dynamic updates | Harness status, speech state, execution trace, agent response and errors use appropriate live/status semantics. |
| Non-colour communication | Every system dot and execution phase has a visible text label. |
| Motion | `prefers-reduced-motion` removes non-essential animation. |
| Target size | Primary interactive controls use a minimum 44px height; starter commands use at least 48px. |
| Legibility | Auxiliary text was raised from 8–9px to 10–11px and low-emphasis colours were strengthened. |

`axe-core` runs in Vitest/JSDOM against both the idle application shell and the approval checkpoint. JSDOM cannot calculate real rendered colour contrast, so the automated check disables only that rule; keyboard behavior, responsive layout, screen-reader announcements and contrast still require manual browser review. Automated checks reduce regressions but do not replace testing with assistive technology.

## Responsive behavior

- **Wide desktop:** command, trace and systems remain simultaneously visible for judging and operational awareness.
- **Tablet:** command and trace stay side-by-side while systems collapse into a horizontal rail.
- **Mobile:** regions stack in task order, but the current harness status remains visible in the header instead of disappearing.

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
- focus behavior at the approval checkpoint;
- `axe-core` semantic checks for the idle shell and approval state;
- TypeScript type checking; and
- a production Vite build in GitHub Actions.

Known limitations are disclosed rather than hidden:

- browser speech recognition support varies and the text input remains the reliable fallback;
- the current automated environment cannot validate rendered colour contrast;
- a full screen-reader/browser compatibility matrix is outside the hackathon scope; and
- real Google data must be demonstrated carefully so the recording exposes no unrelated personal information.
