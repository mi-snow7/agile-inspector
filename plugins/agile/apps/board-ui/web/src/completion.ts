import type { BoardItem } from "./api";
import { t, count } from "./i18n";

/**
 * Why this issue can't be moved to Done yet. Empty = it can.
 *
 * Only ever non-empty when a team has switched
 * `experimental.require_subtasks_done` on. The server checks the same thing
 * for real (issues.js); this runs first so a card doesn't visibly land in
 * Done and then jump back, and so the reason arrives as a sentence rather
 * than a rejected request.
 *
 * This used to back a mark as Done button on every card. The button is gone —
 * Jira doesn't have one, and the Done column already does the job — so the
 * rule now attaches to the one action that means "finish this": the drop.
 */
export function completionBlockers(item: BoardItem, requireSubtasksDone: boolean): string[] {
  if (!requireSubtasksDone) return [];
  const remaining = item.subtasks.filter((t) => t.column !== "done");
  if (remaining.length === 0) return [];
  const shown = remaining.slice(0, 3).map((t) => `#${t.number}`).join(", ");
  const more = remaining.length > 3 ? t("More: ") + count(remaining.length - 3) : "";
  return [
    `${t("Unfinished sub-tasks remain")}: ${count(remaining.length)} (${shown}${more}). ${t("Finish or withdraw them first.")}`,
  ];
}
