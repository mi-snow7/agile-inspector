import { useState } from "react";
import { t, count } from "../i18n";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { BoardItem, BoardResponse, ColumnKey } from "../api";
import { COLUMN_LABELS, columnsFor } from "../columns";
import { OTHERS_LANE, type Lane, type LaneId, type WorkItem } from "../lanes";
import { TYPE_BADGE } from "./IssueCard";
import { WorkItemBody } from "./WorkItemBody";

/** The only draggable level in this view. The plain board drags whole issues;
 * here it's work items (sub-tasks, and issues never broken down), so nothing
 * nests and no pointerdown juggling is needed. */
function TaskCard({
  item,
  laneId,
  showBadge,
  onOpen,
}: {
  item: WorkItem;
  laneId: LaneId;
  showBadge: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${item.number}`,
    data: { number: item.number, laneId },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? "dragging" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onOpen();
      }}
      {...listeners}
      {...attributes}
    >
      {/* Same body as a sub-task row on the plain board, minus the status:
          the column this card sits in is the status, so printing it on the
          card would say it twice. Edit / Details moved into the detail panel a
          tap now opens — on a card this small they were most of its
          surface. */}
      <WorkItemBody
        number={item.number}
        title={item.title}
        assignee={item.assignees[0]?.login ?? null}
        type={showBadge ? item.type : "subtask"}
      />
    </div>
  );
}

/** One lane × one column. Each lane needs its own droppable per column —
 * dnd-kit ids must be unique, and carrying laneId in the drop data is what
 * lets Board reject a drop into a different lane (the move API changes
 * status labels; it can't re-parent, reassign, or reprioritise). */
function LaneCell({ laneId, column, children }: { laneId: LaneId; column: ColumnKey; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `lane-${laneId}-${column}`,
    data: { column, laneId },
  });
  return (
    <div ref={setNodeRef} className={`lane-cell ${isOver ? "lane-cell--over" : ""}`}>
      {children}
    </div>
  );
}

/** The status columns, drawn once per swimlane. A single header strip at the
 * top of the page only reads as a header for the first lane — by the third
 * one you're counting columns to work out which is In Review. Repeating it
 * inside each lane is what Jira's grouped board does, and it's what makes a
 * lane legible on its own. */
function ColumnHeads({ board, columns }: { board: BoardResponse; columns: ColumnKey[] }) {
  return (
    <div className="swimlane__column-heads">
      {columns.map((key) => (
        <div key={key} className="swimlanes__column-head">
          {COLUMN_LABELS[key]}
          {key === "doing" && board.wip.doing.limit != null && (
            <span className={`wip-badge ${board.wip.doing.over ? "wip-badge--over" : ""}`}>
              {board.wip.doing.count}/{board.wip.doing.limit}
            </span>
          )}
          {key === "review" && board.wip.review.limit != null && (
            <span className={`wip-badge ${board.wip.review.over ? "wip-badge--over" : ""}`}>
              {board.wip.review.count}/{board.wip.review.limit}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface Props {
  board: BoardResponse;
  lanes: Lane[];
  onAddSubtask: (item: BoardItem) => void;
  /** Tapping a task card, or a parent lane's title, opens that issue's
   * detail panel. */
  onOpenItem: (number: number) => void;
}

export function SwimlaneBoard({ board, lanes, onAddSubtask, onOpenItem }: Props) {
  const [collapsed, setCollapsed] = useState<Set<LaneId>>(new Set());
  const columns = columnsFor(board.mode);

  if (lanes.length === 0) {
    return (
      <div className="board-status">
        {t("Nothing to show.")}
        {board.mode === "sprint" && board.sprintMilestone ? `(${t("Current sprint")}: ${board.sprintMilestone})` : ""}
      </div>
    );
  }

  const toggle = (id: LaneId) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="swimlanes">
      <div className="swimlanes__inner" style={{ "--swimlane-cols": columns.length } as React.CSSProperties}>
        {lanes.map((lane) => {
          const isCollapsed = collapsed.has(lane.id);
          const parent = lane.parent;
          const typeBadge = parent?.item.type ? TYPE_BADGE[parent.item.type] : null;
          const canAddSubtask = parent != null && (board.mode !== "sprint" || !!parent.item.milestone);
          return (
            <div key={lane.id} className={`swimlane ${lane.id === OTHERS_LANE ? "swimlane--others" : ""}`}>
              <div className="swimlane__header">
                {/* Same control as a card's sub-task disclosure: one caret
                    that turns, at a size that reads as a button. It was a
                    9px ▸/▾ pair, which is the complaint the card's toggle
                    already got. */}
                <button
                  className="swimlane__toggle"
                  aria-label={isCollapsed ? t("Expand") : t("Collapse")}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(lane.id)}
                >
                  <span aria-hidden="true">›</span>
                </button>
                {typeBadge && <span className={typeBadge.className}>{typeBadge.label}</span>}
                {/* A parent lane's title *is* an issue, so it opens the same
                    detail panel a card does; an assignee/expedite lane title
                    is just a grouping label and stays inert. */}
                {parent ? (
                  <button
                    className="swimlane__title swimlane__title--link"
                    title={lane.title}
                    onClick={() => onOpenItem(parent.item.number)}
                  >
                    {lane.title}
                  </button>
                ) : (
                  <span className="swimlane__title" title={lane.title}>
                    {lane.title}
                  </span>
                )}
                {parent ? (
                  <>
                    {/* Same coloured lozenge the sub-task cards use. It was
                        the one neutral grey badge on a row whose whole point
                        is "where is this story", so the status was the least
                        visible thing in the header. */}
                    <span className={`status-lozenge status-lozenge--${parent.column}`}>
                      {COLUMN_LABELS[parent.column]}
                    </span>
                    <span className="swimlane__progress">
                      {lane.items.filter((t) => t.column === "done").length}/{lane.items.length} {t("done")}
                    </span>
                    <div className="swimlane__actions">
                      {/* No status control on a lane header, which is what
                          Jira's group-by-Subtask view does too: the row is
                          the parent's identity, the cards in it are the work.
                          Finishing the parent happens on the plain board. */}
                      <button
                        disabled={!canAddSubtask}
                        title={canAddSubtask ? undefined : t("This item is not in the sprint yet")}
                        onClick={() => onAddSubtask(parent.item)}
                      >
                        + {t("Sub-task")}
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="swimlane__progress">{count(lane.items.length)}</span>
                )}
              </div>
              {!isCollapsed && <ColumnHeads board={board} columns={columns} />}
              {!isCollapsed && (
                <div className="swimlane__grid">
                  {columns.map((key) => (
                    <LaneCell key={key} laneId={lane.id} column={key}>
                      {lane.items
                        .filter((t) => t.column === key)
                        .map((t) => (
                          <TaskCard
                            key={t.number}
                            item={t}
                            laneId={lane.id}
                            // Under a parent lane every card is a sub-task,
                            // so the badge says nothing. Across assignee /
                            // expedite lanes it's what tells a bug apart
                            // from a chore at a glance.
                            showBadge={!parent || t.type !== "subtask"}
                            onOpen={() => onOpenItem(t.number)}
                          />
                        ))}
                    </LaneCell>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
