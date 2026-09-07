import type { DeployInput } from "./types.js";
/** Env the persistence sidecar needs inside the backend container (pure; safe to import from workflow code). */
export function persistenceEnv(input: DeployInput): Record<string, string> {
  if (!input.appdata) return {};
  return { COWORK_APPDATA_URL: input.appdata.url, COWORK_APPDATA_TOKEN: input.appdata.token, COWORK_DB_PATH: input.appdata.dbPath };
}
