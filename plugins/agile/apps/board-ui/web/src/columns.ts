import type { ColumnKey } from "./api";

export const COLUMN_ORDER: ColumnKey[] = ["backlog", "todo", "doing", "review", "done"];

/**
 * Which columns a board screen shows, per mode.
 *
 * A sprint board is the team's commitment for this sprint, so Jira shows
 * nothing that isn't in the sprint — there is no Backlog column on it at
 * all. Ours concentrates every non-sprint issue into Backlog (computeColumn
 * treats "no sprint milestone" as Backlog), so dropping that one column is
 * exactly "hide what isn't in the sprint". Pulling work in still happens on
 * the backlog screen, which has the sprint drop zone; pushing work back out
 * is the detail panel's Remove from sprint.
 *
 * Kanban has no sprint to be outside of — its Backlog column is the queue
 * work flows out of, so it stays.
 */
export function columnsFor(mode: "kanban" | "sprint"): ColumnKey[] {
  return mode === "sprint" ? COLUMN_ORDER.filter((k) => k !== "backlog") : COLUMN_ORDER;
}

/**
 * These used to carry coloured dots (⚪🔵🟡🟣🟢) because five similar-length
 * English words on a flat page were hard to tell apart. The Jira-style board
 * solves that the way Jira does — each column is its own sunken grey well
 * with a subtle header — so the dots became redundant noise and were removed
 * with the redesign.
 */
/**
 * Jira's own column names, so someone moving between the two tools reads the
 * same words. The GitHub labels were renamed to match (`status:in-progress` /
 * `status:in-review`) rather than left to drift from what the board says —
 * a label is the one part of this that people also read on github.com, where
 * no display layer exists to translate it.
 */
export const COLUMN_LABELS: Record<ColumnKey, string> = {
  backlog: "Backlog",
  todo: "To Do",
  doing: "In Progress",
  review: "In Review",
  done: "Done",
};
