import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_ROOT } from "./projectRoot.js";

/**
 * Who this server is: which project it reads and writes, and which copy of
 * the plugin it is running.
 *
 * Both are fixed at startup — PROJECT_ROOT comes from an environment
 * variable, and the code is whatever was on disk when node started — while
 * the port is a constant. So a server left running for one project answers
 * on 4174 for every project, and the launch procedure used to accept any
 * answer on that port as "already running". Opening the board in a second
 * project then showed, and wrote to, the first project's repo, with no
 * symptom beyond the issues looking wrong.
 *
 * Reporting identity is what lets the caller tell "my server is up" from
 * "someone else's server is up" (see docs/open-board.md).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
// server/ → board-ui/ → apps/ → agile/
const PLUGIN_ROOT = path.resolve(HERE, "../../..");

function readVersion() {
  try {
    const raw = readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8");
    return JSON.parse(raw).version ?? null;
  } catch {
    // Running from a checkout that isn't laid out as an installed plugin is
    // fine — identity just falls back to the paths, which are the part that
    // actually prevents cross-project writes.
    return null;
  }
}

export const IDENTITY = {
  projectRoot: PROJECT_ROOT,
  pluginRoot: PLUGIN_ROOT,
  version: readVersion(),
};
