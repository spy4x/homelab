#!/usr/bin/env node
/**
 * HTTP Streamable wrapper for monica-mcp (Jacob-Stokes/monica-mcp).
 * Replaces StdioServerTransport with StreamableHTTPServerTransport
 * so OpenWebUI can connect directly via TOOL_SERVER_CONNECTIONS.
 *
 * https://github.com/Jacob-Stokes/monica-mcp
 */
import process from "node:process"
import express from "express"
import cors from "cors"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { MonicaClient } from "./dist/client/MonicaClient.js"
import { registerTools } from "./dist/tools/registerTools.js"
import { registerResources } from "./dist/resources/registerResources.js"

const PORT = parseInt(process.env.MCP_PORT || "3000", 10)

function createServer() {
  const server = new McpServer({
    name: "monica-crm-mcp",
    version: "0.1.0",
  })

  const monicaClient = new MonicaClient({
    baseUrl: process.env.MONICA_BASE_URL || "https://crm.antonshubin.com",
    token: process.env.MONICA_API_TOKEN || "",
    tokenType: process.env.MONICA_TOKEN_TYPE || "bearer",
    userToken: process.env.MONICA_USER_TOKEN || undefined,
    logger: console,
  })

  registerTools({ server, client: monicaClient, logger: console })
  registerResources({ server, client: monicaClient, logger: console })

  return server
}

const app = express()
app.use(express.json())
app.use(cors({
  origin: "*",
  exposedHeaders: ["Mcp-Session-Id"],
}))

app.post("/mcp", async (req, res) => {
  const server = createServer()
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
    res.on("close", () => {
      transport.close()
      server.close()
    })
  } catch (error) {
    console.error("Error handling MCP request:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" })
    }
  }
})

// GET /mcp — not used by OpenWebUI, but required by MCP spec
app.get("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
  }))
})

app.delete("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
  }))
})

app.listen(PORT, () => {
  console.log(`monica-mcp HTTP server listening on port ${PORT}`)
})
