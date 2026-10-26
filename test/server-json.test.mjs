// server.json (official MCP Registry) must agree with package.json, or `mcp-publisher publish` rejects it
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const pkg = read("../package.json");
const server = read("../server.json");
const glama = read("../glama.json");

test("server.json matches package.json", () => {
  assert.equal(server.name, pkg.mcpName, "server.json name must equal package.json mcpName (npm ownership check)");
  assert.match(server.name, /^io\.github\.ppcvote\/[a-zA-Z0-9._-]+$/);
  assert.equal(server.version, pkg.version);
  assert.ok(server.description.length >= 1 && server.description.length <= 100, "description is 1-100 chars");
  const npm = server.packages.find((p) => p.registryType === "npm");
  assert.equal(npm.identifier, pkg.name);
  assert.equal(npm.version, pkg.version);
  assert.equal(npm.transport.type, "stdio");
  assert.ok(npm.environmentVariables.some((e) => e.name === "MINDTHREAD_API_KEY" && e.isSecret));
  assert.equal(server.repository.url, pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""));
});

test("remote points at the hosted endpoint", () => {
  const r = server.remotes[0];
  assert.equal(r.type, "streamable-http");
  assert.equal(r.url, "https://mindthread.tw/api/mcp");
  for (const h of r.headers) assert.ok(h.isSecret, "auth headers are secret");
});

test("glama.json lists the GitHub maintainer", () => {
  assert.equal(glama.$schema, "https://glama.ai/mcp/schemas/server.json");
  assert.deepEqual(glama.maintainers, ["ppcvote"]);
});

test("bin entry exists and has a shebang", () => {
  const bin = readFileSync(new URL("../" + pkg.bin["mindthread-mcp"], import.meta.url), "utf8");
  assert.ok(bin.startsWith("#!/usr/bin/env node"));
});
