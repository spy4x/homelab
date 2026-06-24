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

/**
 * Patch server.tool() to embed structuredContent into content[0].text.
 * The upstream monica-mcp adds structuredContent (non-standard) to results,
 * which MCP clients (OpenWebUI) silently drop. We inline it as JSON so
 * the AI can actually use the data.
 */
function patchToolHandler(server) {
  const origTool = server.tool.bind(server)
  server.tool = (...args) => {
    // Find the handler — it's the last arg if it's a function
    const handlerIdx = args.length - 1
    if (typeof args[handlerIdx] !== "function") return origTool(...args)
    const origHandler = args[handlerIdx]
    args[handlerIdx] = async (...handlerArgs) => {
      const result = await origHandler(...handlerArgs)
      if (result && result.structuredContent) {
        const text = result.content?.[0]?.text ?? ""
        const data = JSON.stringify(result.structuredContent, null, 2)
        result.content = [{ type: "text", text: text + "\n\n" + data }]
        delete result.structuredContent
      }
      return result
    }
    return origTool(...args)
  }
}

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

  // Patch BEFORE registering tools so structuredContent gets inlined
  patchToolHandler(server)

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
