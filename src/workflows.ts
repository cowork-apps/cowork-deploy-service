/** DeployWorkflow — orchestration only. Every activity is I/O: call an API, poll, post an event. */
import { proxyActivities, defineSignal, defineQuery, setHandler, ApplicationFailure, CancelledFailure, isCancellation } from "@temporalio/workflow";
import type * as activities from "./activities.js";
import type { DeployInput } from "./types.js";
import { persistenceEnv } from "./persistence.js";

const { emit, renderEnsure, renderDeploy, renderWaitLive, finalize } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { initialInterval: "5s", backoffCoefficient: 2, maximumInterval: "1m", maximumAttempts: 5, nonRetryableErrorTypes: ["ConfigError", "BuildError"] },
});
// the frontend build+publish is one long call into the Worker (build, upload, DNS/TLS wait); it heartbeats on a timer
const { buildFrontend } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "5 minutes",
  retry: { initialInterval: "10s", maximumAttempts: 2, nonRetryableErrorTypes: ["ConfigError", "BuildError"] },
});

export const cancelSignal = defineSignal("cancel");
export const statusQuery = defineQuery<string>("status");

export async function DeployWorkflow(input: DeployInput): Promise<{ frontendUrl: string; backendUrl?: string }> {
  let status = "RUNNING";
  setHandler(statusQuery, () => status);
  setHandler(cancelSignal, () => { status = "CANCELLING"; });
  try {
    let backendUrl: string | undefined;
    if (input.manifest.kind === "fullstack") {
      await emit(input.id, "backend.ensure", "started", "Render: create or update the web service");
      const svc = await renderEnsure(input);
      await emit(input.id, "backend.ensure", "ok", `${svc.name} → ${svc.url}`);
      await emit(input.id, "backend.deploy", "started", `deploying commit ${input.commitSha.slice(0, 7)}`);
      const dep = await renderDeploy(svc, input.commitSha, { ...(input.manifest.backend?.env ?? {}), ...persistenceEnv(input) });
      await emit(input.id, "backend.deploy", "ok", `deploy ${dep.id} queued`);
      await emit(input.id, "backend.wait", "started", "waiting for Render build + health check");
      await renderWaitLive(svc, dep, input.manifest.backend?.health ?? "/health");
      backendUrl = svc.url;
      await emit(input.id, "backend.wait", "ok", `${backendUrl} is healthy`, { backendUrl });
    } else {
      await emit(input.id, "backend.ensure", "ok", "static project: no backend");
    }
    const fe = await buildFrontend(input, backendUrl); // the Worker emits the frontend.* events itself
    status = "LIVE";
    await finalize(input.id, "LIVE", { frontendUrl: fe.frontendUrl, backendUrl, customUrl: fe.customUrl });
    return { frontendUrl: fe.frontendUrl, backendUrl };
  } catch (e) {
    const msg = e instanceof ApplicationFailure ? `${e.type ? e.type + ": " : ""}${e.message}` : String((e as Error)?.message ?? e);
    status = isCancellation(e) || e instanceof CancelledFailure ? "CANCELLED" : "FAILED";
    await finalize(input.id, status, { error: msg.slice(0, 500) });
    throw e;
  }
}
