# Security policy

## Sensitive data

Never commit `.env`, access tokens, refresh tokens, email contents, calendar exports or recordings containing private information. Use a dedicated test account and test recipients for the hackathon demonstration.

## Required deployment controls

- Keep local TrueForge bound to localhost.
- Generate a unique `JARVIS_MCP_BEARER_TOKEN` and rotate it if it is exposed.
- Keep the Google Workspace MCP bound to `127.0.0.1` unless it sits behind authenticated HTTPS.
- Use hosted TrueForge with OIDC before exposing it to a network.
- Serve the orchestrator and MCP server only over authenticated HTTPS in a shared deployment.
- Rotate Google credentials immediately if they appear in logs, screenshots, commits or recordings.
- Preserve approval gates for all externally visible write tools.

## Reporting

Do not open a public issue containing credentials or personal data. Contact the repository owner privately with a minimal reproduction and impact description.
