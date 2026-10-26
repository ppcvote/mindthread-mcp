#!/usr/bin/env node
/**
 * mindthread-mcp: run MindThread's hosted MCP server (https://mindthread.tw/api/mcp)
 * as a local stdio server, for MCP clients that start servers with a command.
 *
 * Env:
 *   MINDTHREAD_API_KEY  mt_live_… or mt_test_… key (Settings → API keys on mindthread.tw)
 *   MINDTHREAD_MCP_URL  override the endpoint (default https://mindthread.tw/api/mcp)
 */
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { createBridge } from "./bridge.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const DEFAULT_URL = "https://mindthread.tw/api/mcp";

const HELP = `mindthread-mcp ${version}
Threads scheduler for AI agents: MindThread's MCP server over stdio.

Usage (from an MCP client config):
  command: npx   args: ["-y", "mindthread-mcp"]   env: { "MINDTHREAD_API_KEY": "mt_live_..." }

Env:
  MINDTHREAD_API_KEY   API key from https://mindthread.tw/settings (Settings → API keys)
  MINDTHREAD_MCP_URL   endpoint override (default ${DEFAULT_URL})

Clients that speak Streamable HTTP can skip this package and connect to
${DEFAULT_URL} directly. Docs: https://github.com/ppcvote/mindthread-mcp`;

const arg = process.argv[2];
if (arg === "--help" || arg === "-h") { process.stdout.write(HELP + "\n"); process.exit(0); }
if (arg === "--version" || arg === "-v") { process.stdout.write(version + "\n"); process.exit(0); }

const log = (m: string) => process.stderr.write(`[mindthread-mcp] ${m}\n`);
const url = (process.env.MINDTHREAD_MCP_URL || DEFAULT_URL).trim();
try {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new Error("must be https");
} catch {
  log(`MINDTHREAD_MCP_URL is not a valid https URL: ${url}`);
  process.exit(2);
}

const apiKey = (process.env.MINDTHREAD_API_KEY || "").trim() || undefined;
if (apiKey && !/^mt_(live|test|oat)_/.test(apiKey)) log("MINDTHREAD_API_KEY does not look like a MindThread key (expected mt_live_… or mt_test_…)");
const masked = apiKey ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}` : "";
log(`${version} → ${url} (${apiKey ? `key ${masked}` : "no MINDTHREAD_API_KEY: tool list and playbook only"})`);

const bridge = createBridge({ url, apiKey, version, write: (line) => process.stdout.write(line + "\n"), log });
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => { void bridge.handleLine(line); });
// stdin closed: answer what is still in flight, then let the process end on its own (no process.exit, so stdout is flushed)
rl.on("close", () => { void bridge.idle(); });
