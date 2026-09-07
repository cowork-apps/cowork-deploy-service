import { serviceName, type BackendSpec } from "../../contracts/index.js";
import { json, sleep } from "../http.js";
import type { ServiceHost, ProjectRef, RepoRef, ServiceRef, DeployRef, Heartbeat } from "../interfaces.js";

const RUNTIME: Record<BackendSpec["runtime"], string> = { python: "python", node: "node" };

export class RenderServiceHost implements ServiceHost {
  constructor(private token: string, private ownerId: string) {}
  private api = "https://api.render.com/v1";

  async ensureService(p: ProjectRef, repo: RepoRef, branch: string, spec: BackendSpec): Promise<ServiceRef> {
    const name = serviceName(p.username, p.slug);
    const existing: any[] = await json(`${this.api}/services?name=${encodeURIComponent(name)}&ownerId=${this.ownerId}&limit=5`, { token: this.token });
    const found = existing.map((x) => x.service).find((s) => s?.name === name);
    if (found) {
      // keep branch/commands in sync with the manifest
      await json(`${this.api}/services/${found.id}`, {
        method: "PATCH", token: this.token,
        body: JSON.stringify({ branch, rootDir: spec.dir, serviceDetails: { envSpecificDetails: { buildCommand: spec.build, startCommand: spec.start } } }),
      });
      return { id: found.id, name, url: found.serviceDetails?.url ?? `https://${name}.onrender.com` };
    }
    const created = await json(`${this.api}/services`, {
      method: "POST", token: this.token,
      body: JSON.stringify({
        type: "web_service", name, ownerId: this.ownerId, repo: repo.url.replace(/\.git$/, ""), branch, autoDeploy: "no", rootDir: spec.dir,
        envVars: Object.entries(spec.env).map(([key, value]) => ({ key, value })),
        serviceDetails: { runtime: RUNTIME[spec.runtime], plan: "free", region: "singapore", healthCheckPath: spec.health,
          envSpecificDetails: { buildCommand: spec.build, startCommand: spec.start } },
      }),
    });
    const s = created.service;
    return { id: s.id, name, url: s.serviceDetails?.url ?? `https://${name}.onrender.com` };
  }

  async deploy(s: ServiceRef, commitSha: string, env: Record<string, string>): Promise<DeployRef> {
    if (Object.keys(env).length) {
      await json(`${this.api}/services/${s.id}/env-vars`, { method: "PUT", token: this.token,
        body: JSON.stringify(Object.entries(env).map(([key, value]) => ({ key, value }))) });
    }
    // Render starts a build on service creation and answers 202 with an empty body if one is already queued,
    // so: reuse an in-flight deploy for this commit if there is one, else trigger and re-list.
    const inflight = await this.findDeploy(s, commitSha);
    if (inflight) return inflight;
    const d = await json(`${this.api}/services/${s.id}/deploys`, { method: "POST", token: this.token, body: JSON.stringify({ commitId: commitSha, clearCache: "do_not_clear" }) });
    if (d?.id) return { id: d.id };
    await sleep(3_000);
    const again = await this.findDeploy(s, commitSha);
    if (!again) throw new Error("Render accepted the deploy but it never appeared in the deploy list");
    return again;
  }

  private async findDeploy(s: ServiceRef, commitSha: string): Promise<DeployRef | null> {
    const list: any[] = await json(`${this.api}/services/${s.id}/deploys?limit=10`, { token: this.token });
    // Only an in-flight deploy of this commit is reusable. A finished ("live") one must not short-circuit a new
    // deploy: the service's commands or env may have changed since (e.g. enabling the persistence sidecar).
    const INFLIGHT = new Set(["created", "queued", "build_in_progress", "update_in_progress", "pre_deploy_in_progress"]);
    const hit = list.map((x) => x.deploy).find((d) => d.commit?.id?.startsWith(commitSha) && INFLIGHT.has(d.status));
    return hit ? { id: hit.id } : null;
  }

  async waitLive(s: ServiceRef, d: DeployRef, hb: Heartbeat, timeoutMs = 15 * 60_000): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const dep = await json(`${this.api}/services/${s.id}/deploys/${d.id}`, { token: this.token });
      hb(`render deploy ${dep.status}`);
      if (dep.status === "live") return;
      if (["build_failed", "update_failed", "canceled", "deactivated", "pre_deploy_failed"].includes(dep.status)) throw new Error(`Render deploy ${dep.status}`);
      await sleep(10_000);
    }
    throw new Error("Render deploy timed out");
  }

  async waitHealthy(url: string, path: string, hb: Heartbeat, timeoutMs = 3 * 60_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { const r = await fetch(url + path); hb(`health ${r.status}`); if (r.ok) return; } catch (e) { hb(`health ${String(e).slice(0, 60)}`); }
      await sleep(5_000);
    }
    throw new Error("backend never became healthy");
  }
}
