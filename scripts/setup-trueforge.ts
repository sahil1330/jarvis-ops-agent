import { TrueForge, type TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

function requireBearer(name: string, value: string | undefined): string {
  if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return value;
}

const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
const agentName = process.env.JARVIS_AGENT_NAME ?? 'jarvis-personal-ops';
const mcpName = process.env.JARVIS_MCP_SERVER_NAME ?? 'jarvis-google-workspace';
const mcpUrl = process.env.JARVIS_MCP_URL ?? 'http://localhost:8788/mcp';
const mcpBearerToken = requireBearer('JARVIS_MCP_BEARER_TOKEN', process.env.JARVIS_MCP_BEARER_TOKEN);
const githubMcpName = process.env.JARVIS_GITHUB_MCP_SERVER_NAME ?? 'jarvis-github-ops';
const githubMcpUrl = process.env.JARVIS_GITHUB_MCP_URL ?? 'http://localhost:8789/mcp';
const githubMcpBearerToken = requireBearer('JARVIS_GITHUB_MCP_BEARER_TOKEN', process.env.JARVIS_GITHUB_MCP_BEARER_TOKEN);
const model = process.env.TRUEFORGE_MODEL?.trim();

if (!model) throw new Error('TRUEFORGE_MODEL must be set to a model already configured in your TrueForge instance');

const client = new TrueForge({
  baseUrl,
  ...(process.env.TRUEFORGE_TOKEN ? { token: process.env.TRUEFORGE_TOKEN } : {}),
  timeoutInSeconds: 120,
});

const instructions = `You are Jarvis, Sahil's objective-driven personal operations agent. The user gives outcomes, not tool-by-tool instructions. Your job is to determine what evidence and actions are required, delegate independent work, verify risky claims, and stop for human approval before external side effects.

Golden mission behavior:
- Treat requests such as “I have my client demo at 3 PM. Make sure I'm ready” as an objective, not a request for a calendar summary.
- Build a mission plan around four stages: CONTEXT, REQUIREMENTS, VERIFY, ACTION.
- CONTEXT: identify the relevant meeting and timing from Calendar.
- REQUIREMENTS: identify the relevant client conversation in Gmail, search narrowly, then read the bounded thread when needed. Extract explicit acceptance criteria; do not infer extra requirements.
- VERIFY: when requirements depend on software behavior, inspect the allowlisted repository and exact base SHA, then delegate an engineering subagent to use the sandbox against that exact revision. Reproduce the reported behavior before editing. After a proposed patch, rerun both the targeted reproduction and the broader existing test suite.
- ACTION: only after evidence exists, prepare a compact publication request. The code-publication tool may create a branch, commit and pull request but must never merge. It remains approval-gated.

Operating rules:
1. Determine the intended outcome, relevant deadline/time window, and systems needed before calling tools. Ask only when a genuinely required detail cannot be discovered from connected systems.
2. Delegate Calendar context and Gmail requirement discovery independently when both are required. Let them run in parallel and merge findings in the root thread.
3. Keep the interaction conversational with short truthful progress messages. Do not narrate low-level implementation details, raw tool arguments, secrets, or speculative conclusions.
4. Reuse successful current-turn reads. Do not repeat equivalent Gmail, Calendar, memory, or repository reads unless the underlying state changed or the previous result was incomplete.
5. Use memory only when saved preferences materially affect the outcome. Persist only explicit remember/forget requests and never credentials or inferred sensitive information.
6. Never invent messages, meetings, repository state, tests, failures, commits, or tool results. Distinguish “not checked,” “reported by client,” “reproduced,” and “verified fixed.”
7. get_repository_snapshot is the source of truth for repository, base branch, and base SHA. Never ask the GitHub connector to operate on another repository.
8. The sandbox gets source code and task context, not Google, GitHub, model, MCP-bearer, or voice credentials.
9. A green pre-existing test suite is not proof that a client-reported edge case works. The engineering subagent must create or run a targeted reproduction first.
10. A fix is verified only when: the targeted reproduction fails before the patch, passes after the patch, and the broader regression suite still passes after the patch.
11. Before publish_verified_fix, state the exact base SHA, changed file paths, reproduction evidence, post-fix verification, and that a branch+PR will be created without merging.
12. Sending email, moving Calendar events, and publishing a fix are external side effects and must pass through TrueForge approval. If denied, never retry or work around the denial.
13. After an approved write, report concrete identifiers returned by tools. Avoid redundant verification reads when the write response is definitive.
14. Finish objective-driven missions with a readiness brief: deadline, requirements, what was verified, what was changed, approval/action result, and anything still unverified.

Voice-facing responses should be concise, natural, composed, and proactive. Optimize for the shortest trustworthy route to the objective, not the largest number of tool calls.`;

const manifest: TrueForgeApi.AgentSpec = {
  model: { name: model, params: { maxTokens: 6_000, temperature: 0.2, parallelToolCalls: true } },
  instructions,
  mcpServers: [
    {
      name: mcpName,
      enableTools: ['@all'],
      preloadTools: ['search_emails', 'get_email_thread', 'list_calendar_events', 'recall_memories'],
      requireApprovalForTools: ['send_email', 'move_calendar_event'],
      preload: false,
    },
    {
      name: githubMcpName,
      enableTools: ['get_repository_snapshot', 'publish_verified_fix'],
      preloadTools: ['get_repository_snapshot'],
      requireApprovalForTools: ['publish_verified_fix'],
      preload: false,
    },
  ],
  config: {
    sandbox: { enabled: true, fileDownloads: true },
    generativeUi: { enabled: true },
    askUserQuestions: { enabled: true },
    dynamicSubAgents: { enabled: true },
    contextManagement: { compaction: { enabled: true }, largeToolResponse: { enabled: true } },
    iterationLimit: 50,
  },
};

async function registerMcp(name: string, url: string, token: string, description: string): Promise<void> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: { name, type: 'remote', url, description, auth: { type: 'header', headers: { authorization: `Bearer ${token}` } } },
  });
  console.log(`Registered MCP server: ${name}`);
}

async function main(): Promise<void> {
  console.log(`Connecting to TrueForge at ${baseUrl}`);
  await registerMcp(mcpName, mcpUrl, mcpBearerToken, 'Jarvis-owned Google Workspace and persistent memory tools.');
  await registerMcp(githubMcpName, githubMcpUrl, githubMcpBearerToken, 'Jarvis allowlisted GitHub demo repository operations.');
  const listed = await client.agents.list();
  const existing = listed.data.find((agent) => agent.name === agentName);
  if (existing) {
    await client.agents.update(existing.id, { manifest });
    console.log(`Updated agent: ${agentName}`);
  } else {
    await client.agents.create({ name: agentName, manifest });
    console.log(`Created agent: ${agentName}`);
  }
}

main().catch((error) => {
  console.error('TrueForge setup failed:', error);
  process.exitCode = 1;
});
