import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { bearerTokenMatches } from './auth.js';
import { githubEnv } from './github-config.js';
import { registerGithubOpsTools } from './github-tools.js';

function createServer(): McpServer {
  const server = new McpServer({ name: 'jarvis-github-ops', version: '0.1.0' });
  registerGithubOpsTools(server);
  return server;
}

const app = createMcpExpressApp();

app.get('/healthz', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'jarvis-github-ops-mcp',
    repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
    baseBranch: githubEnv.JARVIS_GITHUB_BASE_BRANCH,
  });
});

app.use('/mcp', (request, response, next) => {
  if (!bearerTokenMatches(request.headers.authorization, githubEnv.JARVIS_GITHUB_MCP_BEARER_TOKEN)) {
    response.setHeader('www-authenticate', 'Bearer');
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.post('/mcp', async (request, response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error('GitHub MCP request failed', error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_request, response) => response.status(405).json({ error: 'Method not allowed' }));
app.delete('/mcp', (_request, response) => response.status(405).json({ error: 'Method not allowed' }));

app.listen(githubEnv.GITHUB_MCP_PORT, githubEnv.GITHUB_MCP_HOST, (error?: Error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`Jarvis GitHub Ops MCP listening on http://${githubEnv.GITHUB_MCP_HOST}:${githubEnv.GITHUB_MCP_PORT}/mcp`);
});
