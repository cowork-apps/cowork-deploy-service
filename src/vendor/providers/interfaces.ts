import type { BackendSpec, ModelInfo } from "../contracts/index.js";

export interface ProjectRef { username: string; slug: string }
export interface RepoRef { url: string; fullName: string; defaultBranch: string }
export interface ServiceRef { id: string; name: string; url: string }
export interface SiteRef { id: string; name: string; domain: string }
export interface DeployRef { id: string }
export type Heartbeat = (msg?: string) => void;

/** Where users' backends run (Render today; App Runner/ECS later). */
export interface ServiceHost {
  ensureService(p: ProjectRef, repo: RepoRef, branch: string, spec: BackendSpec): Promise<ServiceRef>;
  deploy(s: ServiceRef, commitSha: string, env: Record<string, string>): Promise<DeployRef>;
  waitLive(s: ServiceRef, d: DeployRef, hb: Heartbeat, timeoutMs?: number): Promise<void>;
}

/** Where users' frontends are served (Netlify today; S3+CloudFront later). */
export interface StaticHost {
  ensureSite(p: ProjectRef): Promise<SiteRef>;
  /** `slug` is the site label: <workspace>-<user>, served at <slug>.<domain> */
  deploy(s: SiteRef, artifactZip: Uint8Array, slug: string, title?: string): Promise<DeployRef>;
  /** Resolves once the deploy is served. `url` is the custom-domain address; `tlsReady` says whether it already answers over HTTPS; `fallbackUrl` always works. */
  waitReady(s: SiteRef, d: DeployRef, hb: Heartbeat, timeoutMs?: number): Promise<{ url: string; fallbackUrl: string; tlsReady: boolean }>;
}

/** Platform-owned source control (GitHub org today). */
export interface SourceRepo {
  ensureRepo(p: ProjectRef): Promise<RepoRef>;
  /** short-lived credential the runtime uses for `git push` */
  pushCredentials(p: ProjectRef): Promise<{ username: string; token: string; expiresAt?: string }>;
  deleteRepo?(p: ProjectRef): Promise<void>;
}

/** LLM catalog + model handle construction. */
export interface LLMProvider {
  id: "openrouter" | "anthropic" | "openai";
  baseUrl: string;
  listModels(): Promise<ModelInfo[]>;
}

export interface SpeechProvider {
  id: "sarvam";
  listSttModels(): ModelInfo[];
  transcribe(audio: Blob | Uint8Array, opts: { model: string; languageCode?: string }): Promise<{ text: string; languageCode?: string }>;
}
