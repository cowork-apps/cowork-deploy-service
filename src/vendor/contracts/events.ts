import { z } from "zod";

/** WebSocket frames between browser ⇄ ProjectDO ⇄ runtime. */
export const ClientFrame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prompt"), sessionId: z.string(), text: z.string(), images: z.array(z.string()).optional() }),
  z.object({ type: z.literal("abort"), sessionId: z.string() }),
  z.object({ type: z.literal("history"), sessionId: z.string() }),
  z.object({ type: z.literal("process.start"), command: z.string(), cwd: z.string().optional() }),
  z.object({ type: z.literal("process.stop"), processId: z.string() }),
  z.object({ type: z.literal("deploy") }),
  z.object({ type: z.literal("run_app") }),
]);

export const ServerFrame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("runtime.status"), state: z.enum(["waking", "restoring", "ready", "error"]), message: z.string().optional() }),
  z.object({ type: z.literal("agent.text_delta"), sessionId: z.string(), delta: z.string() }),
  z.object({ type: z.literal("agent.tool_start"), sessionId: z.string(), toolName: z.string(), args: z.unknown() }),
  z.object({ type: z.literal("agent.tool_end"), sessionId: z.string(), toolName: z.string(), ok: z.boolean(), output: z.string().optional() }),
  z.object({ type: z.literal("agent.turn_end"), sessionId: z.string() }),
  z.object({ type: z.literal("agent.history"), sessionId: z.string(), entries: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("user"), text: z.string(), ts: z.number().optional() }),
    z.object({ kind: z.literal("agent"), text: z.string(), ts: z.number().optional() }),
    z.object({ kind: z.literal("tool"), name: z.string(), args: z.string(), ok: z.boolean(), output: z.string().optional(), ts: z.number().optional() }),
  ])) }),
  z.object({ type: z.literal("process.log"), processId: z.string(), stream: z.enum(["stdout", "stderr"]), line: z.string() }),
  z.object({ type: z.literal("process.port"), processId: z.string(), port: z.number(), previewUrl: z.string().optional() }),
  z.object({ type: z.literal("process.exit"), processId: z.string(), code: z.number().nullable() }),
  z.object({ type: z.literal("deploy.event"), event: z.unknown() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type ClientFrame = z.infer<typeof ClientFrame>;
export type ServerFrame = z.infer<typeof ServerFrame>;
