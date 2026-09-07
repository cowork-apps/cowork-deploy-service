import { z } from "zod";

/** cowork.json — written by the agent at the project root; the contract between agent and deploy pipeline. */
export const FrontendSpec = z.object({
  dir: z.string().default("."),
  build: z.string().default("npm ci && npm run build"),
  publish: z.string().default("dist"),
  /** env var the frontend reads for the backend base URL (injected at build time) */
  apiUrlEnv: z.string().default("VITE_API_URL"),
});

export const BackendSpec = z.object({
  dir: z.string().default("api"),
  runtime: z.enum(["python", "node"]),
  build: z.string(),
  /** must bind 0.0.0.0:$PORT */
  start: z.string(),
  health: z.string().default("/health"),
  env: z.record(z.string()).default({}),
});

export const Manifest = z.object({
  version: z.literal(1),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  kind: z.enum(["static", "fullstack"]),
  frontend: FrontendSpec,
  backend: BackendSpec.optional(),
}).refine((m) => m.kind === "static" || !!m.backend, { message: "fullstack projects need a backend section" });

export type Manifest = z.infer<typeof Manifest>;
export type FrontendSpec = z.infer<typeof FrontendSpec>;
export type BackendSpec = z.infer<typeof BackendSpec>;
