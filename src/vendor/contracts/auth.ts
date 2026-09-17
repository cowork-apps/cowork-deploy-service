import { z } from "zod";

/** DNS-safe, 3–20 chars; appears in subdomains and repo names. */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/;
export const USERNAME_HELP =
  "3–20 characters: lowercase letters, numbers and hyphens, starting and ending with a letter or number. It becomes part of your app URLs, e.g. abc1234-<username>.trustguardsolo.com";

export const SignupRequest = z.object({
  email: z.string().email(),
  password: z.string().min(10, "At least 10 characters"),
  username: z.string().regex(USERNAME_RE, USERNAME_HELP),
});
export const LoginRequest = z.object({ email: z.string().email(), password: z.string() });
export type SignupRequest = z.infer<typeof SignupRequest>;
export type LoginRequest = z.infer<typeof LoginRequest>;
