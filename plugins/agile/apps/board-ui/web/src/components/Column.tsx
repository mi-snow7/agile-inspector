import { useDroppable } from "@dnd-kit/core";
import { t } from "../i18n";
import type { ColumnKey, BoardItem, WipStatus } from "../api";
import { COLUMN_LABELS } from "../columns";
import { IssueCard } from "./IssueCard";

interface Props {
  columnKey: ColumnKey;
  items: BoardItem[];
  wip?: WipStatus;
  mode: "kanban" | "sprint";
  /** Tapping a card — or one of its sub-task rows — opens that issue's
   * detail panel; both carry only the number. */
  onOpenItem: (number: number) => void;
  onAddSubtask: (item: BoardItem) => void;
  onAddStory?: () => void;
}

export function Column({
  columnKey,
  items,
  wip,
  mode,
  onOpenItem,
  onAddSubtask,
  onAddStory,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey, data: { column: columnKey } });

  return (
    <div
      className={`column ${isOver ? "column--over" : ""} ${wip?.over ? "column--wip-over" : ""}`}
      ref={setNodeRef}
    >
      <div className="column__header">
        <span className="column__title">{COLUMN_LABELS[columnKey]}</span>
        <span className="column__count">{items.length}</span>
        {wip && (
          <span className={`wip-badge ${wip.over ? "wip-badge--over" : ""}`}>
            {wip.count}
            {wip.limit != null ? `/${wip.limit}` : ""}
          </span>
        )}
      </div>
      {columnKey === "backlog" && onAddStory && (
        <button className="add-story-btn" onClick={onAddStory}>
          + {t("Add")}
        </button>
      )}
      <div className="column__items">
        {items.map((item) => (
          <IssueCard
            key={item.number}
            item={item}
            mode={mode}
            onOpen={() => onOpenItem(item.number)}
            onAddSubtask={() => onAddSubtask(item)}
            onOpenSubtask={(subtask) => onOpenItem(subtask.number)}
          />
        ))}
      </div>
    </div>
  );
}
