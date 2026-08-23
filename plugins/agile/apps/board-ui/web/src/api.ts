import { t } from "./i18n";
export type ColumnKey = "backlog" | "todo" | "doing" | "review" | "done";

export interface IssueLabel {
  name: string;
  color?: string;
}

export interface Assignee {
  login: string;
}

/** Jira's taxonomy: Story / Task / Bug are peers in the backlog, Sub-task is
 * the child level under any of them. null = no type label yet. */
export type IssueType = "story" | "task" | "bug" | "subtask" | null;

export interface SubtaskItem {
  number: number;
  title: string;
  state: string;
  labels: IssueLabel[];
  assignees: Assignee[];
  column: ColumnKey;
  url: string;
  /** Markdown body, included in the board payload so the detail panel opens
   * without a per-issue fetch. */
  body?: string;
  /** That body minus the parent-link scaffolding — what the panel shows and
   * writes, derived server-side from data already fetched. */
  detail?: string;
}

export interface BoardItem {
  number: number;
  title: string;
  state: string;
  labels: IssueLabel[];
  assignees: Assignee[];
  milestone: string | null;
  url: string;
  /** See SubtaskItem.body. */
  body?: string;
  type: IssueType;
  subtasks: SubtaskItem[];
  /** True for a Backlog card that still carries a status:* label — it's not
   * a clean backlog item, it's not actually tracking the current sprint
   * (missing/stale milestone). */
  staleStatus?: boolean;
}

export interface BoardColumn {
  key: ColumnKey;
  items: BoardItem[];
}

export interface WipStatus {
  count: number;
  limit: number | null;
  over: boolean;
}

export interface BoardResponse {
  repo: string;
  mode: "kanban" | "sprint";
  /** Which of the two languages this screen renders in. `.agile/config.yml`'s
   * `locale` is free-form, but the UI ships `ja` and `en` only — the server
   * collapses anything else to `en`. */
  locale: "ja" | "en";
  sprintMilestone: string | null;
  /** `.agile/config.yml`'s experimental.require_subtasks_done — the rule that
   * stops a parent being finished while sub-tasks are still open (off by
   * default). */
  requireSubtasksDone: boolean;
  wip: { doing: WipStatus; review: WipStatus };
  columns: BoardColumn[];
}

export interface ConfigResponse {
  initialized: boolean;
  repo?: string;
  mode?: "kanban" | "sprint";
  wipLimit?: { doing?: number; review?: number };
  sprintMilestone?: string | null;
  /** Starting text for a new issue of each type, from
   * `.agile/templates/<type>.md` (or the built-in for the project's locale).
   * Delivered here so opening Create costs no extra request. */
  templates?: Record<"story" | "task" | "bug", string>;
}

/** The three buckets people write into during a retrospective. `carried` is
 * not one of them — it's last round's unfinished Try, shown read-only. */
export type RetroLane = "keep" | "problem" | "try";

export interface RetroCard {
  number: number;
  title: string;
  /** Notes taken while the group walked through this sticky. */
  body?: string;
  /** Which retrospective this card came from, e.g. "2026-08-11". */
  round: string | null;
  author: string | null;
  url: string;
  /** Carried lane only: true once the Try became a real work item (kaizen). */
  adopted?: boolean;
}

export interface RetroResponse {
  repo: string;
  mode: "kanban" | "sprint";
  round: string;
  lanes: { carried: RetroCard[]; keep: RetroCard[]; problem: RetroCard[]; try: RetroCard[] };
}

export const getRetro = () => request<RetroResponse>("/retro");

export const createRetroCard = (lane: RetroLane, title: string, round: string) =>
  request<{ ok: true; number: number; url: string }>("/retro/cards", {
    method: "POST",
    body: JSON.stringify({ lane, title, round }),
  });

export const updateRetroCard = (number: number, payload: { lane?: RetroLane; title?: string; body?: string }) =>
  request<{ ok: true }>(`/retro/cards/${number}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteRetroCard = (number: number) =>
  request<{ ok: true }>(`/retro/cards/${number}`, { method: "DELETE", body: JSON.stringify({}) });

export interface StoryDetail {
  number: number;
  title: string;
  /** As written. The edit form shows this verbatim rather than taking it
   * apart into fields, so nothing typed on GitHub is lost on save. */
  body: string;
  labels: IssueLabel[];
  state: string;
  milestone: { title: string } | null;
  assignees: Assignee[];
}
export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, payload: unknown, message: string) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    // fetch() throws (not a rejected-with-status response) when the request
    // never reaches a server at all — e.g. the board-ui server process died.
    // Surface that distinctly so the UI can tell "server is down" apart from
    // an ordinary API error instead of showing a raw "Failed to fetch".
    throw new Error(t("Cannot reach the board-ui server. Check in your terminal that it is running."));
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, payload, (payload as { message?: string })?.message ?? res.statusText);
  }
  return payload as T;
}

export const getConfig = () => request<ConfigResponse>("/config");
export const getBoard = () => request<BoardResponse>("/board");
export const getStory = (number: number) => request<StoryDetail>(`/stories/${number}`);
export const getAssignees = () => request<{ logins: string[] }>("/assignees");

export const moveIssue = (number: number, column: ColumnKey, force = false) =>
  request<{ ok: true }>(`/issues/${number}/status`, {
    method: "PATCH",
    body: JSON.stringify({ column, force }),
  });

export interface IssuePayload {
  title: string;
  /** Story / Task / Bug are peers, so creation takes the type the way Jira's
   * create dialog does — one path, type chosen inside it. */
  type?: "story" | "task" | "bug";
  /** The description, as markdown. One field for every type: what differs
   * between a Story and a Bug is the template it starts from, not the shape
   * of the form. Omitted entirely by callers that only touch labels, which
   * is what keeps a priority drag from rewriting a body. */
  body?: string;
  priority?: "high" | "mid" | "low";
  points?: number;
  column?: "backlog" | "todo";
  assignee?: string;
}

export const createStory = (payload: IssuePayload) =>
  request<{ ok: true; number: number }>("/stories", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** Omitting a field leaves it alone; passing null clears the label. That
 * difference is why priority/points widen here rather than reusing
 * IssuePayload's create-time types, where null has no meaning. */
export const updateStory = (
  number: number,
  payload: Omit<Partial<IssuePayload>, "priority" | "points"> & {
    priority?: IssuePayload["priority"] | null;
    points?: number | null;
  },
) =>
  request<{ ok: true }>(`/stories/${number}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

/** Backlog ordering is expressed with the three prio buckets, because
 * GitHub Issues has no arbitrary rank/position field to drag against.
 * Passing null clears the priority (the "unset" bucket). */
export const setPriority = (number: number, priority: "high" | "mid" | "low" | null) =>
  request<{ ok: true }>(`/stories/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });

export const deleteStory = (number: number, comment?: string) =>
  request<{ ok: true }>(`/stories/${number}`, {
    method: "DELETE",
    body: JSON.stringify({ comment }),
  });

export const createTask = (
  parentNumber: number,
  payload: { title: string; column?: "todo" | "doing" | "review"; assignee?: string; detail?: string },
) =>
  request<{ ok: true; number: number }>(`/stories/${parentNumber}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export interface TaskDetail {
  number: number;
  title: string;
  assignees: Assignee[];
  /** The description, with the parent-link scaffolding stripped off — a
   * sub-task is a title and a description, and both are editable. */
  detail: string;
}

export const getTask = (parentNumber: number, number: number) =>
  request<TaskDetail>(`/stories/${parentNumber}/tasks/${number}`);

export const updateTask = (
  parentNumber: number,
  number: number,
  payload: { title: string; assignee?: string; detail?: string },
) =>
  request<{ ok: true }>(`/stories/${parentNumber}/tasks/${number}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteTask = (parentNumber: number, number: number) =>
  request<{ ok: true }>(`/stories/${parentNumber}/tasks/${number}`, { method: "DELETE" });
