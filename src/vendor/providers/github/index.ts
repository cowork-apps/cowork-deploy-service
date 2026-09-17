import { repoName } from "../../contracts/index.js";
import { json, HttpError } from "../http.js";
import type { SourceRepo, ProjectRef, RepoRef } from "../interfaces.js";

/** Platform-owned org, fine-grained PAT today; swap `pushCredentials` for GitHub App installation tokens later. */
export class GitHubOrgRepo implements SourceRepo {
  constructor(private org: string, private token: string) {}
  private api = "https://api.github.com";

  async ensureRepo(p: ProjectRef): Promise<RepoRef> {
    const name = repoName(p.username, p.slug);
    try {
      const r = await json(`${this.api}/repos/${this.org}/${name}`, { token: this.token });
      return { url: r.clone_url, fullName: r.full_name, defaultBranch: r.default_branch };
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 404) throw e;
    }
    try {
      const r = await json(`${this.api}/orgs/${this.org}/repos`, {
        method: "POST", token: this.token,
        body: JSON.stringify({ name, private: false, auto_init: false, description: `Cowork project ${p.slug} by ${p.username}` }),
      });
      return { url: r.clone_url, fullName: r.full_name, defaultBranch: r.default_branch ?? "main" };
    } catch (e) {
      // the runtime may have created it concurrently (it pushes after every agent turn): re-read
      if (e instanceof HttpError && e.status === 422 && /already exists/i.test(e.body)) {
        const r = await json(`${this.api}/repos/${this.org}/${name}`, { token: this.token });
        return { url: r.clone_url, fullName: r.full_name, defaultBranch: r.default_branch ?? "main" };
      }
      throw e;
    }
  }

  async pushCredentials(_p: ProjectRef) {
    // PAT: same token for every push. GitHub App: mint a 1h installation token here instead.
    return { username: "x-access-token", token: this.token };
  }

  async deleteRepo(p: ProjectRef) {
    await json(`${this.api}/repos/${this.org}/${repoName(p.username, p.slug)}`, { method: "DELETE", token: this.token });
  }
}
