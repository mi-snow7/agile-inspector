import { Router } from "express";
import { gh, ghJson } from "../gh.js";
import { loadPmConfig, activeSprint } from "../config.js";
import { computeColumn, countsTowardWip, parseParentNumber } from "../columns.js";
import { openSubtasksMessage, uiLocale, wipLimitMessage } from "../i18n.js";

export const issuesRouter = Router();

const STATUS_LABELS = ["status:todo", "status:in-progress", "status:in-review"];
const TARGET_LABEL = { todo: "status:todo", doing: "status:in-progress", review: "status:in-review" };
const VALID_COLUMNS = ["backlog", "todo", "doing", "review", "done"];

// Must agree with the count board.js shows, or the board would display
// "2/3" while a move is rejected for exceeding the limit. Both route the
// decision through countsTowardWip, which needs to know which issues have
// been broken down — hence the second query for sub-task parents.
// Issues that have been broken down into sub-tasks — containers, so they
// don't count as work items themselves (see countsTowardWip).
async function fetchBrokenDownParents() {
  const subtasks = await ghJson([
    "issue", "list", "--state", "all", "--label", "type:subtask", "--json", "body", "--limit", "500",
  ]);
  return new Set(subtasks.map(parseParentNumber).filter((n) => n != null));
}

// Must agree with the count board.js shows, or the board would display
// "2/3" while a move is rejected for exceeding the limit — both route the
// decision through countsTowardWip.
async function countWorkItemsInColumn(label, milestone, brokenDownParents) {
  const args = ["issue", "list", "--state", "open", "--label", label, "--json", "number,labels", "--limit", "50"];
  if (milestone) args.push("--milestone", milestone);
  const issues = await ghJson(args);
  return issues.filter((i) => countsTowardWip(i, brokenDownParents)).length;
}

/**
 * Sub-tasks of `parent` that aren't finished, for teams that switched
 * `require_subtasks_done` on. "完了にする" always refused to close a parent
 * over open children; a drag onto Done didn't check at all, so the rule was
 * one drag away from not existing. Every path goes through it now.
 */
async function openSubtasksOf(parent) {
  const subtasks = await ghJson([
    "issue", "list", "--state", "open", "--label", "type:subtask", "--json", "number,title,body", "--limit", "500",
  ]);
  return subtasks.filter((t) => parseParentNumber(t.body) === parent);
}

// Moves an issue between board columns by swapping `status:*` labels (or
// close/reopen for Done), mirroring the /agile:board skill's rules exactly:
// only labels the issue currently has are ever passed to --remove-label, and
// Doing/Review WIP limits are enforced (per work item, stories excluded)
// unless the caller passes force.
issuesRouter.patch("/issues/:number/status", async (req, res, next) => {
  try {
    const number = Number(req.params.number);
    const { column, force } = req.body ?? {};
    if (!Number.isInteger(number) || !VALID_COLUMNS.includes(column)) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const cfg = await loadPmConfig();
    if (!cfg) {
      res.status(400).json({ error: "not_initialized" });
      return;
    }

    const current = await ghJson(["issue", "view", String(number), "--json", "state,labels,milestone"]);
    const currentLabelNames = (current.labels ?? []).map((l) => l.name);
    const sprintMilestone = activeSprint(cfg);

    // Same rule board.js's column grouping uses — an issue whose status
    // label claims todo/doing/review but doesn't carry the current sprint's
    // milestone counts as Backlog. Sharing computeColumn (instead of each
    // route re-deriving its own "is this an orphan" logic) is what this
    // refactor is for: they used to disagree, so dragging an orphan from its
    // displayed Backlog position into Todo looked like a same-column no-op
    // and skipped milestone assignment entirely.
    const effectiveColumn = computeColumn(current, { sprintMilestone });

    // Dropping a card back on the column it's already in must be a true
    // no-op. Without this guard, the label-swap below would remove the
    // current status label (it's in STATUS_LABELS and present) without
    // re-adding it, since the "add" step skips labels already present —
    // silently stripping the status on a redundant same-column drop.
    if (effectiveColumn === column) {
      res.json({ ok: true, number, column });
      return;
    }

    if ((column === "doing" || column === "review") && !force) {
      const limit = (cfg.wip_limit ?? {})[column];
      if (limit != null) {
        const brokenDownParents = await fetchBrokenDownParents();
        // A container (a story, or a Task/Bug already broken down) isn't a
        // work item, so moving one into Doing/Review can't breach the limit.
        if (countsTowardWip({ number, labels: current.labels }, brokenDownParents)) {
          const milestone = activeSprint(cfg);
          // TARGET_LABEL, not `status:${column}` — the column keys are
          // doing/review and the labels are status:in-progress/status:in-review,
          // so the interpolated form asked for `status:review`, matched
          // nothing, counted 0, and let every move through. The limit has
          // never once fired on a drag; the board showed 3/3 beside a column
          // that would still accept a fourth card.
          const currentCount = await countWorkItemsInColumn(TARGET_LABEL[column], milestone, brokenDownParents);
          if (currentCount + 1 > limit) {
            res.status(409).json({
              error: "wip_exceeded",
              message: wipLimitMessage(uiLocale(cfg), column, limit, currentCount),
              limit,
              currentCount,
            });
            return;
          }
        }
      }
    }

    const wasClosed = String(current.state).toUpperCase() === "CLOSED";

    // Checked here rather than only in the browser: the board's copy of the
    // sub-tasks is a few seconds old at best, and this decides whether an
    // issue gets closed. Only costs a query when something is actually being
    // finished, and only while the rule is switched on.
    //
    // Under `experimental:` on purpose — the block's contract is that its
    // keys may change or disappear between versions, which is what makes it
    // safe to try a rule like this out before committing to it. Dropping the
    // key just returns the default behaviour; nothing about the issues or
    // labels depends on it.
    //
    // Off unless a team turns it on, which is how Jira ships: closing a
    // parent with open sub-tasks is allowed by default there, and blocking it
    // is a workflow validator you add deliberately. The board still *reports*
    // the state either way — see the ⚠ on a closed parent's card — so the
    // default is permissive without being blind.
    //
    // When it is on, it's deliberately not overridable with `force` the way
    // the WIP limit is: finish the sub-tasks, withdraw them (取り下げる), or
    // turn the rule back off — decisions worth making once, not per drag.
    if (column === "done" && cfg.experimental?.require_subtasks_done === true) {
      const open = await openSubtasksOf(number);
      if (open.length > 0) {
        res.status(409).json({
          error: "subtasks_open",
          message: openSubtasksMessage(uiLocale(cfg), open),
          subtasks: open.map((t) => ({ number: t.number, title: t.title })),
        });
        return;
      }
    }

    if (column === "done") {
      // Done leaves milestone untouched — it stays part of that sprint's
      // history for velocity calculations.
      if (!wasClosed) await gh(["issue", "close", String(number)]);
    } else {
      if (wasClosed) await gh(["issue", "reopen", String(number)]);
      const target = TARGET_LABEL[column];
      // Never remove the label we're about to end up with — an orphan
      // fixing itself (Backlog-displayed → Todo, where the status:todo
      // label was already present but the milestone wasn't) would otherwise
      // strip it here and never re-add it below, same class of bug as the
      // redundant-same-column-drop issue this guard originally fixed for.
      const removeArgs = STATUS_LABELS.filter((l) => l !== target && currentLabelNames.includes(l)).flatMap((l) => [
        "--remove-label",
        l,
      ]);
      const addArgs = target && !currentLabelNames.includes(target) ? ["--add-label", target] : [];

      // Backlog has no milestone by convention (see README); Todo/Doing/Review
      // belong to the active sprint. Only touch milestone in sprint mode.
      // effectiveColumn !== column already guarantees this is a genuine
      // cross-column move (not a within-Todo/Doing/Review shuffle), so
      // assign/clear unconditionally rather than only when milestone was
      // null — covers both "no milestone" and "stale/different milestone"
      // orphans the same way board.js's grouping does.
      const milestoneArgs = [];
      if (sprintMilestone != null) {
        if (column === "backlog" && current.milestone) {
          milestoneArgs.push("--remove-milestone");
        } else if (column !== "backlog" && current.milestone?.title !== sprintMilestone) {
          milestoneArgs.push("--milestone", sprintMilestone);
        }
      }

      if (removeArgs.length || addArgs.length || milestoneArgs.length) {
        await gh(["issue", "edit", String(number), ...removeArgs, ...addArgs, ...milestoneArgs]);
      }
    }

    res.json({ ok: true, number, column });
  } catch (err) {
    next(err);
  }
});
