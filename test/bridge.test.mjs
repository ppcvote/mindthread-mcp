// Contract tests for the stdio bridge against a local mock of https://mindthread.tw/api/mcp.
// Runs the built dist/index.js as a child process, exactly as an MCP client would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const FAKE_KEY = "mt_test_FAKEKEY0000000000000000abcd";

/** Mock MCP endpoint: records every request, answers like the hosted server */
async function mockServer(handler) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = body ? JSON.parse(body) : null;
      calls.push({ method: req.method, url: req.url, headers: req.headers, body: json });
      const out = handler(json, req) ?? defaultAnswer(json, req);
      if (out.status === 202) { res.writeHead(202).end(); return; }
      res.writeHead(out.status ?? 200, { "Content-Type": out.type ?? "application/json", ...(out.headers ?? {}) });
      res.end(typeof out.body === "string" ? out.body : JSON.stringify(out.body));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/api/mcp`, calls, close: () => new Promise((r) => server.close(r)) };
}

function defaultAnswer(msg, req) {
  const one = (m) => {
    if (m.id === undefined) return null;
    if (m.method === "initialize") return { jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "mindthread", version: "1.16.1" } } };
    if (m.method === "tools/list") return { jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "get_me", inputSchema: { type: "object" } }] } };
    if (m.method === "tools/call") {
      if (!req.headers.authorization) return { jsonrpc: "2.0", id: m.id, error: { code: -32001, message: "Unauthorized. Connect your MindThread account with OAuth…", data: { error: "unauthorized" } } };
      return { jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "{\"ok\":true}" }] } };
    }
    return { jsonrpc: "2.0", id: m.id, result: {} };
  };
  if (Array.isArray(msg)) return { body: msg.map(one).filter(Boolean) };
  if (msg && msg.id === undefined) return { status: 202 };
  const a = one(msg);
  const unauth = a && a.error && a.error.code === -32001;
  return { status: unauth ? 401 : 200, body: a };
}

/** Start the bridge, send lines, collect stdout lines until `expect` responses arrived and stdin is closed */
function runBridge(env, lines, { closeStdin = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN], { env: { ...process.env, MINDTHREAD_API_KEY: "", ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: out, stderr: err, messages: out.split("\n").filter(Boolean).map((l) => JSON.parse(l)) }));
    for (const l of lines) child.stdin.write((typeof l === "string" ? l : JSON.stringify(l)) + "\n");
    if (closeStdin) child.stdin.end();
  });
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } };

test("forwards initialize, tools/list and tools/call with the key; notifications produce no output", async () => {
  const m = await mockServer(() => null);
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url, MINDTHREAD_API_KEY: FAKE_KEY }, [
      INIT,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_me", arguments: {} } },
    ]);
    assert.equal(r.code, 0);
    const byId = Object.fromEntries(r.messages.map((x) => [x.id, x]));
    assert.deepEqual(Object.keys(byId).sort(), ["1", "2", "3"]);
    assert.equal(byId[1].result.serverInfo.name, "mindthread");
    assert.equal(byId[2].result.tools[0].name, "get_me");
    assert.ok(byId[3].result);
    assert.equal(m.calls.length, 4);
    for (const c of m.calls) {
      assert.equal(c.method, "POST");
      assert.equal(c.headers.authorization, `Bearer ${FAKE_KEY}`);
      assert.match(c.headers["user-agent"], /^mindthread-mcp\/\d+\.\d+\.\d+/);
      assert.match(c.headers.accept, /application\/json/);
    }
    // initialize goes out without a protocol header; everything after it carries the negotiated version
    assert.equal(m.calls[0].body.method, "initialize");
    assert.equal(m.calls[0].headers["mcp-protocol-version"], undefined);
    for (const c of m.calls.slice(1)) assert.equal(c.headers["mcp-protocol-version"], "2025-06-18");
    assert.ok(!r.stdout.includes(FAKE_KEY) && !r.stderr.includes(FAKE_KEY), "the full key must never be printed");
    assert.match(r.stderr, /mt_test_…abcd/);
  } finally { await m.close(); }
});

test("without a key: tools/list works, tools/call gets an actionable 401 message", async () => {
  const m = await mockServer(() => null);
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url }, [INIT, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_me", arguments: {} } }]);
    const byId = Object.fromEntries(r.messages.map((x) => [x.id, x]));
    assert.ok(byId[2].result.tools.length >= 1);
    assert.equal(byId[3].error.code, -32001);
    assert.match(byId[3].error.message, /MINDTHREAD_API_KEY is not set/);
    assert.equal(byId[3].error.data.error, "unauthorized", "server data is kept");
    assert.equal(m.calls[0].headers.authorization, undefined);
  } finally { await m.close(); }
});

test("a rejected key says so instead of asking for OAuth", async () => {
  const m = await mockServer((msg) => (msg.method === "tools/call" ? { status: 401, body: { jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: "Unauthorized", data: { error: "key_disabled" } } } } : null));
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url, MINDTHREAD_API_KEY: FAKE_KEY }, [INIT, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_me", arguments: {} } }]);
    const e = r.messages.find((x) => x.id === 9).error;
    assert.match(e.message, /rejected the key/);
    assert.equal(e.data.error, "key_disabled");
  } finally { await m.close(); }
});

test("batches go up as one POST and come back as one array", async () => {
  const m = await mockServer(() => null);
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url, MINDTHREAD_API_KEY: FAKE_KEY }, [[{ jsonrpc: "2.0", id: 5, method: "ping" }, { jsonrpc: "2.0", id: 6, method: "ping" }]]);
    assert.equal(m.calls.length, 1);
    assert.ok(Array.isArray(r.messages[0]));
    assert.deepEqual(r.messages[0].map((x) => x.id), [5, 6]);
  } finally { await m.close(); }
});

test("SSE answers are unwrapped into plain JSON lines", async () => {
  const m = await mockServer((msg) => (msg.method === "tools/list" ? { type: "text/event-stream", body: `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [] } })}\n\n` } : null));
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url }, [{ jsonrpc: "2.0", id: 7, method: "tools/list" }]);
    assert.deepEqual(r.messages, [{ jsonrpc: "2.0", id: 7, result: { tools: [] } }]);
  } finally { await m.close(); }
});

test("network failure and non-JSON answers become JSON-RPC errors for the waiting request", async () => {
  const dead = await runBridge({ MINDTHREAD_MCP_URL: "http://127.0.0.1:9/api/mcp" }, [{ jsonrpc: "2.0", id: 11, method: "tools/list" }, { jsonrpc: "2.0", method: "notifications/initialized" }]);
  assert.equal(dead.messages.length, 1, "a notification never gets an answer, even an error");
  assert.equal(dead.messages[0].id, 11);
  assert.equal(dead.messages[0].error.code, -32603);
  assert.match(dead.messages[0].error.message, /Cannot reach MindThread/);

  const m = await mockServer(() => ({ status: 502, type: "text/html", body: "<html>Bad gateway</html>" }));
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url }, [{ jsonrpc: "2.0", id: 12, method: "tools/list" }]);
    assert.equal(r.messages[0].error.code, -32603);
    assert.equal(r.messages[0].error.data.status, 502);
  } finally { await m.close(); }
});

test("bad input lines get a parse error; responses from the client are not forwarded", async () => {
  const m = await mockServer(() => null);
  try {
    const r = await runBridge({ MINDTHREAD_MCP_URL: m.url }, ["{not json", { jsonrpc: "2.0", id: 1, result: {} }]);
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0].error.code, -32700);
    assert.equal(m.calls.length, 0);
  } finally { await m.close(); }
});

test("refuses a non-https endpoint and prints help/version", async () => {
  const bad = await runBridge({ MINDTHREAD_MCP_URL: "http://example.com/api/mcp" }, []);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /not a valid https URL/);
  const v = spawn(process.execPath, [BIN, "--version"]);
  let out = "";
  v.stdout.on("data", (d) => (out += d));
  await new Promise((r) => v.on("close", r));
  assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
});
