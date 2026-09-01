import { useCallback, useEffect, useRef, useState } from "react";
import { t, count, setLocale } from "../i18n";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  ApiError,
  getAssignees,
  getBoard,
  getConfig,
  moveIssue,
  setPriority,
  deleteStory,
  deleteTask,
  updateStory,
  updateTask,
  type BoardResponse,
  type ColumnKey,
  type BoardItem,
  type SubtaskItem,
} from "../api";
import { columnsFor } from "../columns";
import { buildLanes, isLaneMode, LANE_MODES_BY_MODE, laneModeLabels, type LaneMode } from "../lanes";
import { BacklogView, type PrioBucket } from "./BacklogView";
import { completionBlockers } from "../completion";
import { Column } from "./Column";
import { DetailPanel, type DetailTarget, type Patch } from "./DetailPanel";
import { IssueEditPanel } from "./IssueEditPanel";
import { RetroView } from "./RetroView";
import { SwimlaneBoard } from "./SwimlaneBoard";
import { TaskEditPanel } from "./TaskEditPanel";

/** Three screens: the backlog is where you plan, the board is where you
 * track (as in Jira), and the retro is where a ceremony happens — it has no
 * status columns because it isn't progress tracking. Swimlanes are a
 * grouping *within* the board screen (Jira's "group-by" dropdown), not
 * screens of their own. */
type Screen = "backlog" | "board" | "retro";
const SCREEN_STORAGE_KEY = "board-ui:screen";
const LANE_STORAGE_KEY = "board-ui:lane";
/** Superseded by LANE_STORAGE_KEY; read once so an existing tab doesn't lose
 * its choice. "story" was the plain board, "task" the parent swimlanes. */
const LEGACY_LAYOUT_KEY = "board-ui:view";

/** Skills open a specific screen by URL (`?view=backlog`) — /agile:refine and
 * /agile:sprint-start want the backlog, /agile:board and /agile:standup want
 * the board — so the query parameter wins over the remembered choice. */
function loadScreen(): Screen {
  const param = new URLSearchParams(window.location.search).get("view");
  if (param === "backlog" || param === "board" || param === "retro") return param;
  // The retro screen is never restored from storage: it belongs to a
  // ceremony that has since ended, so landing on it later would show an
  // empty round rather than the work.
  return localStorage.getItem(SCREEN_STORAGE_KEY) === "backlog" ? "backlog" : "board";
}

/** Likewise `?lane=assignee`, so /agile:standup can land straight on the
 * per-person lanes a daily standup is walked through. */
function loadLaneMode(): LaneMode {
  const param = new URLSearchParams(window.location.search).get("lane");
  if (isLaneMode(param)) return param;
  const stored = localStorage.getItem(LANE_STORAGE_KEY);
  if (isLaneMode(stored)) return stored;
  return localStorage.getItem(LEGACY_LAYOUT_KEY) === "task" ? "parent" : "none";
}

function findItem(board: BoardResponse, number: number): { title: string } | null {
  for (const col of board.columns) {
    for (const item of col.items) {
      if (item.number === number) return item;
      const task = item.subtasks.find((t) => t.number === number);
      if (task) return task;
    }
  }
  return null;
}

// Which column an issue currently sits in, per the fetched board — a top-level
// story's column is whichever column array it was returned under; a nested
// task carries its own `.column` independent of its parent story's column.
// How long the board waits after the last mutation before fetching once to
// reconcile with the server. Long enough for GitHub's list endpoints to catch
// up with the writes, short enough to pull in concurrent edits promptly.
const RECONCILE_DELAY_MS = 4000;
// How long a confirmed mutation keeps being reasserted over fetched
// snapshots. Covers the list endpoints' staleness window; after this the
// server's answer wins unconditionally.
const RECENT_MUTATION_TTL_MS = 15000;
// Focus revalidation won't refetch if the board was fetched more recently
// than this — tabbing in and out repeatedly shouldn't drum the API.
const FOCUS_REVALIDATE_MIN_MS = 10000;

/** Swap one top-level card's prio:* label. Shared by the optimistic apply,
 * its per-row rollback, and the reassert-over-snapshot step in refresh(). */
function swapPrioLabel(board: BoardResponse, number: number, priority: PrioBucket): BoardResponse {
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      items: c.items.map((i) =>
        i.number === number
          ? {
              ...i,
              labels: [
                ...i.labels.filter((l) => !l.name.startsWith("prio:")),
                ...(priority ? [{ name: `prio:${priority}` }] : []),
              ],
            }
          : i,
      ),
    })),
  };
}

function findPrioBucket(board: BoardResponse, number: number): PrioBucket {
  for (const col of board.columns) {
    for (const item of col.items) {
      if (item.number === number) {
        const label = item.labels.find((l) => l.name.startsWith("prio:"));
        return (label ? label.name.slice("prio:".length) : null) as PrioBucket;
      }
    }
  }
  return null;
}

function findItemColumn(board: BoardResponse, number: number): ColumnKey | null {
  for (const col of board.columns) {
    for (const item of col.items) {
      if (item.number === number) return col.key;
      const task = item.subtasks.find((t) => t.number === number);
      if (task) return task.column;
    }
  }
  return null;
}

/** Resolve a tapped issue number against the *current* board. The panel
 * stores only the number, never the item, so it re-resolves every render —
 * a drag or a background reconcile updates the open panel for free. Returns
 * null once the item leaves the board (withdrawn, or a kanban Done card
 * aging out of the recent-N sample), which closes the panel. */
function findDetailTarget(board: BoardResponse, number: number): DetailTarget | null {
  for (const col of board.columns) {
    for (const item of col.items) {
      if (item.number === number) return { kind: "issue", item, column: col.key };
      const task = item.subtasks.find((t) => t.number === number);
      if (task) return { kind: "subtask", item: task, parent: item };
    }
  }
  return null;
}

const WIP_COLUMNS: ColumnKey[] = ["doing", "review"];

/** Moves one work item's contribution from one column's WIP count to
 * another's. Used for both sub-tasks and undecomposed Task/Bug cards, which
 * count identically. */
function shiftWip(current: BoardResponse["wip"], from: ColumnKey, to: ColumnKey): BoardResponse["wip"] {
  const wip = { doing: { ...current.doing }, review: { ...current.review } };
  if (WIP_COLUMNS.includes(from)) wip[from as "doing" | "review"].count -= 1;
  if (WIP_COLUMNS.includes(to)) wip[to as "doing" | "review"].count += 1;
  wip.doing.over = wip.doing.limit != null && wip.doing.count > wip.doing.limit;
  wip.review.over = wip.review.limit != null && wip.review.count > wip.review.limit;
  return wip;
}

// Applies a drag-and-drop move to the local board state immediately, so the
// card jumps to its new column the instant it's dropped instead of waiting
// on the PATCH round-trip + refresh (which made moves feel sluggish, and —
// worse — left the item's milestone stale in the UI right after a
// Backlog→Sprint move, blocking "+Sub-task" until a later refresh caught up).
// Mirrors the server's own status/milestone rules (see server/routes/issues.js)
// closely enough for display purposes; the follow-up refresh() reconciles
// with the real server state in the background.
function moveItemOptimistically(board: BoardResponse, number: number, column: ColumnKey): BoardResponse {
  for (const col of board.columns) {
    const story = col.items.find((i) => i.number === number);
    if (story) {
      const sourceKey = col.key;
      if (sourceKey === column) return board;
      const updatedStory: BoardItem = { ...story };
      // Done means closed on GitHub; mirror it so anything keyed off state
      // (the "mark as Done" button's own enabled check) settles immediately
      // instead of only after the refresh lands.
      if (column === "done") updatedStory.state = "CLOSED";
      else if (String(story.state).toUpperCase() === "CLOSED") updatedStory.state = "OPEN";
      if (board.mode === "sprint") {
        if (column === "backlog") updatedStory.milestone = null;
        else if (!story.milestone && board.sprintMilestone) updatedStory.milestone = board.sprintMilestone;
      }
      // An undecomposed Task/Bug is a work item, so moving it in or out of
      // Doing/Review shifts the WIP count — same rule the server applies
      // (countsTowardWip in server/columns.js). Stories and broken-down
      // parents are containers and never count.
      const counts = story.type !== "story" && story.subtasks.length === 0;
      return {
        ...board,
        wip: counts ? shiftWip(board.wip, sourceKey, column) : board.wip,
        columns: board.columns.map((c) => {
          if (c.key === sourceKey) return { ...c, items: c.items.filter((i) => i.number !== number) };
          if (c.key === column) return { ...c, items: [...c.items, updatedStory] };
          return c;
        }),
      };
    }

    for (const item of col.items) {
      const task = item.subtasks.find((t) => t.number === number);
      if (task) {
        const sourceKey = task.column;
        if (sourceKey === column) return board;
        return {
          ...board,
          wip: shiftWip(board.wip, sourceKey, column),
          columns: board.columns.map((c) => ({
            ...c,
            items: c.items.map((i) =>
              i.number === item.number
                ? { ...i, subtasks: i.subtasks.map((t) => (t.number === number ? { ...t, column } : t)) }
                : i,
            ),
          })),
        };
      }
    }
  }
  return board;
}

export function Board() {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDragTitle, setActiveDragTitle] = useState<string | null>(null);
  const [wipConfirm, setWipConfirm] = useState<{ number: number; column: ColumnKey; message: string } | null>(null);
  const [editingStory, setEditingStory] = useState<number | "new" | null>(null);
  const [taskPanel, setTaskPanel] = useState<{ story: BoardItem; task: SubtaskItem | null } | null>(null);
  // The tapped card's number — the DetailPanel target is re-derived from the
  // live board every render (see findDetailTarget).
  const [detailNumber, setDetailNumber] = useState<number | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Record<"story" | "task" | "bug", string> | undefined>();
  const [screen, setScreen] = useState<Screen>(loadScreen);
  // A session opened as a retro (`?view=retro`, which is how /agile:retro opens
  // it) is a dead end: no way out to the backlog or the board.
  //
  // Everyone taking part opens this on their own machine and is told to write
  // cards in silence. Leaving the daily screens one click away hands every
  // participant a drag-and-drop board that writes to real items, in a meeting
  // where nobody means to touch it — and the ceremony works by everybody
  // writing at the same time, so there is nothing to go and look at anyway.
  //
  // This costs nothing, because asking for the backlog mid-retrospective still
  // works: the skill opens it, and the skill knows which backend this project
  // uses. The switch here never did — it always showed board-ui's own screens,
  // which on a JIRA project is the wrong system entirely.
  //
  // Deliberately not persisted: opening the board tomorrow should not still
  // land on the retro.
  const [retroSession] = useState(() => new URLSearchParams(window.location.search).get("view") === "retro");
  const [laneMode, setLaneMode] = useState<LaneMode>(loadLaneMode);

  const changeScreen = useCallback((next: Screen) => {
    setScreen(next);
    if (next !== "retro") localStorage.setItem(SCREEN_STORAGE_KEY, next);
  }, []);

  const changeLaneMode = useCallback((next: LaneMode) => {
    setLaneMode(next);
    localStorage.setItem(LANE_STORAGE_KEY, next);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Cards are draggable *and* tappable. The 6px activation distance already
  // keeps a plain tap from starting a drag; this ref covers the other
  // direction — after a real drag, the browser still fires a click on the
  // dropped card, which without the guard would pop the panel open on every
  // drop. Set when a drag activates, cleared a tick after it ends so the
  // stray click (same tick as pointerup) is swallowed.
  const dragHappenedRef = useRef(false);

  const openDetail = useCallback((number: number) => {
    if (dragHappenedRef.current) return;
    setDetailNumber(number);
  }, []);

  // Moves still in flight (PATCH sent, not yet confirmed by a refresh).
  // Needed because dragging two cards quickly overlaps their async work: the
  // first move's background refresh can fetch a snapshot from *before* the
  // second move reached the server, and blindly committing that snapshot to
  // state would wipe out the second card's already-applied optimistic move
  // (it'd revert, then jump back once its own refresh caught up — reported
  // as "only the first card updates, the second appears a few seconds later").
  const pendingMovesRef = useRef<Map<number, ColumnKey>>(new Map());
  // Mirrors `board`, but written synchronously at every point we change it, so
  // two drops in the same tick don't both read the pre-first-drop state the
  // way a render closure would.
  const boardRef = useRef<BoardResponse | null>(null);
  // Mutations confirmed by the server whose effect a fetched snapshot might
  // not reflect yet (list reads lag writes). Reasserted over every applied
  // snapshot until they age out — see refresh().
  const recentMovesRef = useRef<Map<number, { column: ColumnKey; at: number }>>(new Map());
  const recentPrioRef = useRef<Map<number, { priority: PrioBucket; at: number }>>(new Map());
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchAtRef = useRef(0);

  const refresh = useCallback(async (expect?: { number: number }) => {
    // GitHub's list endpoints can lag slightly behind a just-created issue,
    // so a refresh fired right after a panel save can come back without it.
    // When we know which number to expect, retry a few times with a short
    // delay instead of requiring a manual reload. (Moves don't route through
    // this any more — a confirmed move trusts its optimistic state and
    // reconciles via scheduleReconcile, so existence is the only thing left
    // to wait for.)
    //
    // Crucially, an intermediate *stale* read must NOT be applied to the
    // visible board — doing so briefly overwrote an already-correct
    // optimistic update with old data, then corrected itself a moment
    // later, which looked like the card snapping back and then re-moving
    // itself. Only commit a fetch to state once it satisfies what we're
    // waiting for, or we've run out of retries and have nothing better.
    const maxAttempts = expect != null ? 4 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        let data = await getBoard();
        // Set the language before anything renders text. The server has
        // already collapsed a free-form locale down to the two this UI ships.
        setLocale(data.locale);
        lastFetchAtRef.current = Date.now();
        setError(null);
        const satisfied = !expect || findItemColumn(data, expect.number) != null;
        const isLastAttempt = attempt === maxAttempts - 1;
        if (satisfied || isLastAttempt) {
          // Reassert any other moves still in flight — this fetch is a full
          // server snapshot and knows nothing about them.
          for (const [num, col] of pendingMovesRef.current) {
            if (num === expect?.number) continue;
            data = moveItemOptimistically(data, num, col);
          }
          // A snapshot can also be stale for a mutation that *succeeded*
          // moments ago (list reads lag writes) — reassert those too until
          // they age out. When the fetch already agrees, both helpers are
          // no-ops, so this converges to the server's answer by itself.
          const now = Date.now();
          for (const [num, m] of recentMovesRef.current) {
            if (now - m.at > RECENT_MUTATION_TTL_MS) {
              recentMovesRef.current.delete(num);
              continue;
            }
            data = moveItemOptimistically(data, num, m.column);
          }
          for (const [num, p] of recentPrioRef.current) {
            if (now - p.at > RECENT_MUTATION_TTL_MS) {
              recentPrioRef.current.delete(num);
              continue;
            }
            data = swapPrioLabel(data, num, p.priority);
          }
          boardRef.current = data;
          setBoard(data);
        }
        if (satisfied) break;
      } catch (err) {
        if (err instanceof ApiError && err.payload && (err.payload as { error?: string }).error === "not_initialized") {
          setError("not_initialized");
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        break;
      }
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 700));
    }
    setLoading(false);
  }, []);

  // Catch-all for the setBoard paths that don't write the ref themselves
  // (panels saving). The hot paths write it inline — this only has to be
  // right by the next render, not within the tick.
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  // One background fetch per burst of activity, instead of a confirming
  // refetch per mutation. The mutation response is already authoritative —
  // gh issue edit is synchronous, so the labels are swapped the moment the
  // move API returns 200; only GitHub's list reads lag behind. Re-fetching
  // immediately therefore confirms nothing, and the old per-move refetch
  // retried up to 4× at several gh spawns each — a two-card burst put ~40 gh
  // processes in flight, the kind of load GitHub's secondary rate limit
  // exists to reject. Instead: trust the optimistic state, wait for the
  // board to go quiet, fetch once to pick up concurrent edits.
  const scheduleReconcile = useCallback(() => {
    if (reconcileTimerRef.current != null) clearTimeout(reconcileTimerRef.current);
    const fire = () => {
      reconcileTimerRef.current = null;
      if (pendingMovesRef.current.size > 0) {
        // Still mid-burst — wait for the in-flight move to settle first.
        reconcileTimerRef.current = setTimeout(fire, RECONCILE_DELAY_MS);
        return;
      }
      void refresh();
    };
    reconcileTimerRef.current = setTimeout(fire, RECONCILE_DELAY_MS);
  }, [refresh]);

  useEffect(
    () => () => {
      if (reconcileTimerRef.current != null) clearTimeout(reconcileTimerRef.current);
    },
    [],
  );

  // Outside a burst the board never syncs on its own, so a teammate's change
  // stays invisible until Reload. Ceremonies don't need this (standup runs on
  // the facilitator's shared screen — see docs/open-board.md); it's for the
  // rest of the day, when several people work with the board open on their
  // own machines. The SWR/Trello answer: revalidate when the window regains
  // focus. Costs nothing while idle, syncs at the moment the user actually
  // looks, and the min-interval guard keeps rapid alt-tabbing from drumming
  // the API.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAtRef.current < FOCUS_REVALIDATE_MIN_MS) return;
      if (pendingMovesRef.current.size > 0) return;
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    getAssignees()
      .then((res) => setAssignees(res.logins))
      .catch(() => setAssignees([]));
    // Once, at startup, rather than on the board payload: templates change
    // when someone edits a file in .agile/, not while a board is open, and
    // the board response is refetched on every reconcile.
    getConfig()
      .then((cfg) => setTemplates(cfg.templates))
      .catch(() => setTemplates(undefined));
  }, []);

  /** Writes one panel field. The board is refreshed from the result rather
   * than patched optimistically: unlike a drag, an inline edit is a
   * deliberate pause, so a fetch on save costs nothing anyone is waiting
   * through — and it keeps the panel showing what the server actually has.
   * Throwing is what tells the field to put its previous value back. */
  const doPatch = useCallback(async (target: DetailTarget, patch: Patch) => {
    try {
      if (target.kind === "subtask") {
        // The sub-task API takes the description separately, because the
        // body it lives in also carries the parent link (tasks.js).
        await updateTask(target.parent.number, target.item.number, {
          title: patch.title ?? target.item.title,
          ...(patch.body !== undefined ? { detail: patch.body } : {}),
          ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}),
        });
      } else {
        await updateStory(target.item.number, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          // A label swap. The body is left exactly as written — a Story that
          // becomes a Bug keeps what someone typed, the same way Jira leaves
          // a description alone when the type changes.
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          // "" from the picker means "no label", which the server clears on
          // an explicit null (omitting the key would leave it untouched).
          ...(patch.priority !== undefined ? { priority: patch.priority || null } : {}),
          ...(patch.points !== undefined ? { points: patch.points ? Number(patch.points) : null } : {}),
          ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}),
        });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [refresh]);

  /** Close as not planned. Never a delete: GitHub's delete is irreversible
   * and needs admin rights (see stories SKILL.md). */
  const doWithdraw = useCallback(
    async (target: DetailTarget) => {
      const n = target.item.number;
      if (!confirm(`${t("Withdraw (close)")} #${n}?`)) return;
      try {
        if (target.kind === "subtask") await deleteTask(target.parent.number, n);
        else await deleteStory(n, t("Not planned"));
        // It leaves the board, so the panel would be describing something no
        // longer on screen.
        setDetailNumber(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  const doMove = useCallback(
    async (number: number, column: ColumnKey, force = false) => {
      // Roll back only this card, never a whole-board snapshot. `previousBoard
      // = board` read the closure, so a second drop made before the first had
      // re-rendered captured the board from *before* the first move — one
      // failure then reverted both cards, leaving the visible board disagreeing
      // with the server, which is what made cards look stuck afterwards.
      // boardRef is written synchronously here so back-to-back drops each see
      // the previous one.
      const current = boardRef.current;
      const sourceColumn = current ? findItemColumn(current, number) : null;
      pendingMovesRef.current.set(number, column);
      const optimistic = current ? moveItemOptimistically(current, number, column) : current;
      boardRef.current = optimistic;
      setBoard(optimistic);
      try {
        await moveIssue(number, column, force);
        // Success is final — keep the optimistic state as truth and let the
        // burst-level reconcile pick up anything else that changed.
        recentMovesRef.current.set(number, { column, at: Date.now() });
        scheduleReconcile();
      } catch (err) {
        if (sourceColumn) {
          const reverted = boardRef.current
            ? moveItemOptimistically(boardRef.current, number, sourceColumn)
            : boardRef.current;
          boardRef.current = reverted;
          setBoard(reverted);
        }
        if (err instanceof ApiError && err.status === 409) {
          const payload = err.payload as { message: string; error?: string };
          // A WIP breach is a judgement call, so it's offered as "Continue" with
          // force. Unfinished sub-tasks aren't: the way past that one is to
          // finish or withdraw them, or to turn the rule off in config — so
          // it reports rather than asks.
          if (payload.error === "subtasks_open") {
            setError(`${payload.message} ${t("Finish or withdraw the sub-tasks before finishing the parent.")}`);
          } else {
            setWipConfirm({ number, column, message: payload.message });
          }
        } else {
          // The banner, not alert() — two quick failures would stack two
          // modal dialogs, and the banner leaves the board usable.
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        pendingMovesRef.current.delete(number);
      }
    },
    [scheduleReconcile],
  );

  // Reprioritising is a label swap, so unlike a column move there's no
  // milestone/close side effect to mirror — swap the prio label locally for
  // an instant reaction, and let the burst reconcile confirm it. Rollback
  // restores this one row's previous bucket, read from boardRef at call
  // time — a whole-board snapshot from the render closure could predate an
  // earlier still-rendering change, so reverting to it rolled that back too
  // (the same defect doMove had).
  const doSetPriority = useCallback(
    async (number: number, priority: PrioBucket) => {
      const current = boardRef.current;
      if (!current) return;
      const previous = findPrioBucket(current, number);
      const optimistic = swapPrioLabel(current, number, priority);
      boardRef.current = optimistic;
      setBoard(optimistic);
      try {
        await setPriority(number, priority);
        recentPrioRef.current.set(number, { priority, at: Date.now() });
        scheduleReconcile();
      } catch (err) {
        const reverted = boardRef.current ? swapPrioLabel(boardRef.current, number, previous) : null;
        if (reverted) {
          boardRef.current = reverted;
          setBoard(reverted);
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [scheduleReconcile],
  );

  const handleDragStart = (e: DragStartEvent) => {
    dragHappenedRef.current = true;
    if (!board) return;
    const number = e.active.data.current?.number as number | undefined;
    if (number == null) return;
    setActiveDragTitle(findItem(board, number)?.title ?? null);
  };

  // The click the browser fires after a drop arrives in the same tick as
  // pointerup — clearing on a 0ms timeout lets it be swallowed, then re-arms
  // tapping.
  const clearDragFlag = () => {
    setTimeout(() => {
      dragHappenedRef.current = false;
    }, 0);
  };

  const handleDragCancel = () => {
    setActiveDragTitle(null);
    clearDragFlag();
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragTitle(null);
    clearDragFlag();
    if (!e.over) return;
    const over = e.over.data.current as
      | { column?: ColumnKey; laneId?: string; kind?: string; priority?: PrioBucket }
      | undefined;
    const dragged = e.active.data.current as { number?: number } | undefined;
    // Backlog screen: the drop target is either a prio bucket (relabel) or
    // the sprint box at the top (which is a move into Todo).
    if (over?.kind === "prio") {
      const from = (e.active.data.current as { priority?: PrioBucket } | undefined)?.priority ?? null;
      const to = over.priority ?? null;
      // Picking a row up and putting it back is not a reprioritisation.
      if (dragged?.number != null && from !== to) doSetPriority(dragged.number, to);
      return;
    }
    if (over?.kind === "sprint") {
      if (dragged?.number != null) doMove(dragged.number, "todo");
      return;
    }
    // The plain board drops on a column; a swimlane board drops on a
    // lane×column cell, which also carries the lane it belongs to.
    const overColumn = (over?.column ?? e.over.id) as ColumnKey | undefined;
    const active = e.active.data.current as { number?: number; laneId?: string } | undefined;
    const number = active?.number;
    if (!overColumn || number == null) return;
    // A card can only move within its own lane — the move API swaps status
    // labels; it can't re-parent a sub-task, reassign it, or change its
    // priority, which is what a cross-lane drop would have to mean.
    if (over?.laneId != null && over.laneId !== active?.laneId) return;
    // The same rule "mark as Done" applies, so a card can't be dragged past a
    // guard the button enforces. Checked here as well as on the server so the
    // card doesn't visibly land in Done and then jump back.
    if (overColumn === "done" && boardRef.current) {
      const target = findDetailTarget(boardRef.current, number);
      if (target?.kind === "issue") {
        const blockers = completionBlockers(target.item, boardRef.current.requireSubtasksDone);
        if (blockers.length > 0) {
          setError(blockers.join(" "));
          return;
        }
      }
    }
    doMove(number, overColumn);
  };

  if (loading) return <div className="board-status">{t("Loading")}…</div>;
  if (error === "not_initialized") {
    return (
      <div className="board-status">
        {t("This project is not initialised yet. Run")} <code>/agile:init</code>{" "}
        {t("in Claude Code.")}
      </div>
    );
  }
  // Only take over the screen when there is nothing to take over — a failed
  // refresh used to replace an otherwise fine board with a single line of
  // text, and since the only thing that clears `error` is a successful
  // getBoard(), removing the board removed every way to trigger one. The
  // board stays; the error rides above it and can be retried or dismissed.
  if (error && !board) return <div className="board-status board-status--error">{t("Error: ")}{error}</div>;
  if (!board) return null;

  // The board screen is named after the mode it's showing (Jira calls the
  // scrum one "active sprint"), so it's obvious which set of rules
  // is in force — a sprint board is time-boxed, a kanban board flows.
  const boardLabel = board.mode === "sprint" ? t("Sprint board") : t("Kanban board");
  // Only the groupings that make sense for this mode are offered (see
  // lanes.ts). A remembered or URL-supplied choice from the other mode —
  // e.g. `?lane=assignee` while in kanban — falls back to the plain board
  // rather than rendering a grouping that mode deliberately doesn't have.
  const laneModes = LANE_MODES_BY_MODE[board.mode];
  const laneLabels = laneModeLabels();
  const activeLaneMode = laneModes.includes(laneMode) ? laneMode : "none";

  const detailTarget = detailNumber != null ? findDetailTarget(board, detailNumber) : null;
  // Gates both the panel and the room the board makes for it, so the board
  // can never be indented for a panel that isn't there.
  const panelOpen = screen !== "retro" && detailTarget != null;

  // Issues carrying status:todo/doing/review without the sprint's milestone.
  // Jira can't produce this state — sprint membership there is one field, not
  // a label that can drift from another label — so it has no Jira-side answer
  // to copy. They used to be visible on the board because everything outside
  // the sprint landed in the Backlog column; with that column gone they'd
  // vanish silently, which is the one thing a data inconsistency must not do.
  // A count on the sprint board keeps them findable without putting
  // not-in-the-sprint cards back on a sprint board.
  const staleCount =
    board.mode === "sprint"
      ? (board.columns.find((c) => c.key === "backlog")?.items ?? []).filter((i) => i.staleStatus).length
      : 0;
  // Same eligibility the card's own +Sub-task button uses.
  const detailCanAddSubtask =
    detailTarget?.kind === "issue" &&
    detailTarget.item.type !== "subtask" &&
    (board.mode !== "sprint" || !!detailTarget.item.milestone);

  return (
    <div className={panelOpen ? "board-page board-page--panel-open" : "board-page"}>
      {error && (
        <div className="board-error-banner" role="alert">
          <span className="board-error-banner__text">{t("Error: ")}{error}</span>
          <button onClick={() => refresh()}>{t("Retry")}</button>
          <button onClick={() => setError(null)}>{t("Close")}</button>
        </div>
      )}
      <header className="board-header">
        <h1>{board.repo}</h1>
        <span className="board-header__mode">{board.mode === "sprint" ? `sprint: ${board.sprintMilestone ?? "-"}` : "kanban"}</span>
        {retroSession ? (
          <span className="view-switch__label">{t("Retrospective")}</span>
        ) : (
          <div className="view-switch" role="group" aria-label={t("Switch view")}>
            <button
              className={screen === "backlog" ? "view-switch__btn view-switch__btn--active" : "view-switch__btn"}
              aria-pressed={screen === "backlog"}
              onClick={() => changeScreen("backlog")}
            >
              {t("Backlog")}
            </button>
            <button
              className={screen === "board" ? "view-switch__btn view-switch__btn--active" : "view-switch__btn"}
              aria-pressed={screen === "board"}
              onClick={() => changeScreen("board")}
            >
              {boardLabel}
            </button>
          </div>
        )}
        {screen === "board" && (
          <div className="view-switch view-switch--sub" role="group" aria-label={t("Swimlane")}>
            <span className="view-switch__label">{t("Swimlane")}</span>
            {laneModes.map((key) => (
              <button
                key={key}
                className={
                  activeLaneMode === key ? "view-switch__btn view-switch__btn--active" : "view-switch__btn"
                }
                aria-pressed={activeLaneMode === key}
                onClick={() => changeLaneMode(key)}
              >
                {laneLabels[key]}
              </button>
            ))}
          </div>
        )}
        {/* Jira keeps Create reachable from every screen rather than making
            you navigate to the backlog first — same here. */}
        <button className="button--primary" onClick={() => setEditingStory("new")}>
          + {t("Create")}
        </button>
        {/* The retro screen refreshes itself — its own Refresh button is part
            of how the ceremony runs ("write, then press Refresh to see everyone
            else's cards"), so a second one here would just be dead. */}
        {screen !== "retro" && <button onClick={() => refresh()}>{t("Reload")}</button>}
      </header>
      {screen === "board" && staleCount > 0 && (
        <div className="board-stale-banner">
          <span>
            ⚠ {t("Items with a status label but no sprint")}: {count(staleCount)}.{" "}
            {t("Put them back in the sprint, or remove the label.")}
          </span>
          <button onClick={() => changeScreen("backlog")}>{t("Check in the backlog")}</button>
        </div>
      )}
      {screen === "retro" ? (
        <RetroView />
      ) : (
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {screen === "backlog" ? (
          <BacklogView
            board={board}
            onOpenItem={openDetail}
            onAddItem={() => setEditingStory("new")}
          />
        ) : activeLaneMode === "none" ? (
          <div className="board-columns">
            {columnsFor(board.mode).map((key) => {
              const col = board.columns.find((c) => c.key === key)!;
              return (
                <Column
                  key={key}
                  columnKey={key}
                  items={col.items}
                  wip={key === "doing" ? board.wip.doing : key === "review" ? board.wip.review : undefined}
                  mode={board.mode}
                  onOpenItem={openDetail}
                  onAddSubtask={(story) => setTaskPanel({ story, task: null })}
                  onAddStory={key === "backlog" ? () => setEditingStory("new") : undefined}
                />
              );
            })}
          </div>
        ) : (
          <SwimlaneBoard
            board={board}
            lanes={buildLanes(board, activeLaneMode)}
            onOpenItem={openDetail}
            onAddSubtask={(story) => setTaskPanel({ story, task: null })}
          />
        )}
        <DragOverlay>{activeDragTitle && <div className="drag-overlay">{activeDragTitle}</div>}</DragOverlay>
      </DndContext>
      )}

      {panelOpen && detailTarget && (
        <DetailPanel
          target={detailTarget}
          assignees={assignees}
          onPatch={doPatch}
          onClose={() => setDetailNumber(null)}
          onOpenItem={setDetailNumber}
          onWithdraw={doWithdraw}
          onAddSubtask={
            detailCanAddSubtask && detailTarget.kind === "issue"
              ? () => setTaskPanel({ story: detailTarget.item, task: null })
              : undefined
          }
          onRemoveFromSprint={
            board.mode === "sprint" && detailTarget.kind === "issue" && detailTarget.item.milestone
              ? () => {
                  doMove(detailTarget.item.number, "backlog");
                  // It leaves the sprint board entirely, so the panel would
                  // be describing something no longer on screen.
                  setDetailNumber(null);
                }
              : undefined
          }
        />
      )}

      {wipConfirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <p>{wipConfirm.message}</p>
            <div className="modal__actions">
              <button onClick={() => setWipConfirm(null)}>{t("Cancel")}</button>
              <button
                className="button--primary"
                onClick={() => {
                  const { number, column } = wipConfirm;
                  setWipConfirm(null);
                  doMove(number, column, true);
                }}
              >
                {t("Move anyway")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStory !== null && (
        <IssueEditPanel
          storyNumber={editingStory === "new" ? null : editingStory}
          assignees={assignees}
          templates={templates}
          onClose={() => setEditingStory(null)}
          onSaved={(number) => {
            setEditingStory(null);
            refresh({ number });
          }}
          onDeleted={() => {
            setEditingStory(null);
            // A withdrawn issue leaves the board, so findDetailTarget would
            // return null and hide the panel anyway — but clearing the
            // number stops it reappearing if that number ever comes back.
            setDetailNumber(null);
            refresh();
          }}
        />
      )}

      {taskPanel && (
        <TaskEditPanel
          story={taskPanel.story}
          task={taskPanel.task}
          assignees={assignees}
          onClose={() => setTaskPanel(null)}
          onSaved={(number) => {
            setTaskPanel(null);
            refresh({ number });
          }}
          onDeleted={() => {
            setTaskPanel(null);
            setDetailNumber(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
