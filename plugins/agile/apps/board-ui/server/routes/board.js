import { Router } from "express";
import { ghJson, getOwnerRepo } from "../gh.js";
import { loadPmConfig, activeSprint } from "../config.js";
import { IDENTITY } from "../identity.js";
import { loadTemplates } from "../templates.js";
import { parseTaskDetail } from "./tasks.js";
import { hasLabel, computeColumn, countsTowardWip, issueType, isSubtask, parseParentNumber } from "../columns.js";

export const boardRouter = Router();

const ISSUE_FIELDS = "number,title,labels,assignees,milestone,state,stateReason,body";

// The whole open board is meant to show *everything* currently active, not a
// recent-N sample — 500 is a generous ceiling against a pathological repo,
// not a real-world UX limit.
const OPEN_COLUMN_LIMIT = 500;
// Done in sprint mode is scoped to the current milestone (see fetchDoneColumn
// below), which is inherently bounded, so it gets the same "show everything"
// treatment. Kanban mode has no milestone to scope by, so Done there stays a
// recent-N sample for context rather than an ever-growing full history.
const DONE_SPRINT_LIMIT = 500;
const DONE_RECENT_LIMIT = 10;
// Kanban Done over-fetches so that a retro's just-closed KPT stickies (which
// are filtered out below) can't leave the recent-N sample short.
const DONE_FETCH_LIMIT = 50;

// Withdrawn work is closed, like finished work, and the two are told apart
// only by the close reason. Without this the Done column showed things the
// team decided *not* to do, next to the things it did — and every count
// derived from Done (velocity, the sprint review's demo list) counted them.
function isWithdrawn(issue) {
  return String(issue.stateReason ?? "").toUpperCase() === "NOT_PLANNED";
}

// Retrospective cards (type:kpt) are sticky notes, not work — they carry no
// status label, so without the filter below they would all pile into Backlog,
// and being closed at the end of a retro they would then flood Done. They
// deliberately carry no milestone and no points either, which is what keeps
// them out of sprint-close's demo list and sprint-start's velocity for free.
// See skills/retro/SKILL.md.
function isKpt(issue) {
  return hasLabel(issue, "type:kpt");
}

// One plain-list call for every open issue, columns derived in JS. This used
// to be four queries (one per column), but the grouping below routes every
// issue through computeColumn anyway — the per-column queries only ever
// produced the union this returns, at 4× the gh spawns, with two extra
// defects: an issue carrying two status:* labels came back from two queries
// and rendered as a duplicate card, and Backlog's "no status label" query was
// the board's only `--search` (the Search API is where GitHub's secondary
// rate limits bite first — relevant, because a burst of card moves fires a
// burst of board fetches). Deliberately *not* milestone-filtered: sprint
// scoping happens via computeColumn so that an issue whose status label
// claims todo/doing/review without the sprint's milestone surfaces in
// Backlog as a fixable inconsistency instead of silently vanishing.
async function fetchOpenIssues() {
  const issues = await ghJson([
    "issue", "list", "--state", "open", "--json", ISSUE_FIELDS, "--limit", String(OPEN_COLUMN_LIMIT),
  ]);
  return (issues ?? []).filter((i) => !isKpt(i));
}

function hasStaleStatusLabel(issue) {
  return hasLabel(issue, "status:todo") || hasLabel(issue, "status:in-progress") || hasLabel(issue, "status:in-review");
}

async function fetchDoneColumn(milestone) {
  if (milestone) {
    // KPT stickies never carry a milestone, so this scope excludes them by
    // construction — the filter is belt and braces.
    const issues = await ghJson([
      "issue", "list", "--state", "closed", "--milestone", milestone, "--json", ISSUE_FIELDS, "--limit", String(DONE_SPRINT_LIMIT),
    ]);
    return (issues ?? []).filter((i) => !isKpt(i) && !isWithdrawn(i));
  }
  const issues = await ghJson([
    "issue", "list", "--state", "closed", "--json", ISSUE_FIELDS, "--limit", String(DONE_FETCH_LIMIT),
  ]);
  return (issues ?? []).filter((i) => !isKpt(i) && !isWithdrawn(i)).slice(0, DONE_RECENT_LIMIT);
}

// Doubles as the identity endpoint the launch procedure probes before
// reusing a running server — hence IDENTITY on both branches, including the
// not-initialized one. A server pointed at an uninitialised project is
// exactly as wrong to reuse as one pointed at a different initialised
// project, so the answer has to say who it is even while it has nothing to
// serve.
boardRouter.get("/config", async (_req, res) => {
  const cfg = await loadPmConfig();
  if (!cfg) {
    res.status(404).json({ initialized: false, ...IDENTITY });
    return;
  }
  const ownerRepo = await getOwnerRepo().catch(() => null);
  // Delivered with the config the form already fetches, so opening 作成
  // costs no request of its own — three small markdown files.
  const templates = await loadTemplates();
  res.json({
    ...IDENTITY,
    initialized: true,
    repo: ownerRepo,
    templates,
    mode: cfg.mode,
    wipLimit: cfg.wip_limit ?? {},
    requireSubtasksDone: cfg.experimental?.require_subtasks_done === true,
    sprintMilestone: activeSprint(cfg),
    // The screen has two languages: Japanese when the project chose it,
    // English for everything else. `locale` itself is free-form — the model
    // follows whatever it says — but this UI only ships the two.
    locale: cfg.locale === "ja" ? "ja" : "en",
  });
});

// Assignable users for this repo — a single call (gh api .../assignees),
// not one per story/task, so a real dropdown is cheap enough to be worth
// building instead of a free-text "type the exact login" field.
boardRouter.get("/assignees", async (_req, res, next) => {
  try {
    const ownerRepo = await getOwnerRepo();
    const logins = await ghJson(["api", `repos/${ownerRepo}/assignees`, "--jq", "[.[].login]"]);
    res.json({ logins });
  } catch (err) {
    next(err);
  }
});

boardRouter.get("/board", async (_req, res, next) => {
  try {
    const cfg = await loadPmConfig();
    if (!cfg) {
      res.status(400).json({ error: "not_initialized", message: "Run /agile:init in this project first." });
      return;
    }
    const milestone = activeSprint(cfg);
    const ownerRepo = await getOwnerRepo();

    const [openIssues, done] = await Promise.all([fetchOpenIssues(), fetchDoneColumn(milestone)]);

    // Group every open issue by its *actual* column via computeColumn — an
    // issue whose status label claims todo/doing/review but doesn't carry
    // the current sprint's milestone is treated as Backlog. Dragging it from
    // there into a real column goes through the normal cross-column move
    // path, which assigns the milestone correctly (see issues.js), fixing it
    // for good.
    const grouped = { backlog: [], todo: [], doing: [], review: [] };
    for (const issue of openIssues) {
      grouped[computeColumn(issue, { sprintMilestone: milestone })].push(issue);
    }
    const { backlog, todo, doing, review } = grouped;

    const allIssues = [...backlog, ...todo, ...doing, ...review, ...done];
    // Only nest a sub-task under a parent that's actually present in this
    // response — if a declared parent fell outside every column we fetched
    // (shouldn't normally happen, since backlog+todo+doing+review already
    // covers all open issues and done covers the current sprint), the
    // sub-task stays visible as its own top-level card instead of silently
    // vanishing. Any non-sub-task issue can be a parent: Story, Task and Bug
    // are peers that can all be broken down (Jira's rule).
    const parentCandidates = new Set(allIssues.filter((i) => !isSubtask(i)).map((i) => i.number));

    const childrenByParent = {};
    const childNumbers = new Set();
    for (const issue of allIssues) {
      if (!isSubtask(issue)) continue;
      const parentNumber = parseParentNumber(issue);
      if (parentNumber == null || !parentCandidates.has(parentNumber)) continue;
      (childrenByParent[parentNumber] ??= []).push({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labels: issue.labels ?? [],
        assignees: issue.assignees ?? [],
        column: computeColumn(issue),
        url: `https://github.com/${ownerRepo}/issues/${issue.number}`,
        // Already fetched (ISSUE_FIELDS carries body for parseParentNumber),
        // so passing it through costs nothing — it's what lets the detail
        // panel open on tap without a per-issue API call.
        body: issue.body ?? "",
        // The human half of that body — a sub-task's body also carries its
        // parent link, so this is the part the panel shows and writes.
        // Derived here for the same reason: no fetch per sub-task.
        detail: parseTaskDetail(issue.body),
      });
      childNumbers.add(issue.number);
    }

    // WIP counts work items, never their containers — see countsTowardWip
    // (columns.js) and board SKILL.md.
    const brokenDownParents = new Set(Object.keys(childrenByParent).map(Number));
    const wipLimit = cfg.wip_limit ?? {};
    const wip = {
      doing: {
        count: doing.filter((i) => countsTowardWip(i, brokenDownParents)).length,
        limit: wipLimit.doing ?? null,
      },
      review: {
        count: review.filter((i) => countsTowardWip(i, brokenDownParents)).length,
        limit: wipLimit.review ?? null,
      },
    };
    wip.doing.over = wip.doing.limit != null && wip.doing.count > wip.doing.limit;
    wip.review.over = wip.review.limit != null && wip.review.count > wip.review.limit;

    const buildColumn = (key, issues) => ({
      key,
      items: issues
        .filter((issue) => !childNumbers.has(issue.number))
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          labels: issue.labels ?? [],
          assignees: issue.assignees ?? [],
          milestone: issue.milestone?.title ?? null,
          url: `https://github.com/${ownerRepo}/issues/${issue.number}`,
          // See the sub-task mapping above — already fetched, free to expose.
          body: issue.body ?? "",
          type: issueType(issue),
          subtasks: childrenByParent[issue.number] ?? [],
          // Flags a Backlog card that still carries a status:* label — it
          // isn't a clean backlog item, it's an issue that claims to be
          // Todo/Doing/Review but isn't actually tracking the current
          // sprint (no milestone, or a stale one). Surfaced in the UI so
          // it doesn't look like a silent, unexplained inconsistency.
          staleStatus: key === "backlog" && hasStaleStatusLabel(issue),
        })),
    });

    res.json({
      repo: ownerRepo,
      mode: cfg.mode,
      sprintMilestone: milestone,
      // Sent with the board so the browser can apply the same completion rule
      // the server enforces — a disabled button explains itself, where a
      // round trip that comes back 409 only reports.
      requireSubtasksDone: cfg.experimental?.require_subtasks_done === true,
      wip,
      columns: [
        buildColumn("backlog", backlog),
        buildColumn("todo", todo),
        buildColumn("doing", doing),
        buildColumn("review", review),
        buildColumn("done", done),
      ],
    });
  } catch (err) {
    next(err);
  }
});
