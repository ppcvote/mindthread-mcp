// Live, read-only checks against https://mindthread.tw/api/mcp through the built bridge.
// Without MINDTHREAD_API_KEY only discovery runs (initialize, tools/list, list_formulas) plus a bogus-key 401.
// With MINDTHREAD_API_KEY (use an mt_test_ key) it also calls get_me and list_accounts, both read-only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const KEY = (process.env.MINDTHREAD_API_KEY || "").trim();
const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mindthread-mcp-live-test", version: "0" } } };

function session(key, calls) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN], { env: { ...process.env, MINDTHREAD_API_KEY: key, MINDTHREAD_MCP_URL: "" } });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => resolve({ err, byId: Object.fromEntries(out.split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m])) }));
    child.stdin.write(JSON.stringify(INIT) + "\n");
    calls.forEach((c, i) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i + 2, ...c }) + "\n"));
    child.stdin.end();
  });
}

test("discovery works without a key", { timeout: 60_000 }, async () => {
  const s = await session("", [{ method: "tools/list" }, { method: "tools/call", params: { name: "list_formulas", arguments: {} } }, { method: "tools/call", params: { name: "get_me", arguments: {} } }]);
  assert.equal(s.byId[1].result.serverInfo.name, "mindthread");
  const names = s.byId[2].result.tools.map((t) => t.name);
  for (const n of ["get_me", "list_accounts", "generate_posts", "publish", "schedule_text", "list_schedules", "analytics_insights", "list_pending_replies", "approve_pending_reply"]) assert.ok(names.includes(n), `tool ${n} exists`);
  assert.ok(!s.byId[3].result.isError, "list_formulas needs no key");
  assert.equal(s.byId[4].error.code, -32001);
  assert.match(s.byId[4].error.message, /MINDTHREAD_API_KEY is not set/);
});

test("a bogus key is rejected with a clear message", { timeout: 60_000 }, async () => {
  const s = await session("mt_test_bogus_key_for_contract_test_0000", [{ method: "tools/call", params: { name: "get_me", arguments: {} } }]);
  assert.equal(s.byId[2].error.code, -32001);
  assert.match(s.byId[2].error.message, /rejected the key/);
});

test("authenticated read-only calls", { timeout: 60_000, skip: KEY ? false : "set MINDTHREAD_API_KEY (an mt_test_ key) to run" }, async () => {
  const s = await session(KEY, [{ method: "tools/call", params: { name: "get_me", arguments: {} } }, { method: "tools/call", params: { name: "list_accounts", arguments: {} } }]);
  assert.ok(!s.byId[2].result.isError, "get_me ok");
  assert.ok(!s.byId[3].result.isError, "list_accounts ok");
  assert.ok(!s.err.includes(KEY), "key never printed");
});
