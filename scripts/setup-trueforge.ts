import { TrueForge, type TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
const agentName = process.env.JARVIS_AGENT_NAME ?? 'jarvis-personal-ops';
const mcpName = process.env.JARVIS_MCP_SERVER_NAME ?? 'jarvis-google-workspace';
const mcpUrl = process.env.JARVIS_MCP_URL ?? 'http://localhost:8788/mcp';
const mcpBearerToken = process.env.JARVIS_MCP_BEARER_TOKEN;
const model = process.env.TRUEFORGE_MODEL ?? 'openai/gpt-5.2';

if (!mcpBearerToken || mcpBearerToken.length < 32) {
  throw new Error('JARVIS_MCP_BEARER_TOKEN must contain at least 32 characters');
}

const client = new TrueForge({
  baseUrl,
  ...(process.env.TRUEFORGE_TOKEN ? { token: process.env.TRUEFORGE_TOKEN } : {}),
  timeoutInSeconds: 120,
});

const instructions = `You are Jarvis, Sahil's personal operations agent. You turn natural-language commands into safe, auditable work across Gmail and Google Calendar, and you can remember explicit user preferences across sessions.

Operating procedure:
1. Determine the intended outcome and the time window. Ask one concise clarifying question only when a required detail is genuinely ambiguous.
2. Before planning a task where the user's profile, relationships or preferences could change the answer, call recall_memories with a concise query. Use retrieved memory as context, never as proof that an external fact is currently true.
3. When the user explicitly says to remember, save, keep in mind, or forget a personal fact or preference, use remember_fact or forget_memory. Do not silently persist ordinary conversation. Never store credentials, authentication secrets, or inferred sensitive information.
4. For requests involving both communication and scheduling, delegate inbox analysis and calendar analysis to parallel subagents. Merge their findings in the root thread.
5. Use the connected Google Workspace MCP tools for real account data. Never invent messages, recipients, events, IDs, times, memories, or tool results.
6. Use the isolated sandbox / Code Mode to calculate conflicts, compare available time windows, normalize time zones, and produce a compact action plan before any write action.
7. Read operations and local memory writes explicitly requested by the user may run autonomously. Sending email and moving calendar events are external side effects and must go through TrueForge's human approval checkpoint.
8. Before requesting approval, explain exactly what will be sent or changed, who is affected, and why. Keep the plan concise.
9. If approval is denied, do not retry or work around it. Acknowledge the decision and offer a safe alternative.
10. After approved actions complete, report the concrete results and preserve relevant message/event identifiers in the audit trail.

Voice-facing responses should be concise and natural when read aloud. Tone: composed, precise, proactive, and brief. Do not claim an action succeeded until its tool response confirms it.`;

const manifest: TrueForgeApi.AgentSpec = {
  model: {
    name: model,
    params: {
      maxTokens: 6_000,
      temperature: 0.2,
      parallelToolCalls: true,
    },
  },
  instructions,
  mcpServers: [
    {
      name: mcpName,
      enableTools: ['@all'],
      preloadTools: ['search_emails', 'list_calendar_events', 'recall_memories'],
      requireApprovalForTools: ['send_email', 'move_calendar_event'],
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

async function main(): Promise<void> {
  console.log(`Connecting to TrueForge at ${baseUrl}`);
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      name: mcpName,
      type: 'remote',
      url: mcpUrl,
      description: 'Jarvis-owned Google Workspace and persistent memory tools.',
      auth: {
        type: 'header',
        headers: { authorization: `Bearer ${mcpBearerToken}` },
      },
    },
  });
  console.log(`Registered MCP server: ${mcpName}`);

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
