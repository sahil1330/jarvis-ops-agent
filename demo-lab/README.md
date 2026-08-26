# Jarvis Demo Product Lab

This is a deliberately small, self-contained product used by the hackathon golden mission. It gives Jarvis a deterministic software system to verify in an isolated sandbox without touching a production repository.

The submission baseline is healthy: the product supports the client-required roughly 5 MB PDF and keeps a bounded upload ceiling. The baseline suite covers a normal PDF upload, the ceiling, job recommendations, and analytics capture.

For the live golden-mission rehearsal, use a dedicated throwaway Git branch such as `demo/client-regression` and change only the resume upload ceiling from 6 MiB to 1 MiB. Do **not** merge that branch into `main`. Because the ordinary baseline tests do not contain the client-specific 5 MB reproduction, they remain green on the injected branch. Jarvis must derive the missing reproduction from the connected client requirement, observe the failure in Daytona, diagnose the limit regression, verify its fix, and ask before publishing a repair PR.

This mirrors a controlled chaos lab: the repository's submitted code is correct, while an isolated reversible branch supplies a deterministic incident for the agent to investigate.

## Baseline

```bash
cd demo-lab
npm test
```

The baseline must be green. A green baseline alone is not evidence that an injected client regression is absent.

## Demo scenario invariant

- `main`: healthy 6 MiB upload ceiling.
- `demo/client-regression`: intentionally lowered to 1 MiB for the live mission only.
- Existing baseline tests stay green on the regression branch.
- The 5 MB reproduction is created/run by Jarvis in the sandbox, not committed beforehand.
- A verified repair is published as an approval-gated pull request and is never auto-merged.

## Safety

The GitHub publication connector is restricted to files below `demo-lab/`. The demo action can create a branch, commit, and pull request after human approval, but it cannot merge the pull request.
