import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from './config.js';
import { registerGoogleWorkspaceTools } from './tools.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'jarvis-google-workspace',
    version: '0.1.0',
  });
  registerGoogleWorkspaceTools(server);
  return server;
}

const app = createMcpExpressApp();

app.get('/healthz', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'jarvis-google-workspace-mcp',
    mode: env.JARVIS_DEMO_MODE ? 'demo' : 'live',
  });
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
    console.error('MCP request failed', error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_request, response) => {
  response.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed for stateless transport.' },
    id: null,
  });
});

app.delete('/mcp', (_request, response) => {
  response.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed for stateless transport.' },
    id: null,
  });
});

app.listen(env.MCP_PORT, (error?: Error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`Jarvis Google Workspace MCP listening on http://localhost:${env.MCP_PORT}/mcp`);
  console.log(`Mode: ${env.JARVIS_DEMO_MODE ? 'DEMO' : 'LIVE'}`);
});
