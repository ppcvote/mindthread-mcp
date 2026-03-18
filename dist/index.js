#!/usr/bin/env node
/**
 * MindThread MCP Server
 *
 * Exposes MindThread's Agent-Ready API as MCP tools,
 * enabling Claude/GPT to manage Threads accounts via natural language.
 *
 * Tools:
 *   - mindthread_list_accounts: List connected Threads accounts
 *   - mindthread_generate: Generate AI content with formulas
 *   - mindthread_schedule: Schedule a post for later
 *   - mindthread_generate_and_schedule: Generate + schedule in one call
 *   - mindthread_analytics: Get engagement insights for an account
 *   - mindthread_list_formulas: List available content formulas
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const BASE_URL = process.env.MINDTHREAD_API_URL || "https://mindthread.tw/api/v1";
const API_KEY = process.env.MINDTHREAD_API_KEY || "";
async function apiCall(method, path, body) {
    if (!API_KEY) {
        throw new Error("MINDTHREAD_API_KEY not set. Get your key at https://mindthread.tw/settings");
    }
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
        const errMsg = typeof data?.error === "string"
            ? data.error
            : data?.error?.message || `HTTP ${res.status}`;
        throw new Error(errMsg);
    }
    return data;
}
// ── Server setup ──────────────────────────────────────────────────────────────
const server = new McpServer({
    name: "mindthread",
    version: "0.1.0",
});
// ── Tool: list_accounts ───────────────────────────────────────────────────────
server.tool("mindthread_list_accounts", "List all connected Threads accounts with stats (followers, views, posts)", {}, async () => {
    const data = await apiCall("GET", "/accounts");
    const lines = data.accounts.map((a) => `@${a.username} (${a.displayName}) — ${a.followersCount} followers, ${a.statsViews} views, ${a.statsPostCount} posts [id: ${a.id}]`);
    return {
        content: [
            {
                type: "text",
                text: lines.length
                    ? `Found ${lines.length} accounts:\n\n${lines.join("\n")}`
                    : "No accounts connected. Connect one at https://mindthread.tw/dashboard",
            },
        ],
    };
});
// ── Tool: generate ────────────────────────────────────────────────────────────
server.tool("mindthread_generate", "Generate AI content for Threads using a formula (controversial, curiosity, binary_choice, personal, list). Returns generated text without publishing.", {
    topic: z.string().describe("The topic to generate content about"),
    formula: z
        .enum(["auto", "controversial", "curiosity", "binary_choice", "personal", "list"])
        .default("auto")
        .describe("Content formula to use. 'auto' picks the best one."),
    count: z
        .number()
        .min(1)
        .max(5)
        .default(1)
        .describe("Number of variations to generate (1-5)"),
}, async ({ topic, formula, count }) => {
    const data = await apiCall("POST", "/content/generate", {
        topic,
        formula,
        count,
    });
    const results = data.texts
        .map((t, i) => `[${i + 1}] (${t.formula}, ${t.charCount} chars)\n${t.text}`)
        .join("\n\n---\n\n");
    return {
        content: [{ type: "text", text: results }],
    };
});
// ── Tool: schedule ────────────────────────────────────────────────────────────
server.tool("mindthread_schedule", "Schedule a pre-written text to be published on Threads at a specific time", {
    account_id: z.string().describe("Account ID (from mindthread_list_accounts)"),
    text: z.string().describe("The post content to schedule"),
    publish_at: z
        .string()
        .optional()
        .describe("ISO 8601 datetime to publish (e.g. '2026-04-01T09:00:00+08:00'). Omit for auto-optimized time."),
    auto_optimize_time: z
        .boolean()
        .default(false)
        .describe("Let MindThread pick the best time based on engagement data"),
}, async ({ account_id, text, publish_at, auto_optimize_time }) => {
    const body = { account_id, text };
    if (publish_at)
        body.publish_at = publish_at;
    if (auto_optimize_time)
        body.auto_optimize_time = true;
    const data = await apiCall("POST", "/content/schedule", body);
    return {
        content: [
            {
                type: "text",
                text: `Scheduled! Post ID: ${data.postId}\nTime: ${data.scheduledAt}\nStatus: ${data.status}`,
            },
        ],
    };
});
// ── Tool: generate_and_schedule ───────────────────────────────────────────────
server.tool("mindthread_generate_and_schedule", "Generate AI content AND schedule/publish it in one step. The most common tool for posting to Threads.", {
    topic: z.string().describe("The topic to generate content about"),
    account_id: z.string().describe("Account ID (from mindthread_list_accounts)"),
    formula: z
        .enum(["auto", "controversial", "curiosity", "binary_choice", "personal", "list"])
        .default("auto")
        .describe("Content formula"),
    publish_now: z
        .boolean()
        .default(false)
        .describe("If true, publish immediately instead of scheduling"),
    schedule_at: z
        .string()
        .optional()
        .describe("ISO 8601 datetime to schedule (ignored if publish_now=true)"),
}, async ({ topic, account_id, formula, publish_now, schedule_at }) => {
    const body = { topic, account_id, formula };
    if (publish_now) {
        body.publish_now = true;
    }
    else if (schedule_at) {
        body.schedule_at = schedule_at;
    }
    else {
        body.auto_optimize_time = true;
    }
    const data = await apiCall("POST", "/content/generate-and-schedule", body);
    const timeInfo = data.scheduledAt
        ? `Scheduled for: ${data.scheduledAt}`
        : `Status: ${data.status}`;
    return {
        content: [
            {
                type: "text",
                text: `Generated & ${publish_now ? "published" : "scheduled"}!\n\nFormula: ${data.formula}\nPost ID: ${data.postId}\n${timeInfo}\n\nContent:\n${data.text}`,
            },
        ],
    };
});
// ── Tool: analytics ───────────────────────────────────────────────────────────
server.tool("mindthread_analytics", "Get engagement analytics and optimization suggestions for a Threads account", {
    account_id: z.string().describe("Account ID (from mindthread_list_accounts)"),
    period: z
        .enum(["7d", "14d", "30d"])
        .default("7d")
        .describe("Analysis period"),
}, async ({ account_id, period }) => {
    const data = await apiCall("GET", `/analytics/insights?account_id=${account_id}&period=${period}`);
    const lines = [
        `Analytics for ${data.period}:`,
        `Posts: ${data.totalPosts} | Views: ${data.totalViews} | Likes: ${data.totalLikes} | Replies: ${data.totalReplies}`,
        `Avg views/post: ${data.avgViews}`,
        "",
        "Best formulas:",
        ...data.bestFormulas.map((f) => `  ${f.formula}: ${f.avgViews} avg views`),
        "",
        "Best time slots:",
        ...data.bestTimeSlots.map((t) => `  ${t.hour}:00 — ${t.avgViews} avg views`),
        "",
        "Suggestions:",
        ...data.suggestions.map((s) => `  - ${s}`),
    ];
    return {
        content: [{ type: "text", text: lines.join("\n") }],
    };
});
// ── Tool: list_formulas ───────────────────────────────────────────────────────
server.tool("mindthread_list_formulas", "List all available content generation formulas with descriptions", {}, async () => {
    const data = await apiCall("GET", "/formulas");
    const lines = data.formulas.map((f) => `**${f.name}** (${f.id})\n${f.description}\nExample: ${f.example}`);
    return {
        content: [
            {
                type: "text",
                text: lines.join("\n\n"),
            },
        ],
    };
});
// ── Tool: generate_thread ─────────────────────────────────────────────────────
server.tool("mindthread_generate_thread", "Generate a multi-part Threads thread (串文). Returns 2-10 connected parts for publishing as a thread chain.", {
    topic: z.string().describe("The topic to generate a thread about"),
    thread_count: z
        .number()
        .min(2)
        .max(10)
        .default(3)
        .describe("Number of thread parts to generate (2-10)"),
    formula: z
        .enum(["auto", "controversial", "curiosity", "binary_choice", "personal", "list"])
        .default("auto")
        .describe("Content formula"),
    account_id: z
        .string()
        .optional()
        .describe("Account ID for brand voice (optional)"),
}, async ({ topic, thread_count, formula, account_id }) => {
    const body = { topic, thread_count, formula };
    if (account_id)
        body.account_id = account_id;
    const data = await apiCall("POST", "/content/generate-thread", body);
    const parts = data.data.thread_parts
        .map((p) => `[${p.index}/${data.data.total_parts}] (${p.char_count} chars)\n${p.text}`)
        .join("\n\n---\n\n");
    return {
        content: [
            {
                type: "text",
                text: `Generated ${data.data.total_parts}-part thread (formula: ${data.data.formula_used}):\n\n${parts}`,
            },
        ],
    };
});
// ── Tool: publish_thread ─────────────────────────────────────────────────────
server.tool("mindthread_publish_thread", "Publish a multi-part thread to Threads. Each part is published as a reply to the previous, creating a thread chain.", {
    account_id: z.string().describe("Account ID (from mindthread_list_accounts)"),
    thread_parts: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe("Array of thread part texts (2-10 parts, each max 500 chars)"),
}, async ({ account_id, thread_parts }) => {
    const data = await apiCall("POST", "/content/publish-thread", {
        account_id,
        thread_parts,
    });
    return {
        content: [
            {
                type: "text",
                text: `Thread published! ${data.data.parts_published} parts.\nPost ID: ${data.data.post_id}\nThread IDs: ${data.data.thread_post_ids.join(", ")}`,
            },
        ],
    };
});
// ── Tool: create_webhook ─────────────────────────────────────────────────────
server.tool("mindthread_create_webhook", "Register a webhook endpoint to receive real-time events (post.published, post.failed, reply.sent, token.expiring, usage.threshold)", {
    url: z.string().describe("HTTPS URL to receive webhook POST requests"),
    events: z
        .array(z.enum(["post.published", "post.failed", "reply.sent", "token.expiring", "usage.threshold"]))
        .describe("Event types to subscribe to"),
    secret: z
        .string()
        .optional()
        .describe("Secret key for HMAC-SHA256 signature verification (recommended)"),
}, async ({ url, events, secret }) => {
    const data = await apiCall("POST", "/webhooks", {
        url,
        events,
        secret,
    });
    return {
        content: [
            {
                type: "text",
                text: `Webhook created!\nID: ${data.data.id}\nURL: ${data.data.url}\nEvents: ${data.data.events.join(", ")}`,
            },
        ],
    };
});
// ── Tool: list_webhooks ──────────────────────────────────────────────────────
server.tool("mindthread_list_webhooks", "List all registered webhook endpoints", {}, async () => {
    const data = await apiCall("GET", "/webhooks");
    if (!data.data.webhooks.length) {
        return { content: [{ type: "text", text: "No webhooks registered." }] };
    }
    const lines = data.data.webhooks.map((w) => `${w.active ? "✓" : "✗"} ${w.url}\n  ID: ${w.id}\n  Events: ${w.events.join(", ")}\n  Failures: ${w.fail_count}`);
    return {
        content: [{ type: "text", text: lines.join("\n\n") }],
    };
});
// ── Tool: delete_webhook ─────────────────────────────────────────────────────
server.tool("mindthread_delete_webhook", "Delete a registered webhook endpoint", {
    webhook_id: z.string().describe("Webhook ID to delete"),
}, async ({ webhook_id }) => {
    await apiCall("DELETE", `/webhooks/${webhook_id}`);
    return {
        content: [{ type: "text", text: `Webhook ${webhook_id} deleted.` }],
    };
});
// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("MCP server error:", err);
    process.exit(1);
});
