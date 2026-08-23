import { useEffect } from "react";
import { t } from "../i18n";
import type { BoardItem, ColumnKey, SubtaskItem } from "../api";
import { COLUMN_LABELS } from "../columns";
import { Avatar } from "./Avatar";
import { ActionMenu } from "./ActionMenu";
import { InlineSelect, InlineText } from "./InlineEdit";
import { TYPE_BADGE } from "./IssueCard";

/** What a tap resolved to on the current board. Resolved by Board from the
 * issue number at render time — not a snapshot — so a drag or background
 * reconcile updates the open panel in place. */
export type DetailTarget =
  | { kind: "issue"; item: BoardItem; column: ColumnKey }
  | { kind: "subtask"; item: SubtaskItem; parent: BoardItem };

const prioLabel = (): Record<string, string> => ({ high: t("High"), mid: t("Medium"), low: t("Low") });

/** The fields this panel can write. Which ones apply depends on whether the
 * target is an issue or a sub-task — a sub-task has no priority or estimate
 * of its own, it inherits its parent's place in the plan. */
export interface Patch {
  title?: string;
  type?: "story" | "task" | "bug";
  body?: string;
  priority?: "high" | "mid" | "low" | "";
  points?: string;
  assignee?: string;
}

function labelValue(labels: { name: string }[], prefix: string): string | null {
  return labels.find((l) => l.name.startsWith(prefix))?.name.slice(prefix.length) ?? null;
}

/** Jira/Notion-style read view: tap a card and its content slides in on the
 * right. Everything shown here is already in the board response, so opening
 * the panel costs zero API calls — the per-issue fetch only happens if the
 * user goes one step further into Edit (the existing edit modal). The board
 * behind stays interactive (no backdrop), like Jira's issue panel. */
export function DetailPanel({
  target,
  onClose,
  onAddSubtask,
  onRemoveFromSprint,
  onOpenItem,
  assignees,
  onPatch,
  onWithdraw,
}: {
  target: DetailTarget;
  /** Logins offered by the Assignee picker. */
  assignees: string[];
  /** Writes one or more fields of the item this panel is showing. Rejecting
   * makes the field restore what it was displaying. */
  onPatch: (target: DetailTarget, patch: Patch) => Promise<void>;
  /** Closes the issue as not planned. Confirmed here, since this is the only
   * place it can be reached from now. */
  onWithdraw: (target: DetailTarget) => void;
  onClose: () => void;
  /** Present only when this item may be broken down right now. */
  onAddSubtask?: () => void;
  /** Sprint mode only. The sprint board no longer draws a Backlog column to
   * drag onto (Jira doesn't either), so pushing an issue back out of the
   * sprint lives here — the same move, minus the column. */
  onRemoveFromSprint?: () => void;
  onOpenItem: (number: number) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The edit modal can be stacked on top of this panel; Esc there should
      // not silently close the panel underneath it.
      if (document.querySelector(".modal-backdrop")) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const { item } = target;
  const column = target.kind === "issue" ? target.column : target.item.column;
  const typeBadge =
    target.kind === "subtask" ? TYPE_BADGE.subtask : target.item.type ? TYPE_BADGE[target.item.type] : null;
  const prio = labelValue(item.labels, "prio:");
  const points = labelValue(item.labels, "points:");
  const milestone = target.kind === "issue" ? target.item.milestone : null;
  const assignee = item.assignees[0]?.login ?? null;
  // A sub-task's body doubles as its parent link, so what is shown and
  // written is the description the server splits out of it (board.js);
  // an issue's body is its own.
  const body = target.kind === "subtask" ? (target.item.detail ?? "") : (item.body ?? "").trim();
  const subtasks = target.kind === "issue" ? target.item.subtasks : [];

  return (
    <aside className="detail-panel" aria-label={`${t("Details")} #${item.number}`}>
      <div className="detail-panel__header">
        {/* A sub-task's type is structural — the hierarchy is two levels deep
            by design — so only a top-level issue offers the picker. */}
        {target.kind === "issue" ? (
          <select
            className="detail-panel__type"
            aria-label={t("Type")}
            value={target.item.type ?? "story"}
            onChange={(e) => onPatch(target, { type: e.target.value as Patch["type"] })}
          >
            {(["story", "task", "bug"] as const).map((t) => (
              <option key={t} value={t}>
                {TYPE_BADGE[t].label}
              </option>
            ))}
          </select>
        ) : (
          typeBadge && <span className={typeBadge.className}>{typeBadge.label}</span>
        )}
        <a className="detail-panel__key" href={item.url} target="_blank" rel="noreferrer" title={t("Open on GitHub")}>
          #{item.number}
        </a>
        <span className="detail-panel__spacer" />
        {/* Everything that isn't editing the issue. There is no Done here:
            moving a card is the board's job, and one entry for one specific
            destination isn't a status control — if this panel ever grows one
            it should be a full column picker, as Jira's issue view has. */}
        <ActionMenu
          actions={[
            ...(onAddSubtask ? [{ label: t("Add a sub-task"), icon: "↳", onSelect: onAddSubtask }] : []),
            ...(onRemoveFromSprint
              ? [{ label: t("Remove from sprint"), icon: "⏏", onSelect: onRemoveFromSprint }]
              : []),
            { label: t("Open on GitHub"), icon: "↗", onSelect: () => window.open(item.url, "_blank", "noopener") },
            // ⊘, not a bin: this closes the issue as "not planned", it never
            // deletes anything.
            { label: t("Withdraw"), icon: "⊘", onSelect: () => onWithdraw(target), danger: true },
          ]}
        />
        <button className="detail-panel__close" aria-label={t("Close")} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="detail-panel__scroll">
        {target.kind === "subtask" && (
          <button className="detail-panel__parent" onClick={() => onOpenItem(target.parent.number)}>
            ↰ {t("Parent")}: #{target.parent.number} {target.parent.title}
          </button>
        )}
        <InlineText
          className="detail-panel__title"
          ariaLabel={t("Title")}
          singleLine
          value={item.title}
          onCommit={(title) => onPatch(target, { title })}
        />
        {target.kind === "issue" &&
          String(target.item.state).toUpperCase() === "CLOSED" &&
          target.item.subtasks.some((t) => t.column !== "done") && (
            <p className="detail-panel__warning">
              ⚠ {t("This item is finished, but sub-tasks are not")}:{" "}
              {target.item.subtasks.filter((t) => t.column !== "done").length}{" "}
              . {t("Finish or withdraw them, or reopen this item.")}
            </p>
          )}
        {target.kind === "issue" && target.item.staleStatus && (
          <p className="detail-panel__warning">
            ⚠ {t("It has a status label but no milestone for the current sprint. Dragging it into a column fixes it.")}
          </p>
        )}
        <dl className="detail-panel__meta">
          <dt>{t("Status")}</dt>
          <dd>
            {/* Not editable here: moving between columns is the board's job,
                and doing it from a panel would hide the WIP check the drop
                goes through. */}
            <span className={`status-lozenge status-lozenge--${column}`}>{COLUMN_LABELS[column]}</span>
          </dd>
          {/* Rows are drawn even when empty, unlike the read-only version:
              a field you can fill in has to be visible before it has a value. */}
          {target.kind === "issue" && (
            <>
              <dt>{t("Priority")}</dt>
              <dd>
                <InlineSelect
                  ariaLabel={t("Priority")}
                  value={prio ?? ""}
                  options={[
                    { value: "", label: t("None") },
                    { value: "high", label: prioLabel().high },
                    { value: "mid", label: prioLabel().mid },
                    { value: "low", label: prioLabel().low },
                  ]}
                  onCommit={(priority) => onPatch(target, { priority: priority as Patch["priority"] })}
                />
              </dd>
              <dt>{t("Points")}</dt>
              <dd>
                <InlineSelect
                  ariaLabel={t("Points")}
                  value={points ?? ""}
                  options={[{ value: "", label: t("None") }, ...["1", "2", "3", "5", "8"].map((p) => ({ value: p, label: p }))]}
                  onCommit={(next) => onPatch(target, { points: next })}
                />
              </dd>
            </>
          )}
          {milestone && (
            <>
              <dt>{t("Sprint")}</dt>
              <dd>
                <span className="badge badge--milestone">{milestone}</span>
              </dd>
            </>
          )}
          <dt>{t("Assignee")}</dt>
          <dd className="detail-panel__assignee">
            <Avatar login={assignee} size={18} />
            <InlineSelect
              ariaLabel={t("Assignee")}
              value={assignee ?? ""}
              options={[{ value: "", label: t("Unassigned") }, ...assignees.map((l) => ({ value: l, label: l }))]}
              onCommit={(next) => onPatch(target, { assignee: next })}
            />
          </dd>
        </dl>
        <section>
          <h3 className="detail-panel__section-title">{t("Description")}</h3>
          {/* Plain text, not rendered markdown: this is the field you type
              into, and a preview you have to click out of to edit is the
              round trip this change is removing. */}
          <InlineText
            className="detail-panel__body"
            ariaLabel={t("Description")}
            multiline
            placeholder={t("No description. Click to write one.")}
            value={body}
            onCommit={(next) => onPatch(target, { body: next })}
          />
        </section>
        {subtasks.length > 0 && (
          <section>
            <h3 className="detail-panel__section-title">
              {t("Sub-tasks")} ({subtasks.filter((s) => s.column === "done").length}/{subtasks.length})
            </h3>
            {subtasks.map((t) => (
              <button key={t.number} className="detail-panel__subtask" onClick={() => onOpenItem(t.number)}>
                <span className="detail-panel__subtask-col">{COLUMN_LABELS[t.column]}</span>
                <span className="detail-panel__subtask-title">
                  #{t.number} {t.title}
                </span>
                {t.assignees[0] && <Avatar login={t.assignees[0].login} size={16} />}
              </button>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
