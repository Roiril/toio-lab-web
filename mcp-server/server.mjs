#!/usr/bin/env node
/**
 * toio MCP Server
 *
 * Exposes toio robot control tools to Claude Code via the Model Context Protocol.
 * Since Web Bluetooth only runs in browsers, this server acts as a bridge:
 *   Claude Code (stdio) <-> MCP Server <-> WebSocket <-> Browser <-> toio (BLE)
 *
 * Start the browser app first (npm run dev), open it with ?mcp=1, then run Claude Code.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";
import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const { toioTools } = require("../js/tools-schema.js");

const WS_PORT = Number(process.env.TOIO_WS_PORT || 7777);
const BRIDGE_TIMEOUT_MS = Number(process.env.TOIO_BRIDGE_TIMEOUT_MS || 60000);

// ---------- Convert OpenAI tool schema to MCP tool schema ----------
const mcpTools = toioTools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters,
}));

// ---------- WebSocket Bridge ----------
class BrowserBridge {
    constructor(port) {
        this.wss = new WebSocketServer({ port });
        this.client = null;
        this.pending = new Map();

        this.wss.on("connection", (ws) => {
            logStderr(`[bridge] browser connected`);
            if (this.client) {
                logStderr(`[bridge] replacing previous connection`);
                try { this.client.close(); } catch {}
            }
            this.client = ws;

            ws.on("message", (raw) => {
                let msg;
                try { msg = JSON.parse(raw.toString()); }
                catch (e) { logStderr(`[bridge] bad message: ${raw}`); return; }

                if (msg.type === "result" && msg.id) {
                    const pending = this.pending.get(msg.id);
                    if (pending) {
                        clearTimeout(pending.timer);
                        this.pending.delete(msg.id);
                        pending.resolve(msg);
                    }
                }
            });

            ws.on("close", () => {
                logStderr(`[bridge] browser disconnected`);
                if (this.client === ws) this.client = null;
            });
        });

        this.wss.on("listening", () => {
            logStderr(`[bridge] listening on ws://localhost:${port}`);
        });
    }

    isConnected() {
        return this.client && this.client.readyState === 1;
    }

    async call(toolName, args) {
        if (!this.isConnected()) {
            throw new Error(
                `Browser bridge not connected. Open the toio-lab-web app in a browser with ?mcp=1 query param, then retry.`
            );
        }
        const id = randomUUID();
        const payload = JSON.stringify({ type: "call", id, name: toolName, arguments: args });

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Tool "${toolName}" timed out after ${BRIDGE_TIMEOUT_MS}ms`));
            }, BRIDGE_TIMEOUT_MS);

            this.pending.set(id, {
                resolve: (msg) => {
                    if (msg.error) reject(new Error(msg.error));
                    else resolve(msg.result);
                },
                timer,
            });

            this.client.send(payload, (err) => {
                if (err) {
                    clearTimeout(timer);
                    this.pending.delete(id);
                    reject(err);
                }
            });
        });
    }
}

function logStderr(msg) {
    // MCP stdio protocol uses stdout — logs must go to stderr.
    process.stderr.write(`${msg}\n`);
}

// ---------- MCP Server ----------
const bridge = new BrowserBridge(WS_PORT);

const server = new Server(
    { name: "toio", version: "0.1.0" },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: mcpTools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const result = await bridge.call(name, args || {});
        const text = typeof result === "string" ? result : JSON.stringify(result);
        return { content: [{ type: "text", text }] };
    } catch (e) {
        return {
            content: [{ type: "text", text: JSON.stringify({ status: "error", error: e.message }) }],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
logStderr(`[mcp] toio MCP server ready (${mcpTools.length} tools)`);
