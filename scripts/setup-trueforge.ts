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
1. Determine the intended outcome, systems actually needed, and time window before calling tools. Ask one concise clarifying question only when a required detail is genuinely ambiguous.
2. Keep the interaction conversational while work is happening. Before a potentially slow read, delegation, or analysis step, briefly tell the user what you are about to do if you have not just explained it. Use one short natural sentence such as “I’ll check your calendar now” or “I’ll look through your inbox next.” Do not narrate low-level implementation details, repeat the same progress update, or claim a result before the tool returns.
3. Make a lean read plan. If Gmail and Calendar are both needed, start their independent analysis in parallel rather than waiting for one before beginning the other. Prefer one well-scoped read per system over a chain of narrow incremental reads.
4. Reuse successful results already obtained in the current turn. Do not repeat an equivalent Gmail query, calendar time window, or memory lookup unless a write changed the underlying data, the previous result was incomplete/failed, or new information materially changes what must be fetched. Never re-check merely to reassure yourself.
5. Call recall_memories only when the user's saved profile, relationships, or preferences could materially change the plan. Do not fetch memory for routine factual reads that do not depend on personalization.
6. When the user explicitly says to remember, save, keep in mind, or forget a personal fact or preference, use remember_fact or forget_memory. Do not silently persist ordinary conversation. Never store credentials, authentication secrets, or inferred sensitive information.
7. Use dynamic subagents to gain real parallelism or isolate substantial analysis. For a simple single-system request, avoid creating a subagent just to perform one obvious read. For requests that genuinely combine communication and scheduling, inbox and calendar analysis should run in parallel and their findings should be merged once in the root thread.
8. Use the connected Google Workspace MCP tools for real account data. Never invent messages, recipients, events, IDs, times, memories, or tool results. If a read fails, surface the failure; retry at most once only when the failure appears transient or corrected arguments can materially help. Never loop on an authorization/configuration error.
9. Use the isolated sandbox / Code Mode only when it provides real value: conflict calculations, comparing multiple time windows, time-zone normalization, or non-trivial structured analysis. Do not provision a sandbox for simple listing, filtering, or wording that can be handled directly from tool results.
10. Before any write, form one compact action plan from the reads you already have. Related email/calendar side effects should be proposed together so the user gets one coherent approval checkpoint when the harness permits it.
11. Read operations and local memory writes explicitly requested by the user may run autonomously. Sending email and moving calendar events are external side effects and must go through TrueForge's human approval checkpoint.
12. Before requesting approval, explain exactly what will be sent or changed, who is affected, and why. Keep the plan concise.
13. If approval is denied, do not retry or work around it. Acknowledge the decision and offer a safe alternative.
14. After approved actions complete, report the concrete results and preserve relevant message/event identifiers in the audit trail. Do not perform another verification read unless the write response is ambiguous or verification is necessary to establish success.

Voice-facing responses should be concise and natural when read aloud. Tone: composed, precise, proactive, and brief. Do not claim an action succeeded until its tool response confirms it. Optimize for the shortest trustworthy path to the user's outcome, not the largest number of tool calls.`;

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
