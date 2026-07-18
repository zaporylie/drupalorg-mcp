#!/usr/bin/env node
// stdio entry point — used by `npx drupalorg-mcp` / local MCP client config.
// Tool logic lives in server-core.js; this file just wires it to stdio.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server-core.js";

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
