// Remote entry point — stateless Streamable HTTP transport, for hosting behind
// a reverse proxy (e.g. Docker + Caddy) and adding as a claude.ai custom
// connector. No auth: api-d7 is anonymous/public, so there's no user identity
// to protect (see DEPLOYMENT.md for why this differs from OAuth-fronted MCP
// servers like gitlab-mcp).
//
// Follows the SDK's own stateless pattern (examples/server/simpleStatelessStreamableHttp.js):
// a fresh Server + Transport per request, since sessionIdGenerator is undefined.

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server-core.js";

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_HOSTS = (process.env.MCP_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const app = createMcpExpressApp({
  host: "0.0.0.0",
  ...(ALLOWED_HOSTS.length ? { allowedHosts: ALLOWED_HOSTS } : {}),
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

app.post("/mcp", async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  }));
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.listen(PORT, () => {
  console.log(`drupalorg-mcp Streamable HTTP server listening on :${PORT}`);
});
