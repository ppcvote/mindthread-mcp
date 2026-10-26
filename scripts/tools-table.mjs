// Builds the README "## Tools" table from the live server, so the docs never drift from what the server exposes.
// Usage: npm run tools-table            print the table
//        npm run tools-table -- --write replace the block between the TOOLS markers in README.md
import { readFileSync, writeFileSync } from "node:fs";

const res = await fetch("https://mindthread.tw/api/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
const { result } = await res.json();
const esc = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const firstSentence = (s) => {
  const f = esc(s).split(/(?<=\.)\s/)[0];
  return f.length <= 140 ? f : f.slice(0, f.lastIndexOf(" ", 140)) + " …";
};
const rows = result.tools.map((t) => `| \`${t.name}\` | ${esc(t.title)} | ${t.annotations?.readOnlyHint ? "read" : "write"} | ${firstSentence(t.description)} |`);
const table = ["| Tool | Title | Kind | What it does |", "|------|-------|------|--------------|", ...rows].join("\n");

if (process.argv.includes("--write")) {
  const path = new URL("../README.md", import.meta.url);
  const readme = readFileSync(path, "utf8");
  const next = readme.replace(/<!-- TOOLS:START -->[\s\S]*?<!-- TOOLS:END -->/, `<!-- TOOLS:START -->\n${table}\n<!-- TOOLS:END -->`);
  if (next === readme) process.stderr.write("README.md already up to date\n");
  else { writeFileSync(path, next); process.stderr.write("README.md updated\n"); }
} else process.stdout.write(table + "\n");
process.stderr.write(`${result.tools.length} tools\n`);
