import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const port = 3100;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  "npm",
  ["run", "start", "--", "-H", "127.0.0.1", "-p", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Le serveur Next.js n'a pas démarré dans le délai imparti");
}

async function check(path, expectedStatus, maximumBytes = 500_000) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const body = await response.arrayBuffer();
  const durationMs = Math.round(performance.now() - startedAt);
  assert.equal(
    response.status,
    expectedStatus,
    `${path} retourne ${response.status}`,
  );
  assert.ok(
    body.byteLength < maximumBytes,
    `${path} dépasse ${maximumBytes} octets`,
  );
  assert.ok(durationMs < 2_000, `${path} dépasse 2 secondes en local`);
  return { path, status: response.status, bytes: body.byteLength, durationMs };
}

try {
  await waitForServer();
  const results = [];
  results.push(await check("/", 200));
  results.push(await check("/carte?incident=saumos-2026-fixture", 200));
  results.push(await check("/evenements/saumos-2026-fixture", 200));
  results.push(await check("/acheter/saumos-2026-fixture", 200));
  results.push(await check("/sitemap.xml", 200, 100_000));
  results.push(await check("/robots.txt", 200, 10_000));
  results.push(await check("/api/health", 200, 10_000));
  results.push(await check("/api/download/invalid", 404, 10_000));
  const headers = await fetch(baseUrl);
  assert.equal(headers.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    headers.headers.get("cross-origin-opener-policy"),
    "same-origin",
  );
  console.log(JSON.stringify({ status: "passed", results }, null, 2));
} finally {
  server.kill("SIGTERM");
}
