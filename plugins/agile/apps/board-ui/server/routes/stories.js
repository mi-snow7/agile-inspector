import { Router } from "express";
import { gh, ghJson } from "../gh.js";
import { loadPmConfig, activeSprint } from "../config.js";
import { msg, uiLocale } from "../i18n.js";

export const storiesRouter = Router();

const ISSUE_TYPES = ["story", "task", "bug"];

/**
 * Whether this edit has to read the issue first. Labels and assignees are
 * *diffed* — you can only remove what's there — but a title or body is
 * written outright. Asking every time cost a `gh issue view` on the most
 * common inline edit, doubling its API calls for nothing.
 */
export function needsCurrentState({ type, priority, points, assignee }) {
  return type !== undefined || priority !== undefined || points !== undefined || assignee !== undefined;
}

/**
 * `already` (the issue's current label names) is passed on edit, so a label
 * the issue already carries isn't re-sent — on create there is nothing to
 * compare against and it is omitted.
 *
 * `flag` exists because gh names the same thing differently either side:
 * `issue create --label`, `issue edit --add-label`. Sharing one builder
 * across both without it meant every edit that added a label ran
 * `issue edit --label`, which gh rejects outright — so dragging a backlog
 * card into a priority bucket failed whenever the card had no priority yet,
 * which is every card that has just been filed.
 */
export function labelArgs({ priority, points }, already = [], flag = "--label") {
  const args = [];
  if (priority && !already.includes(`prio:${priority}`)) args.push(flag, `prio:${priority}`);
  if (points && !already.includes(`points:${points}`)) args.push(flag, `points:${points}`);
  return args;
}

function issueNumberFromUrl(url) {
  const m = url.trim().match(/\/issues\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

storiesRouter.get("/stories/:number", async (req, res, next) => {
  try {
    const issue = await ghJson([
      "issue",
      "view",
      req.params.number,
      "--json",
      "number,title,body,labels,state,milestone,assignees",
    ]);
    // No decomposition: the edit form shows the body as written, so nothing
    // a person typed on GitHub can be dropped by a save from here.
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

storiesRouter.post("/stories", async (req, res, next) => {
  try {
    const { title, type, priority, points, column, assignee, body: rawBody } = req.body ?? {};
    if (!title) {
      res.status(400).json({ error: "missing_fields", message: msg(uiLocale(await loadPmConfig()), "A title is required.") });
      return;
    }
    // Story / Task / Bug are peers, so creation takes the type the same way
    // Jira's create dialog does — one path, type chosen inside it.
    const issueType = ISSUE_TYPES.includes(type) ? type : "story";
    // Written by whoever filed it, starting from .agile/templates/<type>.md
    // (see templates.js) — the server no longer assembles it from fields.
    const body = rawBody ?? "";
    const args = ["issue", "create", "--title", title, "--label", `type:${issueType}`, "--body-file", "-"];
    if (assignee) args.push("--assignee", assignee);
    if (column === "todo") {
      args.push("--label", "status:todo");
      // Mirror the same rule the drag-move endpoint uses (issues.js): a
      // story entering Todo/Doing/Review in sprint mode must carry the
      // current sprint's milestone, or it becomes invisible on the board —
      // it has a status label (excluded from Backlog's "no status label"
      // query) but no milestone (excluded from Todo's milestone-scoped
      // query), so it matches no column at all.
      const sprint = activeSprint(await loadPmConfig());
      if (sprint) {
        args.push("--milestone", sprint);
      }
    }
    args.push(...labelArgs({ priority, points }));
    const out = await gh(args, { input: body });
    const number = issueNumberFromUrl(out);
    res.status(201).json({ ok: true, number, url: out.trim() });
  } catch (err) {
    next(err);
  }
});

storiesRouter.patch("/stories/:number", async (req, res, next) => {
  try {
    const number = req.params.number;
    const { title, priority, points, assignee, type, body: rawBody } = req.body ?? {};

    const current = needsCurrentState(req.body ?? {})
      ? await ghJson(["issue", "view", number, "--json", "labels,assignees"])
      : { labels: [], assignees: [] };
    const currentLabelNames = (current.labels ?? []).map((l) => l.name);

    // Only when the caller actually sent one. A request that just moves a
    // card between priority buckets says nothing about the body and must
    // leave it exactly as it is.
    const writesBody = rawBody !== undefined;

    const editArgs = ["issue", "edit", number];
    if (title) editArgs.push("--title", title);
    if (writesBody) editArgs.push("--body-file", "-");

    // Changing the type is a label swap — the same operation the board makes
    // when you correct a mis-classified issue.
    if (ISSUE_TYPES.includes(type)) {
      for (const l of currentLabelNames.filter((n) => n.startsWith("type:") && n !== `type:${type}`)) {
        editArgs.push("--remove-label", l);
      }
      if (!currentLabelNames.includes(`type:${type}`)) editArgs.push("--add-label", `type:${type}`);
    }

    // Only clear the label family the caller actually addressed. Clearing
    // both unconditionally meant a partial update — the backlog view's
    // drag-between-prio-buckets sends nothing but `priority` — silently
    // stripped the issue's points estimate along the way.
    //
    // The label being set is excluded from the removals: dropping a card back
    // into the bucket it came from would otherwise ask gh to remove and
    // re-add the same label in one call.
    const touched = (prefix, provided, keep) =>
      provided === undefined ? [] : currentLabelNames.filter((l) => l.startsWith(prefix) && l !== keep);
    for (const l of [
      ...touched("prio:", priority, priority ? `prio:${priority}` : null),
      ...touched("points:", points, points ? `points:${points}` : null),
    ]) {
      editArgs.push("--remove-label", l);
    }
    editArgs.push(...labelArgs({ priority, points }, currentLabelNames, "--add-label"));

    if (assignee !== undefined) {
      for (const a of current.assignees ?? []) editArgs.push("--remove-assignee", a.login);
      if (assignee) editArgs.push("--add-assignee", assignee);
    }

    // Nothing to change. `gh issue edit` with no flags fails ("specify
    // properties to edit"), which surfaced as an error alert when a card was
    // dragged back into the bucket it came from — most visibly the 未設定
    // bucket, where there is no prio label to remove and none to add, so
    // every flag cancelled out. A request that asks for no change should
    // succeed quietly, not fail.
    if (editArgs.length === 3) {
      res.json({ ok: true, number: Number(number) });
      return;
    }

    await gh(editArgs, writesBody ? { input: rawBody } : undefined);

    res.json({ ok: true, number: Number(number) });
  } catch (err) {
    next(err);
  }
});

// Deletion is represented as a close, never `gh issue delete` — see story
// SKILL.md: deletion is irreversible and needs admin rights, close is not.
storiesRouter.delete("/stories/:number", async (req, res, next) => {
  try {
    const number = req.params.number;
    const args = ["issue", "close", number, "--reason", "not planned"];
    if (req.body?.comment) args.push("--comment", req.body.comment);
    await gh(args);
    res.json({ ok: true, number: Number(number) });
  } catch (err) {
    next(err);
  }
});
