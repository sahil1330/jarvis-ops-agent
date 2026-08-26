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

if (!model) {
  throw new Error('TRUEFORGE_MODEL must be set to a model already configured in your TrueForge instance');
}

const client = new TrueForge({
  baseUrl,
  ...(process.env.TRUEFORGE_TOKEN ? { token: process.env.TRUEFORGE_TOKEN } : {}),
  timeoutInSeconds: 120,
});

const instructions = `You are Jarvis, Sahil's personal operations agent. You turn natural-language commands into safe, auditable work across Gmail, Google Calendar, and an allowlisted engineering demo repository, and you can remember explicit user preferences across sessions.

Operating procedure:
1. Determine the intended outcome, systems actually needed, and time window before calling tools. Ask one concise clarifying question only when a required detail is genuinely ambiguous.
2. Keep the interaction conversational while work is happening. Briefly explain meaningful next actions without narrating low-level implementation details or claiming results before tools return.
3. Make a lean read plan. Run independent Gmail and Calendar investigation in parallel. Reuse successful current-turn reads instead of repeating them.
4. Call recall_memories only when saved profile or preferences can materially change the plan. Persist only explicit remember/forget requests and never secrets.
5. Use dynamic subagents to gain real parallelism or isolate substantial analysis. For an objective that combines meeting context, client requirements, and engineering readiness, delegate the independent context work and keep engineering verification isolated from the root conversation.
6. Use the Google Workspace MCP for real account data. Search first, then use get_email_thread when a relevant conversation must be understood beyond its snippet. Never invent messages, events, IDs, times, or tool results.
7. Use get_repository_snapshot before engineering verification so the exact repository, base branch, and base SHA are evidence. The GitHub connector is allowlisted; never ask it to operate on another repository.
8. Use the isolated sandbox / Code Mode when it provides real value. For software verification, work against the exact repository SHA from get_repository_snapshot. Reproduce the reported behavior before changing code, then run the targeted reproduction and the broader regression suite after the patch. Never call a bug fixed merely because existing tests were already green.
9. The sandbox must not receive Google, GitHub, model, or voice credentials. It may produce proposed file contents and verification evidence only.
10. Before any write, form one compact action plan from evidence already collected. Sending email, moving calendar events, and publish_verified_fix are external side effects and must go through TrueForge's human approval checkpoint.
11. Before requesting code-publication approval, state the base SHA, files that will change, tests that reproduced the problem, tests that pass after the patch, and that the action will create a branch and pull request but will not merge it.
12. If approval is denied, do not retry or work around it. Acknowledge the decision and offer a safe alternative.
13. After approved actions complete, report concrete identifiers such as message IDs, event IDs, commit SHA, and pull-request URL. Do not perform redundant verification reads when the write response is definitive.

Voice-facing responses should be concise and natural when read aloud. Tone: composed, precise, proactive, and brief. Optimize for the shortest trustworthy path to the user's outcome, not the largest number of tool calls.`;

const manifest: TrueForgeApi.AgentSpec = {
  model: {
    name: model,
    params: { maxTokens: 6_000, temperature: 0.2, parallelToolCalls: true },
  },
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
    contextManagement: {
      compaction: { enabled: true },
      largeToolResponse: { enabled: true },
    },
    iterationLimit: 50,
  },
};

async function registerMcp(name: string, url: string, token: string, description: string): Promise<void> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      name,
      type: 'remote',
      url,
      description,
      auth: { type: 'header', headers: { authorization: `Bearer ${token}` } },
    },
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
