import { useDraggable, useDroppable } from "@dnd-kit/core";
import { t, count } from "../i18n";
import type { BoardItem, BoardResponse } from "../api";
import { Avatar } from "./Avatar";
import { TYPE_BADGE } from "./IssueCard";

/** GitHub Issues has no arbitrary rank field, so the backlog can't be a
 * freely reorderable list the way Jira's is. Priority is expressed with the
 * three prio labels instead, and dragging a row between buckets is what
 * "reprioritise" means here. */
export type PrioBucket = "high" | "mid" | "low" | null;

const buckets = (): { key: PrioBucket; label: string; className: string }[] => [
  { key: "high", label: `prio:high — ${t("start next")}`, className: "bucket--high" },
  { key: "mid", label: `prio:mid — ${t("after that")}`, className: "bucket--mid" },
  { key: "low", label: `prio:low — ${t("someday")}`, className: "bucket--low" },
  { key: null, label: t("Unset — no priority decided yet"), className: "bucket--none" },
];

function bucketOf(item: BoardItem): PrioBucket {
  const prio = item.labels.find((l) => l.name.startsWith("prio:"))?.name.slice("prio:".length);
  return prio === "high" || prio === "mid" || prio === "low" ? prio : null;
}

function points(item: BoardItem): string | null {
  return item.labels.find((l) => l.name.startsWith("points:"))?.name.slice("points:".length) ?? null;
}

function BacklogRow({ item, onOpen }: { item: BoardItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `backlog-${item.number}`,
    // Carries the bucket the row started in, so Board can drop a
    // same-bucket release on the floor instead of sending a no-op edit.
    data: { number: item.number, priority: bucketOf(item) },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;
  const badge = item.type ? TYPE_BADGE[item.type] : null;
  const pt = points(item);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`backlog-row ${isDragging ? "dragging" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onOpen();
      }}
      {...listeners}
      {...attributes}
    >
      {badge && <span className={badge.className}>{badge.label}</span>}
      <span className="backlog-row__title" title={`#${item.number} ${item.title}`}>
        #{item.number} {item.title}
      </span>
      {pt && (
        <span className="points-chip" title={`${t("Points")}: ${pt}`}>
          {pt}
        </span>
      )}
      {item.assignees[0] && <Avatar login={item.assignees[0].login} size={18} />}
      {/* Refinement is read-then-edit: the row opens the detail panel, and
          Edit lives there — same as a board card. */}
    </div>
  );
}

function Bucket({
  bucket,
  label,
  className,
  items,
  onOpenItem,
}: {
  bucket: PrioBucket;
  label: string;
  className: string;
  items: BoardItem[];
  onOpenItem: (number: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `prio-${bucket ?? "none"}`,
    data: { kind: "prio", priority: bucket },
  });
  return (
    <section ref={setNodeRef} className={`bucket ${className} ${isOver ? "bucket--over" : ""}`}>
      <h2 className="bucket__header">
        {label}
        <span className="bucket__count">{items.length}</span>
      </h2>
      <div className="bucket__items">
        {items.length === 0 ? (
          <p className="bucket__empty">{t("Drag here to change priority")}</p>
        ) : (
          items.map((item) => <BacklogRow key={item.number} item={item} onOpen={() => onOpenItem(item.number)} />)
        )}
      </div>
    </section>
  );
}

interface Props {
  board: BoardResponse;
  onOpenItem: (number: number) => void;
  onAddItem: () => void;
}

export function BacklogView({ board, onOpenItem, onAddItem }: Props) {
  const backlog = board.columns.find((c) => c.key === "backlog");
  // Sub-tasks never belong in a backlog — they're created during planning,
  // for work already committed to a sprint. One can only show up here if its
  // parent fell outside the fetched board, so keep it out of the plan view.
  const items = (backlog?.items ?? []).filter((i) => i.type !== "subtask");

  const inSprint = board.mode === "sprint" && !!board.sprintMilestone;
  const { setNodeRef, isOver } = useDroppable({ id: "sprint-dropzone", data: { kind: "sprint" } });

  return (
    <div className="backlog">
      <div ref={setNodeRef} className={`sprint-dropzone ${isOver ? "sprint-dropzone--over" : ""}`}>
        <div className="sprint-dropzone__label">
          {inSprint ? `${t("Current sprint")}: ${board.sprintMilestone}` : t("To Do")}
        </div>
        <div className="sprint-dropzone__hint">
          {inSprint
            ? t("Drop here to join this sprint and move to To Do")
            : t("Drop here to move to To Do")}
        </div>
      </div>

      <div className="backlog__toolbar">
        <span className="backlog__count">{t("Backlog")} {count(items.length)}</span>
        <button onClick={onAddItem}>+ {t("Add")}</button>
      </div>

      {items.length === 0 ? (
        <div className="board-status">{t("The backlog is empty.")}</div>
      ) : (
        buckets().map(({ key, label, className }) => (
          <Bucket
            key={key ?? "none"}
            bucket={key}
            label={label}
            className={className}
            items={items.filter((i) => bucketOf(i) === key)}
            onOpenItem={onOpenItem}
          />
        ))
      )}
    </div>
  );
}
