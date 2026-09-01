import type { BoardItem, BoardResponse, ColumnKey, IssueLabel, IssueType } from "./api";
import { t } from "./i18n";
import { COLUMN_ORDER } from "./columns";

/**
 * How the board's cards are grouped into horizontal rows — Jira's "group-by"
 * dropdown. `none` is the plain board (no rows at all); the rest are
 * swimlanes.
 *
 * Which groupings make sense depends on the mode, and the two lists barely
 * overlap:
 *
 * - **Sprint** is about finishing an agreed set of work inside a fixed
 *   window, so the useful questions are "who is holding what" (`assignee`,
 *   for the daily standup) and "how close is this story to done"
 *   (`parent`, for tracking value delivery rather than individual tasks).
 * - **Kanban** is about keeping the flow moving, and deliberately *doesn't*
 *   pre-assign work — you pull the top item when you free up — so an
 *   assignee grouping would just obscure where the flow is blocked. What it
 *   needs instead is a service-class split (`expedite`) that makes a
 *   production-fire visible above the ordinary queue.
 */
export type LaneMode = "none" | "parent" | "assignee" | "expedite";

export const LANE_MODES_BY_MODE: Record<BoardResponse["mode"], LaneMode[]> = {
  sprint: ["none", "parent", "assignee"],
  kanban: ["none", "expedite"],
};

/**
 * A function, not a constant — the locale arrives with the board payload, so
 * a `t()` evaluated while the module graph loads freezes on whatever `current`
 * happened to be at import time. This was a constant, and the swimlane buttons
 * were the one part of the board that stayed English on a Japanese project
 * (`i18n.ts` warns about exactly this; `tools/check-contract.sh` now catches
 * an exported one, which is how this survived).
 */
export function laneModeLabels(): Record<LaneMode, string> {
  return {
    none: t("None"),
    parent: t("By parent"),
    assignee: t("By assignee"),
    expedite: t("Expedite"),
  };
}

export function isLaneMode(value: unknown): value is LaneMode {
  return value === "none" || value === "parent" || value === "assignee" || value === "expedite";
}

/** A lane id must be unique across the board — dnd-kit keys its droppables by
 * it, and Board compares it to decide whether a drop crossed lanes. */
export type LaneId = string;

/**
 * One card on a swimlane board. Unlike the plain board — where whole issues
 * move — swimlanes show the *work item* level: a sub-task, or a Story/Task/
 * Bug that was never broken down (small enough that decomposing it would be
 * busywork). A broken-down parent is a container and appears as a lane
 * header or not at all, never as a moving card.
 */
export interface WorkItem {
  number: number;
  title: string;
  state: string;
  assignees: { login: string }[];
  url: string;
  column: ColumnKey;
  type: IssueType;
  labels: IssueLabel[];
  /** The issue this work item was decomposed from, or null when the work
   * item *is* a top-level issue. Editing routes differently for the two. */
  parent: BoardItem | null;
}

export interface Lane {
  id: LaneId;
  title: string;
  /** Present only for the `parent` grouping, whose header carries the whole
   * issue (progress, Done button, + Sub-task, link). Simple lanes just
   * show a title and a count. */
  parent?: { item: BoardItem; column: ColumnKey };
  items: WorkItem[];
}

/** Every issue on the board paired with the column it currently sits in,
 * narrowed to the current sprint when there is one. Backlog/Done included —
 * the swimlane grid renders all five columns. */
function scopedIssues(board: BoardResponse): { item: BoardItem; column: ColumnKey }[] {
  const all: { item: BoardItem; column: ColumnKey }[] = [];
  for (const key of COLUMN_ORDER) {
    const col = board.columns.find((c) => c.key === key);
    for (const item of col?.items ?? []) all.push({ item, column: key });
  }
  // In sprint mode the board is about the current sprint; with no active
  // sprint there's nothing to narrow to, so fall back to showing everything.
  return board.mode === "sprint" && board.sprintMilestone
    ? all.filter((l) => l.item.milestone === board.sprintMilestone)
    : all;
}

/** Flattens the board to the work-item level (see WorkItem). Used by the
 * assignee and expedite groupings, which cut across the parent/child tree. */
function workItems(board: BoardResponse): WorkItem[] {
  const out: WorkItem[] = [];
  for (const { item, column } of scopedIssues(board)) {
    if (item.subtasks.length > 0) {
      for (const t of item.subtasks) {
        out.push({
          number: t.number,
          title: t.title,
          state: t.state,
          assignees: t.assignees,
          url: t.url,
          column: t.column,
          type: "subtask",
          labels: t.labels,
          parent: item,
        });
      }
    } else {
      // Not broken down (yet) — the issue itself is the work item. This
      // includes an undecomposed Story: it still has to move across the
      // columns, so dropping it here would make it vanish from the board.
      out.push({
        number: item.number,
        title: item.title,
        state: item.state,
        assignees: item.assignees,
        url: item.url,
        column,
        type: item.type,
        labels: item.labels,
        parent: null,
      });
    }
  }
  return out;
}

const unassigned = () => t("Unassigned");

function buildAssigneeLanes(board: BoardResponse): Lane[] {
  const byLogin = new Map<string, WorkItem[]>();
  for (const w of workItems(board)) {
    // Jira shows one lane per assignee and a card sits in exactly one lane,
    // so a multi-assignee issue follows its first assignee.
    const login = w.assignees[0]?.login ?? unassigned();
    const bucket = byLogin.get(login);
    if (bucket) bucket.push(w);
    else byLogin.set(login, [w]);
  }
  const logins = [...byLogin.keys()].filter((l) => l !== unassigned()).sort();
  // Unassigned last: in a standup you walk the people first, and what's left
  // over is the "nobody has picked this up" pile.
  if (byLogin.has(unassigned())) logins.push(unassigned());
  return logins.map((login) => ({
    id: `assignee:${login}`,
    title: login === unassigned() ? unassigned() : `@${login}`,
    items: byLogin.get(login) ?? [],
  }));
}

type ServiceClass = "expedite" | "standard" | "background";

const serviceClasses = (): { key: ServiceClass; title: string }[] => [
  { key: "expedite", title: t("🚨 Expedite — drop everything else") },
  { key: "standard", title: t("Standard — ordinary development work") },
  { key: "background", title: t("🐢 Background — not urgent") },
];

function priorityOf(labels: IssueLabel[]): "high" | "mid" | "low" | null {
  const prio = labels.find((l) => l.name.startsWith("prio:"))?.name.slice("prio:".length);
  return prio === "high" || prio === "mid" || prio === "low" ? prio : null;
}

/**
 * Jira builds the expedite lane from a JQL query; the equivalent here is the
 * `prio:*` label, which is the only priority signal this tool records.
 *
 * A sub-task rarely carries its own priority — urgency is a property of the
 * thing being delivered, not of one step of it — so it inherits the parent's
 * unless it overrides it. Without that fallback the expedite lane would sit
 * empty while a critical story's sub-tasks piled up under Standard.
 */
function serviceClassOf(w: WorkItem): ServiceClass {
  const prio = priorityOf(w.labels) ?? (w.parent ? priorityOf(w.parent.labels) : null);
  if (prio === "high") return "expedite";
  if (prio === "low") return "background";
  return "standard";
}

function buildExpediteLanes(board: BoardResponse): Lane[] {
  const all = workItems(board);
  // All three lanes render even when empty — an empty Expedite lane is the
  // signal ("nothing is on fire"), and a lane that only appears once it has
  // a card is a lane nobody learns to look at.
  return serviceClasses().map(({ key, title }) => ({
    id: `class:${key}`,
    title,
    items: all.filter((w) => serviceClassOf(w) === key),
  }));
}

/** The lane holding work items with no parent to sit under. */
export const OTHERS_LANE: LaneId = "others";

function buildParentLanes(board: BoardResponse): Lane[] {
  const scoped = scopedIssues(board);
  // A Story is a container even before it's broken down, so it always gets a
  // lane — that's where "+ Sub-task" lives. A Task/Bug with no sub-tasks is
  // itself the work item, so it belongs in "Other items" as a card.
  const lanes: Lane[] = scoped
    .filter(({ item }) => item.subtasks.length > 0 || item.type === "story")
    .map(({ item, column }) => ({
      id: `parent:${item.number}`,
      title: `#${item.number} ${item.title}`,
      parent: { item, column },
      items: item.subtasks.map((t) => ({
        number: t.number,
        title: t.title,
        state: t.state,
        assignees: t.assignees,
        url: t.url,
        column: t.column,
        type: "subtask" as IssueType,
        labels: t.labels,
        parent: item,
      })),
    }));

  const others = scoped
    .filter(({ item }) => item.subtasks.length === 0 && item.type !== "story")
    .map(({ item, column }) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      assignees: item.assignees,
      url: item.url,
      column,
      type: item.type,
      labels: item.labels,
      parent: null,
    }));

  if (others.length > 0) lanes.push({ id: OTHERS_LANE, title: t("Other items"), items: others });
  return lanes;
}

export function buildLanes(board: BoardResponse, laneMode: Exclude<LaneMode, "none">): Lane[] {
  if (laneMode === "parent") return buildParentLanes(board);
  if (laneMode === "assignee") return buildAssigneeLanes(board);
  return buildExpediteLanes(board);
}
