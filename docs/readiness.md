# Jarvis live-demo readiness

Run the read-only preflight after TrueForge and the MCP service are started and before every judged demo or recording:

```bash
npm run doctor
```

The doctor never sends email, moves calendar events, or writes memory. It verifies:

- required secret/config presence without printing secret values;
- `JARVIS_DEMO_MODE=false` for the live integration demo;
- `GOOGLE_USER_EMAIL=me` for normal personal OAuth;
- TrueForge `/healthz` and Jarvis agent registration;
- Google Workspace MCP `/healthz`;
- Google OAuth refresh plus harmless Gmail profile and Calendar event reads;
- OpenAI Realtime and STT model accessibility;
- persistent-memory file or parent storage permissions.

A successful run ends with:

```text
READY FOR LIVE DEMO
```

Any failed check exits non-zero and prints a focused remediation. Provider/API errors are bounded and credential-like values are redacted.

For UI-only development, `npm run doctor -- --allow-demo` permits demo mode but still reports it as a warning.

The doctor intentionally does not exercise external write actions or create billable Realtime speech. Gmail sending and calendar moves remain part of the explicit approval-gated end-to-end demo checklist.
