/**
 * stdio <-> MindThread hosted MCP bridge.
 *
 * Every JSON-RPC message an MCP client writes to stdin is POSTed to the hosted
 * MindThread MCP endpoint (Streamable HTTP, stateless request/response), and the
 * answer is written back to stdout as one line. The tool list, descriptions and
 * behaviour therefore always match the live server: nothing is re-implemented here.
 */

export interface BridgeOptions {
  /** Hosted MCP endpoint, e.g. https://mindthread.tw/api/mcp */
  url: string;
  /** mt_live_ / mt_test_ key; optional (initialize, tools/list, get_playbook and list_formulas work without one) */
  apiKey?: string;
  /** Package version, sent in the User-Agent */
  version: string;
  /** Writes one line (without the trailing newline) to the MCP client */
  write: (line: string) => void;
  /** Diagnostics; must never go to stdout */
  log?: (message: string) => void;
  fetchImpl?: typeof fetch;
  /** Per-request timeout. The hosted server allows up to 300 s for the slowest tools */
  timeoutMs?: number;
}

type Id = string | number | null;
type Message = { jsonrpc?: string; id?: Id; method?: string; result?: unknown; error?: unknown; [k: string]: unknown };

const KEY_PAGE = "https://mindthread.tw/settings (Settings → API keys)";
export const NO_KEY_HINT =
  "MINDTHREAD_API_KEY is not set. Create a key at " + KEY_PAGE +
  " and add it to the env of this MCP server in your client config. mt_test_ keys are a free sandbox that never changes live data.";
export const BAD_KEY_HINT =
  "MindThread rejected the key in MINDTHREAD_API_KEY (wrong, revoked or disabled). Create a new key at " + KEY_PAGE + ".";

const isRequest = (m: unknown): m is Message =>
  !!m && typeof m === "object" && typeof (m as Message).method === "string" && (m as Message).id !== undefined && (m as Message).id !== null;

function rpcError(id: Id, code: number, message: string, data?: unknown): Message {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** Pull the JSON payloads out of an SSE body (the hosted server answers JSON today; this keeps the bridge working if it starts streaming) */
function parseSse(text: string): unknown[] {
  const out: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try { out.push(JSON.parse(data)); } catch { /* ignore keep-alives and partial events */ }
  }
  return out;
}

/**
 * Daily quota hold (0.2.1, 2026-11-02). Every tool call that reaches MindThread counts against the key's daily quota,
 * polls included (free keys: 50 calls a day). After a daily 429 every call until reset_at (00:00 Asia/Taipei) gets 429
 * again, so the bridge stops forwarding tools/call until then and answers them itself with the same error.
 * Tools that use no daily quota still go through.
 */
export const HOLD_EXEMPT_TOOLS = new Set(["get_playbook", "list_formulas", "get_approval", "disable_this_key"]);

/** reset_at (epoch ms) when a tools/call result is a daily-window rate_limit_exceeded, else null */
export function dailyLimitHold(m: Message, nowMs = Date.now()): { untilMs: number; error: Record<string, unknown> } | null {
  const r = m?.result as { isError?: boolean; structuredContent?: { error?: Record<string, unknown> } } | undefined;
  const err = r?.isError ? r.structuredContent?.error : undefined;
  if (!err || err.code !== "rate_limit_exceeded" || err.window !== "daily") return null;
  const reset = typeof err.reset_at === "string" ? Date.parse(err.reset_at) : NaN;
  const retry = Number(err.retry_after_seconds) || 0;
  const untilMs = Math.max(Number.isFinite(reset) ? reset : 0, nowMs + retry * 1000);
  return untilMs > nowMs ? { untilMs, error: err } : null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** "2026-11-03 00:00 Asia/Taipei" */
export function taipeiTime(ms: number): string {
  const d = new Date(ms + 8 * 3600_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} Asia/Taipei`;
}
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;

export function createBridge(o: BridgeOptions) {
  const doFetch = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 310_000;
  const log = o.log ?? (() => {});
  let protocolVersion: string | undefined;
  let sessionId: string | undefined;
  const inflight = new Set<Promise<void>>();
  let initializing: Promise<void> | undefined;
  let hold: { untilMs: number; error: Record<string, unknown> } | undefined;

  /** The answer for a tools/call made while the daily quota is used up: same error shape as the server, nothing sent */
  function heldAnswer(req: Message): Message {
    const left = Math.max(1, Math.ceil((hold!.untilMs - Date.now()) / 1000));
    const error = {
      ...hold!.error,
      retry_after_seconds: left,
      held_locally: true,
      message: `Daily API limit reached. mindthread-mcp did not send this call: every call before ${taipeiTime(hold!.untilMs)} (in ${hm(left)}) would get 429 too. `
        + "Stop until reset_at; each call counts, polls included, so poll less often (every 30 minutes on the free plan) or use a webhook.",
    };
    const body = { error };
    return { jsonrpc: "2.0", id: req.id as Id, result: { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true, structuredContent: body } };
  }

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": `mindthread-mcp/${o.version} (+https://github.com/ppcvote/mindthread-mcp)`,
    };
    if (o.apiKey) h.Authorization = `Bearer ${o.apiKey}`;
    if (protocolVersion) h["MCP-Protocol-Version"] = protocolVersion;
    if (sessionId) h["Mcp-Session-Id"] = sessionId;
    return h;
  }

  /** Make the hosted server's 401 actionable for a stdio user (OAuth is not available over stdio) */
  function explain(m: Message): Message {
    const err = m.error as { code?: number; message?: string } | undefined;
    if (err && err.code === -32001) return { ...m, error: { ...err, message: o.apiKey ? BAD_KEY_HINT : NO_KEY_HINT } };
    return m;
  }

  function emit(payload: unknown) {
    const fix = (x: unknown) => (x && typeof x === "object" ? explain(x as Message) : x);
    o.write(JSON.stringify(Array.isArray(payload) ? payload.map(fix) : fix(payload)));
  }

  async function forward(raw: unknown, requests: Message[]) {
    const failAll = (code: number, message: string, data?: unknown) => {
      if (!requests.length) { log(message); return; }
      const errs = requests.map((r) => rpcError(r.id as Id, code, message, data));
      o.write(JSON.stringify(Array.isArray(raw) ? errs : errs[0]));
    };
    let res: Response;
    try {
      res = await doFetch(o.url, { method: "POST", headers: headers(), body: JSON.stringify(raw), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const reason = e instanceof Error ? (e.name === "TimeoutError" ? `no answer within ${Math.round(timeoutMs / 1000)} s` : e.message) : String(e);
      failAll(-32603, `Cannot reach MindThread at ${o.url}: ${reason}. Check the network, or MINDTHREAD_MCP_URL if you changed it.`);
      return;
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;
    const text = await res.text().catch(() => "");
    if (!text.trim()) {
      if (requests.length) failAll(-32603, `MindThread answered HTTP ${res.status} with an empty body`);
      return;
    }
    let payloads: unknown[];
    if ((res.headers.get("content-type") || "").includes("text/event-stream")) payloads = parseSse(text);
    else {
      try { payloads = [JSON.parse(text)]; } catch {
        failAll(-32603, `MindThread answered HTTP ${res.status} that is not JSON-RPC`, { status: res.status, body: text.slice(0, 300) });
        return;
      }
    }
    for (const p of payloads) {
      // Remember the negotiated protocol version: the server expects it on every later request
      const msgs = Array.isArray(p) ? p : [p];
      for (const m of msgs as Message[]) {
        const h = dailyLimitHold(m);
        if (h && (!hold || h.untilMs > hold.untilMs)) {
          hold = h;
          log(`Daily API limit reached (${h.error.used ?? h.error.limit ?? "?"}/${h.error.limit ?? "?"}). Holding tool calls until ${taipeiTime(h.untilMs)}, when the quota resets; each call counts, polls included.`);
        }
        const init = requests.find((r) => r.method === "initialize" && r.id === m?.id);
        const v = (m?.result as { protocolVersion?: unknown } | undefined)?.protocolVersion;
        if (init && typeof v === "string") protocolVersion = v;
      }
      emit(p);
    }
  }

  function handleLine(line: string): Promise<void> {
    const text = line.trim();
    if (!text) return Promise.resolve();
    let msg: unknown;
    try { msg = JSON.parse(text); } catch {
      o.write(JSON.stringify(rpcError(null, -32700, "Parse error: each line on stdin must be one JSON-RPC message")));
      return Promise.resolve();
    }
    const items = Array.isArray(msg) ? msg : [msg];
    // Only requests and notifications go upstream; the hosted server never sends requests to the client, so client responses have nowhere to go
    const outbound = items.filter((m) => m && typeof m === "object" && typeof (m as Message).method === "string");
    if (!outbound.length) { log("ignored a message without a method"); return Promise.resolve(); }
    const body = Array.isArray(msg) ? outbound : outbound[0];
    const requests = outbound.filter(isRequest);
    // Daily quota used up: answer a single tools/call locally until reset_at instead of hitting MindThread again
    if (hold && Date.now() >= hold.untilMs) hold = undefined;
    const single = !Array.isArray(msg) ? (outbound[0] as Message) : undefined;
    const toolName = (single?.params as { name?: unknown } | undefined)?.name;
    if (hold && single && isRequest(single) && single.method === "tools/call" && !HOLD_EXEMPT_TOOLS.has(String(toolName))) {
      o.write(JSON.stringify(heldAnswer(single)));
      return Promise.resolve();
    }
    // Anything sent while initialize is still in flight waits for it, so it carries the negotiated MCP-Protocol-Version
    const gate = initializing;
    const p = (gate ? gate.then(() => forward(body, requests)) : forward(body, requests))
      .catch((e) => log(`bridge error: ${e instanceof Error ? e.message : String(e)}`));
    if (requests.some((r) => r.method === "initialize")) {
      initializing = p;
      p.finally(() => { if (initializing === p) initializing = undefined; });
    }
    inflight.add(p);
    p.finally(() => inflight.delete(p));
    return p;
  }

  /** Resolves when every forwarded message has been answered */
  async function idle() {
    while (inflight.size) await Promise.allSettled([...inflight]);
  }

  return { handleLine, idle };
}
