import { spawn } from "node:child_process";
import { PROJECT_ROOT } from "./projectRoot.js";

class GhError extends Error {
  constructor(message, { code, stderr }) {
    super(message);
    this.name = "GhError";
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * Run `gh <args>` with argv passed as an array (never through a shell), so
 * issue titles/bodies can never be interpreted as shell syntax.
 * @param {string[]} args
 * @param {{ input?: string, cwd?: string }} [opts]
 * @returns {Promise<string>} stdout
 */
export function gh(args, opts = {}) {
  const cwd = opts.cwd ?? PROJECT_ROOT;
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new GhError(`gh ${args.join(" ")} exited with code ${code}: ${stderr.trim()}`, {
            code,
            stderr: stderr.trim(),
          }),
        );
        return;
      }
      resolve(stdout);
    });
    // Writing to a child that has already exited raises EPIPE on the stream,
    // and an unhandled 'error' event on a stream takes the whole process
    // down — the server dies mid-request, taking the board with it. gh exits
    // immediately whenever it rejects its arguments (a label that doesn't
    // exist in the repo, a bad flag), so every call that pipes a body in
    // (`issue create` / `issue edit` with --body-file -) is a candidate.
    // Swallow it here: the close handler above already reports the real
    // failure, with gh's own stderr attached.
    child.stdin.on("error", () => {});
    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}

export async function ghJson(args, opts = {}) {
  const out = await gh(args, opts);
  return out.trim() === "" ? null : JSON.parse(out);
}

let cachedRepo;

export async function getOwnerRepo(opts = {}) {
  if (cachedRepo) return cachedRepo;
  cachedRepo = (await gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], opts)).trim();
  return cachedRepo;
}

export { GhError };
