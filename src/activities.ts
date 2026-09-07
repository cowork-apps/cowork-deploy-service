import { ApplicationFailure, heartbeat, Context } from "@temporalio/activity";
import { RenderServiceHost, type ServiceRef, type DeployRef } from "./vendor/providers/index.js";
import type { DeployInput, StepStatus } from "./types.js";

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing env ${k}`); return v; };
const control = () => env("CONTROL_URL");
const auth = () => ({ Authorization: `Bearer ${env("DEPLOY_SERVICE_SECRET")}`, "Content-Type": "application/json" });
const render = () => new RenderServiceHost(env("RENDER_API_KEY"), env("RENDER_OWNER_ID"));

export async function emit(id: string, step: string, status: StepStatus, message?: string, data?: unknown) {
  await fetch(`${control()}/api/internal/deployments/${id}/events`, { method: "POST", headers: auth(), body: JSON.stringify({ step, status, message, data }) });
}

export async function renderEnsure(input: DeployInput): Promise<ServiceRef> {
  if (!input.manifest.backend) throw ApplicationFailure.create({ type: "ConfigError", message: "fullstack project without a backend section" });
  return render().ensureService({ username: input.username, slug: input.slug }, { url: input.repoUrl, fullName: input.repoUrl, defaultBranch: "main" }, "main", withPersistence(input));
}
/** Wrap the backend's build/start so the Cowork sidecar restores and snapshots its SQLite file (see control/src/appdata.ts). */
export function withPersistence(input: DeployInput) {
  const spec = input.manifest.backend!;
  if (!input.appdata) return spec;
  const q = (s: string) => '"' + s.replace(/(["\\$`])/g, "\\$1") + '"';
  const start = `if command -v python3 >/dev/null 2>&1; then exec python3 .cowork-persist.py -- ${q(spec.start)}; else ${spec.start}; fi`;
  return { ...spec, build: `${spec.build} && curl -fsSL ${input.appdata.agentUrl} -o .cowork-persist.py`, start };
}
export async function renderDeploy(svc: ServiceRef, commitSha: string, envVars: Record<string, string>): Promise<DeployRef> {
  return render().deploy(svc, commitSha, envVars);
}
export async function renderWaitLive(svc: ServiceRef, dep: DeployRef, healthPath: string) {
  const r = render();
  try { await r.waitLive(svc, dep, (m?: string) => heartbeat(m), 15 * 60_000); }
  catch (e) { throw ApplicationFailure.create({ type: "BuildError", message: String((e as Error).message ?? e) }); }
  await r.waitHealthy(svc.url, healthPath, (m?: string) => heartbeat(m), 3 * 60_000);
}

/** The Worker builds inside the project sandbox and uploads to Netlify; this activity just waits for it. */
export async function buildFrontend(input: DeployInput, backendUrl?: string): Promise<{ frontendUrl: string; customUrl?: string; fallbackUrl?: string }> {
  const ctx = Context.current(); // capture: timers run outside the activity's async context
  const hb = setInterval(() => { try { ctx.heartbeat("building/publishing frontend"); } catch { /* ignore */ } }, 20_000);
  let res: Response;
  try {
    res = await fetch(`${control()}/api/internal/deployments/${input.id}/build-frontend`, { method: "POST", headers: auth(),
      body: JSON.stringify({ projectId: input.projectId, username: input.username, slug: input.slug, branch: input.branch, commitSha: input.commitSha, manifest: input.manifest, backendUrl, repoUrl: input.repoUrl }) });
  } finally { clearInterval(hb); }
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw ApplicationFailure.create({ type: res.status === 500 && /build failed/.test(j.error ?? "") ? "BuildError" : "Error", message: j.error ?? `build-frontend ${res.status}` });
  return j;
}

export async function finalize(id: string, status: string, extra: { frontendUrl?: string; backendUrl?: string; customUrl?: string; error?: string }) {
  const { customUrl, ...rest } = extra;
  const pendingCustom = customUrl && customUrl !== extra.frontendUrl;
  const message = status !== "LIVE" ? extra.error
    : pendingCustom ? `live at ${extra.frontendUrl}. Your address ${customUrl} will take over as soon as its certificate is issued (usually a few minutes).`
    : `live at ${extra.frontendUrl}`;
  await fetch(`${control()}/api/internal/deployments/${id}/events`, { method: "POST", headers: auth(),
    body: JSON.stringify({ step: "record", status: status === "LIVE" ? "ok" : "failed", message, deploymentStatus: status, ...rest }) });
}
