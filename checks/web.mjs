import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const port = 20000 + Math.floor(Math.random() * 30000);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      APP_URL: "",
      SESSION_SECRET: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
    },
  },
);
let logs = "";
server.stdout.on("data", (b) => (logs += b));
server.stderr.on("data", (b) => (logs += b));
try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  for (const [path, title] of [
    ["/", "One day at a time."],
    ["/calendar", "Your week, laid out."],
    ["/performance", "Progress, at your pace."],
  ]) {
    const r = await fetch(`http://127.0.0.1:${port}${path}?qa=${Date.now()}`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(!html.includes("Pilot password"));
    assert.ok(!html.includes("Recent sample sessions"));
    assert.ok(!html.includes("Personal bests · sample records"));
    assert.ok(!html.includes("Pick up the pace"));
    assert.ok(!html.includes("Build your foundation"));
    assert.ok(html.includes("Connected activity data"));
    assert.ok(html.includes("Continue with Strava"));
    assert.ok(html.includes(title), `${path} server-rendered title`);
    assert.ok(
      html.includes("Connections &amp; sync"),
      `${path} connection controls`,
    );
  }
  const status = await fetch(`http://127.0.0.1:${port}/api/sync?route=status`);
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await status.json()).configured, false);
  const bad = await fetch(`http://127.0.0.1:${port}/api/sync?route=login`, {
    method: "POST",
    body: "invalid",
  });
  assert.equal(bad.status, 400);
  const large = await fetch(`http://127.0.0.1:${port}/api/sync?route=login`, {
    method: "POST",
    body: "x".repeat(33000),
  });
  assert.equal(large.status, 413);
  const method = await fetch(`http://127.0.0.1:${port}/api/sync`, {
    method: "DELETE",
  });
  assert.equal(method.status, 405);
  console.log(
    "Production HTTP checks passed: all three pages, API status, invalid JSON, body limit, unsupported methods.",
  );
} catch (e) {
  process.stderr.write(logs);
  throw e;
} finally {
  server.kill("SIGTERM");
}
