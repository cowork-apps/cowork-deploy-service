import { json, sleep, HttpError } from "../http.js";
import type { StaticHost, ProjectRef, SiteRef, DeployRef, Heartbeat } from "../interfaces.js";

/**
 * Netlify on the Free plan: ONE SITE PER WORKSPACE, custom domain <workspace>-<user>.<domain>. Every deploy of the
 * project is a new deploy on that same site, so the certificate is issued once and later deploys are instant; Netlify
 * keeps the per-deploy history (deploy_ssl_url) for rollback. The domain is on Netlify DNS, so Netlify creates the DNS
 * record and provisions TLS itself. At scale this becomes S3+CloudFront behind the same interface.
 */
export class NetlifyStaticHost implements StaticHost {
  constructor(private token: string, private accountSlug: string, private domain: string) {}
  private api = "https://api.netlify.com/api/v1";

  async ensureSite(p: ProjectRef): Promise<SiteRef> {
    return { id: "", name: `${p.username}-${p.slug}`, domain: this.domain };
  }

  async deploy(s: SiteRef, artifactZip: Uint8Array, slug: string, title = "cowork deploy"): Promise<DeployRef> {
    const hostname = `${slug}.${s.domain}`;
    const site = await this.ensureDeploySite(slug, hostname);
    const url = `${this.api}/sites/${site.id}/deploys?title=${encodeURIComponent(title)}`;
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/zip" }, body: new Blob([new Uint8Array(artifactZip).buffer as ArrayBuffer]) });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, url, text);
    return { id: `${site.id}:${JSON.parse(text).id}` };
  }

  async waitReady(s: SiteRef, d: DeployRef, hb: Heartbeat, timeoutMs = 5 * 60_000, tlsWaitMs = 90_000) {
    const [siteId, deployId] = d.id.split(":");
    const t0 = Date.now();
    let fallbackUrl = "";
    while (Date.now() - t0 < timeoutMs) {
      const dep = await json(`${this.api}/sites/${siteId}/deploys/${deployId}`, { token: this.token });
      hb(`netlify deploy ${dep.state}`);
      if (dep.state === "error") throw new Error(`Netlify deploy error: ${dep.error_message ?? "unknown"}`);
      if (dep.state === "ready") { fallbackUrl = dep.deploy_ssl_url ?? `https://${dep.name ?? siteId}.netlify.app`; break; } // ssl_url is the custom domain once one is set
      await sleep(4_000);
    }
    if (!fallbackUrl) throw new Error("Netlify deploy timed out");
    const site = await json(`${this.api}/sites/${siteId}`, { token: this.token });
    const custom = site.custom_domain as string | undefined;
    if (!custom) return { url: fallbackUrl, fallbackUrl, tlsReady: true };
    // nudge certificate provisioning now that the deploy exists, then give TLS a bounded chance to come up.
    // Netlify's own `ssl` flag is the source of truth: an HTTP probe from a Worker can succeed against the
    // wildcard *.netlify.app certificate and report a false "ready" (seen 2026-09-07).
    try { await json(`${this.api}/sites/${siteId}/ssl`, { method: "POST", token: this.token }); } catch { /* provisioned lazily */ }
    const url = `https://${custom}`; const t1 = Date.now();
    while (Date.now() - t1 < tlsWaitMs) {
      if (await this.siteTls(siteId)) { hb(`${custom} certificate issued`); return { url, fallbackUrl, tlsReady: true }; }
      hb(`${custom} waiting for certificate`);
      await sleep(10_000);
    }
    return { url, fallbackUrl, tlsReady: false };
  }

  /** Cheap re-check used after the deployment is already live: has Netlify issued the certificate for this address yet? */
  async customReady(url: string) {
    const host = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const label = host.endsWith(`.${this.domain}`) ? host.slice(0, -(this.domain.length + 1)) : host;
    const sites: any[] = await json(`${this.api}/sites?name=${encodeURIComponent(`cw-${label}`)}&filter=all`, { token: this.token }).catch(() => []);
    const site = sites.find((s) => s.custom_domain === host);
    return !!site && (await this.siteTls(site.id));
  }

  /** True once Netlify reports a provisioned certificate for the site's custom domain. */
  private async siteTls(siteId: string) {
    const s = await json(`${this.api}/sites/${siteId}`, { token: this.token }).catch(() => null);
    return !!s?.ssl;
  }

  private async ensureDeploySite(slug: string, hostname: string) {
    const name = `cw-${slug}`; // Netlify site names are global across all of Netlify, so prefix ours
    const sites: any[] = await json(`${this.api}/sites?name=${encodeURIComponent(name)}&filter=all`, { token: this.token });
    let site = sites.find((s) => s.name === name);
    if (!site) {
      site = await json(`${this.api}/${this.accountSlug}/sites`, { method: "POST", token: this.token, body: JSON.stringify({ name, custom_domain: hostname, processing_settings: { skip: true } }) });
    } else if (site.custom_domain !== hostname) {
      site = await json(`${this.api}/sites/${site.id}`, { method: "PATCH", token: this.token, body: JSON.stringify({ custom_domain: hostname }) });
    }
    if (!site.ssl) { try { await json(`${this.api}/sites/${site.id}/ssl`, { method: "POST", token: this.token }); } catch { /* provisioned lazily by Netlify; ignore */ } }
    return site;
  }
}
