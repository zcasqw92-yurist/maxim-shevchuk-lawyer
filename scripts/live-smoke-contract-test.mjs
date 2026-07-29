import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.LIVE_SMOKE_CONTRACT_PORT || 4199);
const previewUrl = `http://127.0.0.1:${port}/`;
const info = JSON.parse(await readFile(join(root, "dist", "build-info.json"), "utf8"));

const waitForPreview = async () => {
  let lastError = "preview server did not start";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(new URL("build-info.json", previewUrl), { cache: "no-store" });
      if (response.ok) return;
      lastError = `preview returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(lastError);
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, options);
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(" ")} failed with ${signal || `exit code ${code}`}`));
  });
});

const server = spawn(process.execPath, ["scripts/server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  await waitForPreview();
  await run(process.execPath, ["scripts/live-smoke.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      SITE_PUBLIC_URL: previewUrl,
      SITE_CANONICAL_URL: site.siteUrl,
      EXPECTED_BUILD_SHA: info.sha,
      LIVE_SMOKE_ATTEMPTS: "2",
      LIVE_SMOKE_DELAY_MS: "1000",
    },
    stdio: "inherit",
  });
  console.log(`Live smoke contract passed against local production build ${info.sha.slice(0, 12)} · Chromium and WebKit`);
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode !== null) resolve();
    else {
      server.once("exit", resolve);
      setTimeout(() => {
        server.kill("SIGKILL");
        resolve();
      }, 2_000).unref();
    }
  });
}
