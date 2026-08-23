import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { PROJECT_ROOT } from "./projectRoot.js";

/**
 * Reads .agile/config.yml from the given project root (defaults to PROJECT_ROOT).
 * Returns null if the project hasn't run /agile:init yet.
 */
export const CONFIG_DIR = ".agile";

export async function loadPmConfig(cwd = PROJECT_ROOT) {
  const configPath = path.join(cwd, CONFIG_DIR, "config.yml");
  try {
    const raw = await readFile(configPath, "utf8");
    return yaml.load(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * The sprint currently being worked on, or null when there isn't one.
 *
 * Reads `sprint.current`, falling back to `sprint.milestone`. The key was
 * renamed when the plugin stopped being GitHub-only — "milestone" is GitHub's
 * word for it — and a project initialised before that still has the old
 * spelling, so both are accepted and only the new one is written.
 *
 * Returns null outside sprint mode, so callers never repeat the mode check.
 */
export function activeSprint(cfg) {
  if (cfg?.mode !== "sprint") return null;
  return cfg.sprint?.current ?? cfg.sprint?.milestone ?? null;
}
