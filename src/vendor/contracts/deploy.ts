import { z } from "zod";
import { Manifest } from "./manifest.js";

export const DeploymentStatus = z.enum(["QUEUED", "RUNNING", "LIVE", "FAILED", "CANCELLED"]);
export const DeployStep = z.enum([
  "validate", "backend.ensure", "backend.deploy", "backend.wait", "frontend.build", "frontend.ensure", "frontend.deploy", "frontend.wait", "record",
]);

export const CreateDeploymentRequest = z.object({
  projectSlug: z.string(),
  repoUrl: z.string().url(),
  branch: z.string(),
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/),
  manifest: Manifest,
});

export const DeploymentEvent = z.object({
  deploymentId: z.string(),
  ts: z.string(),
  step: DeployStep,
  status: z.enum(["started", "ok", "failed"]),
  message: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

export const Deployment = z.object({
  id: z.string(),
  projectId: z.string(),
  commitSha: z.string(),
  branch: z.string(),
  kind: z.enum(["static", "fullstack"]),
  status: DeploymentStatus,
  frontendUrl: z.string().nullable(),
  backendUrl: z.string().nullable(),
  error: z.string().nullable(),
  workflowId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateDeploymentRequest = z.infer<typeof CreateDeploymentRequest>;
export type DeploymentEvent = z.infer<typeof DeploymentEvent>;
export type Deployment = z.infer<typeof Deployment>;
export type DeployStep = z.infer<typeof DeployStep>;

/** Branch name doubles as the Netlify branch-deploy subdomain: <sha7>-<username>.<domain> */
export const deployBranchName = (commitSha: string, username: string) => `${commitSha.slice(0, 7)}-${username}`;
export const serviceName = (username: string, slug: string) => `tg-${username}-${slug}`.slice(0, 63);
export const repoName = (username: string, slug: string) => `${username}-${slug}`;
/** Stable public address label for a workspace: <workspace>-<user>.<deploy domain>. Every deploy of the project lands here. */
export const siteHost = (username: string, slug: string) => `${slug}-${username}`.slice(0, 63);
