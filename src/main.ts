/** deploy-service: HTTP front door for the Worker + Temporal worker for DeployWorkflow. Runs on Render (free web service). */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Connection, Client, WorkflowIdReusePolicy } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./activities.js";
import { TASK_QUEUE, type DeployInput } from "./types.js";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing env ${k}`); return v; };

/**
 * TEMPORAL_MODE=cloud   → Temporal Cloud with an API key (TEMPORAL_ADDRESS is the regional endpoint, e.g. ap-south-1.aws.api.temporal.io:7233)
 * TEMPORAL_MODE=embedded → run `temporal server start-dev` in this process group (SQLite file; fine for the demo, history is lost on redeploy)
 */
const mode = process.env.TEMPORAL_MODE ?? (process.env.TEMPORAL_API_KEY ? "cloud" : "embedded");
let address: string, namespace: string, apiKey: string | undefined, tls = false;
if (mode === "cloud") { address = env("TEMPORAL_ADDRESS"); namespace = env("TEMPORAL_NAMESPACE"); apiKey = env("TEMPORAL_API_KEY"); tls = true; }
else {
  address = "127.0.0.1:7233"; namespace = "default";
  const bin = process.env.TEMPORAL_BIN ?? (await ensureTemporalBinary());
  const child = spawn(bin, ["server", "start-dev", "--ip", "127.0.0.1", "--port", "7233", "--ui-port", "8233", "--db-filename", process.env.TEMPORAL_DB ?? "/tmp/temporal.db", "--log-level", "warn"], { stdio: "inherit" });
  child.on("exit", (code) => { console.error(`embedded temporal exited (${code})`); process.exit(1); });
  await new Promise((r) => setTimeout(r, 4000));
}
console.log(`temporal mode=${mode} address=${address} namespace=${namespace}`);

/** Find or download the Temporal CLI (embedded mode). Render's build snapshot dropped ./bin, so fall back to a runtime download into /tmp. */
async function ensureTemporalBinary(): Promise<string> {
  const { execSync } = await import("node:child_process");
  const { mkdirSync, chmodSync } = await import("node:fs");
  for (const c of ["bin/temporal", "/opt/render/project/src/bin/temporal", "/tmp/temporal-cli/temporal"]) if (existsSync(c)) return c;
  try { execSync("command -v temporal", { stdio: "ignore" }); return "temporal"; } catch { /* not on PATH */ }
  const dir = "/tmp/temporal-cli"; mkdirSync(dir, { recursive: true });
  const v = process.env.TEMPORAL_CLI_VERSION ?? "1.4.1";
  const urls = [`https://github.com/temporalio/cli/releases/download/v${v}/temporal_cli_${v}_linux_amd64.tar.gz`, "https://temporal.download/cli/archive/latest?platform=linux&arch=amd64"];
  for (const u of urls) {
    try { execSync(`curl -fsSL ${JSON.stringify(u)} | tar -xz -C ${dir} temporal`, { stdio: "ignore", timeout: 120_000 }); chmodSync(`${dir}/temporal`, 0o755); console.log(`temporal cli downloaded from ${u}`); return `${dir}/temporal`; } catch { /* try next */ }
  }
  throw new Error("could not obtain the temporal CLI binary");
}

const connection = await Connection.connect({ address, ...(tls ? { tls: true, apiKey } : {}) });
const client = new Client({ connection, namespace });

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, ts: Date.now(), taskQueue: TASK_QUEUE, temporal: mode }));
app.post("/internal/deployments", async (c) => {
  if (c.req.header("authorization") !== `Bearer ${env("DEPLOY_SERVICE_SECRET")}`) return c.json({ error: "forbidden" }, 403);
  const input = (await c.req.json()) as DeployInput;
  const handle = await client.workflow.start("DeployWorkflow", { taskQueue: TASK_QUEUE, workflowId: `deploy-${input.id}`, args: [input], workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE });
  return c.json({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId }, 202);
});
app.get("/internal/deployments/:id/status", async (c) => {
  if (c.req.header("authorization") !== `Bearer ${env("DEPLOY_SERVICE_SECRET")}`) return c.json({ error: "forbidden" }, 403);
  const h = client.workflow.getHandle(`deploy-${c.req.param("id")}`);
  try { return c.json({ status: await h.query("status") }); } catch (e) { return c.json({ error: String((e as Error).message) }, 404); }
});
app.post("/internal/deployments/:id/cancel", async (c) => {
  if (c.req.header("authorization") !== `Bearer ${env("DEPLOY_SERVICE_SECRET")}`) return c.json({ error: "forbidden" }, 403);
  await client.workflow.getHandle(`deploy-${c.req.param("id")}`).cancel();
  return c.json({ ok: true });
});
const port = Number(process.env.PORT ?? 8090);
serve({ fetch: app.fetch, port }, () => console.log(`deploy-service http on ${port}`));

const native = await NativeConnection.connect({ address, ...(tls ? { tls: true, apiKey } : {}) });
const worker = await Worker.create({ connection: native, namespace, taskQueue: TASK_QUEUE, workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)), activities, maxConcurrentActivityTaskExecutions: 10 });
console.log(`temporal worker polling ${TASK_QUEUE} on ${namespace}`);
await worker.run();
