import type { Manifest } from "./vendor/contracts/index.js";
export type DeployInput = { id: string; projectId: string; username: string; slug: string; repoUrl: string; branch: string; commitSha: string; manifest: Manifest; deployDomain: string; appdata?: { url: string; token: string; agentUrl: string; dbPath: string } };
export type StepStatus = "started" | "ok" | "failed";
export const TASK_QUEUE = "cowork-deploy";
