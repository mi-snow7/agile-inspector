import { useState } from "react";
import { t, count } from "../i18n";
import { useDraggable } from "@dnd-kit/core";
import type { BoardItem, IssueType, SubtaskItem } from "../api";
import { Avatar } from "./Avatar";
import { WorkItemBody } from "./WorkItemBody";

/** Story / Task / Bug are peers here (Jira's taxonomy) — the badge is how
 * you tell a feature from a chore from a defect at a glance on the board. */
export const TYPE_BADGE: Record<Exclude<IssueType, null>, { label: string; className: string }> = {
  story: { label: "📘 Story", className: "badge badge--type-story" },
  task: { label: "🛠️ Task", className: "badge badge--type-task" },
  bug: { label: "🐛 Bug", className: "badge badge--type-bug" },
  subtask: { label: "↳ Sub", className: "badge badge--type-subtask" },
};

function labelBadges(labels: BoardItem["labels"], prefix: string) {
  return labels.filter((l) => l.name.startsWith(prefix)).map((l) => l.name.slice(prefix.length));
}

/** Read-only sub-task row. Sub-tasks used to be draggable from inside the
 * card, which meant two draggable levels in one view (and the pointerdown
 * juggling that came with it). Sub-task status now moves in the swimlane
 * task view, so a card only reports where its sub-tasks stand — tapping a
 * row opens the sub-task's own detail panel (as tapping the card opens the
 * parent's), which is where Edit lives now. */
function SubtaskRow({ subtask, onOpen }: { subtask: SubtaskItem; onOpen: () => void }) {
  return (
    <div
      className="task-row"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Without this the click continues up to the card and opens the
        // parent's panel over the sub-task's.
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
    >
      <WorkItemBody
        number={subtask.number}
        title={subtask.title}
        status={subtask.column}
        assignee={subtask.assignees[0]?.login ?? null}
        type="subtask"
      />
    </div>
  );
}

export function IssueCard({
  item,
  mode,
  onOpen,
  onOpenSubtask,
  onAddSubtask,
}: {
  item: BoardItem;
  mode: "kanban" | "sprint";
  /** Tap anywhere on the card (Jira-style) — opens the detail panel, which
   * is where Edit and the GitHub link moved to. */
  onOpen: () => void;
  onOpenSubtask: (subtask: SubtaskItem) => void;
  onAddSubtask: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `story-${item.number}`,
    data: { type: "story", number: item.number },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  const prio = labelBadges(item.labels, "prio:")[0];
  const points = labelBadges(item.labels, "points:")[0];
  // Story, Task and Bug can all be broken down; only a sub-task can't (the
  // hierarchy is two levels deep by design). In sprint mode, breakdown waits
  // until the issue is actually in the sprint.
  const canBreakDown = item.type !== "subtask";
  const canAddSubtask = canBreakDown && (mode !== "sprint" || !!item.milestone);
  const doneCount = item.subtasks.filter((t) => t.column === "done").length;
  // The rules in this tool stop you closing a parent with unfinished
  // sub-tasks — but GitHub doesn't, and nothing here can make it. So the
  // inconsistency is detected rather than prevented: if it happens anyway
  // (closed on github.com, by a bot, by a commit keyword), the card says so
  // instead of the sub-tasks quietly ending up orphaned.
  // Not gated on require_subtasks_done. That setting decides whether this
  // tool *stops* you; this badge only reports what is true — the parent is
  // finished and these children aren't. It's the same information whether or
  // not the team made a rule out of it, and with the rule off by default it
  // is the only thing that would notice a parent closed on github.com.
  const strandedSubtasks =
    String(item.state).toUpperCase() === "CLOSED" ? item.subtasks.filter((t) => t.column !== "done") : [];
  const typeBadge = item.type ? TYPE_BADGE[item.type] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`story-card ${isDragging ? "dragging" : ""}`}
      onClick={onOpen}
      // dnd-kit's attributes already make the card role="button" tabIndex=0;
      // this is what makes that promise true for a keyboard, now that Edit
      // (previously the only focusable way in) lives in the panel.
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onOpen();
      }}
      {...listeners}
      {...attributes}
    >
      <div className="story-card__top">
        {/* Jira card anatomy: the summary stands alone up top; type, key,
            estimate and assignee live in the footer row below. */}
        <span className="story-card__title" title={`#${item.number} ${item.title}`}>
          {item.title}
        </span>
      </div>
      <div className="story-card__badges">
        {item.staleStatus && (
          <span
            className="badge badge--warning"
            title={t("It has a status label but no milestone for the current sprint. Dragging it into a column fixes it.")}
          >
            ⚠ {t("Out of sync")}
          </span>
        )}
        {strandedSubtasks.length > 0 && (
          <span
            className="badge badge--warning"
            title={`${t("This item is finished, but sub-tasks are not")}: ${count(strandedSubtasks.length)} (${strandedSubtasks
              .slice(0, 5)
              .map((t) => `#${t.number}`)
              .join(", ")}). ${t("Finish or withdraw them, or reopen this item.")}`}
          >
            ⚠ {t("Sub-tasks open")} {count(strandedSubtasks.length)}
          </span>
        )}
        {prio && <span className={`badge badge--prio-${prio}`}>prio:{prio}</span>}
        {item.milestone && (
          <span className="badge badge--milestone" title={item.milestone}>
            {item.milestone}
          </span>
        )}
      </div>
      <div className="story-card__footer">
        {typeBadge && <span className={typeBadge.className}>{typeBadge.label}</span>}
        <span className="story-card__key">#{item.number}</span>
        <span className="story-card__footer-spacer" />
        {points && (
          <span className="points-chip" title={`${t("Points")}: ${points}`}>
            {points}
          </span>
        )}
        {item.assignees[0] && <Avatar login={item.assignees[0].login} />}
      </div>
      {/* Edit and Done both moved into the detail panel a tap on the card now
          opens. Jira has neither on a card: you drag it to Done, or you open
          it. A permanently-present Done button was a second way to do what the
          Done column already does, and it was taking a whole row of a card
          that has four other things to say. */}
      <div className="story-card__actions">
        {canBreakDown && (
          <button
            disabled={!canAddSubtask}
            title={canAddSubtask ? undefined : t("This item is not in the sprint yet")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAddSubtask();
            }}
          >
            + {t("Sub-task")}
          </button>
        )}
        <a
          className="link-button"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {t("Details")}
        </a>
      </div>
      {item.subtasks.length > 0 && (
        <div className="story-card__tasks" onPointerDown={(e) => e.stopPropagation()}>
          {/* Was a bare ▾ tucked beside the title, at a size nobody read as a
              button. It says what it opens now, and carries the done count
              that used to sit up in the badge row — both come from subtasks
              already in the board payload, so neither costs a request. */}
          <button
            className="story-card__disclosure"
            aria-expanded={expanded}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            <span className="story-card__disclosure-icon" aria-hidden="true">
              ↳
            </span>
            <span>{t("Sub-tasks")}</span>
            <span className="story-card__disclosure-count">
              {doneCount}/{item.subtasks.length}
            </span>
            {/* One glyph that turns, rather than two that swap: an arrow
                pointing down is the same arrow having moved, and a swap reads as a
                different icon appearing. */}
            <span className="story-card__disclosure-caret" aria-hidden="true">
              ›
            </span>
          </button>
          {expanded &&
            item.subtasks.map((t) => (
              <SubtaskRow key={t.number} subtask={t} onOpen={() => onOpenSubtask(t)} />
            ))}
        </div>
      )}
    </div>
  );
}
