import type { ColumnKey } from "../api";
import { t } from "../i18n";
import { COLUMN_LABELS } from "../columns";
import { Avatar } from "./Avatar";
import { TYPE_BADGE } from "./IssueCard";

/**
 * The inside of a work-item card, shared by the sub-task rows listed under a
 * story on the plain board and by the draggable cards in both swimlane
 * views. Two lines:
 *
 *   ↳ #12  title (up to 3 lines)
 *                        Status  Assignee
 *
 * The leading glyph and the key are their own flex items, so a title that
 * wraps stays in its own column instead of running back under them.
 *
 * `status` is omitted in the swimlane views: the column the card sits in
 * already says it, and repeating it on every card is noise.
 */
export function WorkItemBody({
  number,
  title,
  status,
  assignee,
  type,
}: {
  number: number;
  title: string;
  /** Omit where the surrounding column already states it. */
  status?: ColumnKey;
  assignee: string | null;
  /** Sub-tasks get the ↳; a Task/Bug appearing as a work item keeps its own
   * badge, which is what tells them apart in the assignee lanes. */
  type?: "story" | "task" | "bug" | "subtask" | null;
}) {
  const badge = type && type !== "subtask" ? TYPE_BADGE[type] : null;
  return (
    <>
      <div className="work-item__head">
        {badge ? (
          <span className={badge.className}>{badge.label}</span>
        ) : (
          <span className="work-item__lead" aria-label={t("Subtask")} title={t("Subtask")}>
            ↳
          </span>
        )}
        <span className="work-item__key">#{number}</span>
        <span className="work-item__title" title={`#${number} ${title}`}>
          {title}
        </span>
      </div>
      <div className="work-item__meta">
        {status && <span className={`status-lozenge status-lozenge--${status}`}>{COLUMN_LABELS[status]}</span>}
        <Avatar login={assignee} size={16} />
      </div>
    </>
  );
}
