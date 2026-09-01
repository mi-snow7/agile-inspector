import { Router } from "express";
import { gh, ghJson, getOwnerRepo } from "../gh.js";
import { loadPmConfig } from "../config.js";
import { isSubtask } from "../columns.js";
import {
  extractSection,
  heading,
  LEGACY_DETAIL_HEADING,
  parentMarker,
  sectionMarker,
  stripParentLines,
} from "../issueBody.js";
import { msg, parentLine, uiLocale } from "../i18n.js";

export const tasksRouter = Router();

const TARGET_LABEL = { todo: "status:todo", doing: "status:in-progress", review: "status:in-review" };

function issueNumberFromUrl(url) {
  const m = url.trim().match(/\/issues\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

async function locale() {
  return uiLocale(await loadPmConfig());
}

/**
 * A sub-task's body is two things at once: the parent link this tool reads
 * back (lose it and the card detaches from its story), and the description a
 * person writes. So the body is always composed here rather than taken
 * verbatim from the client — the marker is re-emitted on every save and the
 * text goes in a 詳細 section under it.
 */
function buildTaskBody(parentNumber, detail, lang) {
  const head = `${parentMarker(parentNumber)}\n${parentLine(lang, parentNumber)}`;
  const text = (detail ?? "").trim();
  if (!text) return head;
  return `${head}\n\n${sectionMarker("detail")}\n${heading(lang, "detail")}\n${text}`;
}

/** The human half of the body: the 詳細 section, or — for a sub-task written
 * before this section existed, or edited straight on GitHub — whatever is
 * left once the parent link is removed. Either way, editing round-trips
 * instead of quietly discarding what was there. */
export function parseTaskDetail(body) {
  const text = body ?? "";
  const section = extractSection(text, "detail", LEGACY_DETAIL_HEADING);
  if (section != null) return section.replace(/^##[^\n]*\n?/, "").trim();
  return stripParentLines(text).trim();
}

// Breakdown only happens for parents already pulled into the current sprint
// (has a milestone) when running in sprint mode — see README: sub-tasks for
// a story "maybe two months out" would be wasted work. Kanban mode has no
// milestones, so breakdown is always allowed there.
tasksRouter.post("/stories/:number/tasks", async (req, res, next) => {
  try {
    const parentNumber = req.params.number;
    const { title, column, assignee, detail } = req.body ?? {};
    if (!title) {
      res.status(400).json({ error: "missing_fields", message: msg(await locale(), "A title is required.") });
      return;
    }

    const cfg = await loadPmConfig();
    if (!cfg) {
      res.status(400).json({ error: "not_initialized" });
      return;
    }

    const parent = await ghJson(["issue", "view", parentNumber, "--json", "labels,milestone"]);
    // Story, Task and Bug can all be broken down (Jira's rule); only a
    // sub-task can't, since the hierarchy is two levels deep by design.
    if (isSubtask(parent)) {
      res.status(400).json({ error: "parent_is_subtask", message: msg(await locale(), "A sub-task cannot be broken down further.") });
      return;
    }
    if (cfg.mode === "sprint" && !parent.milestone) {
      res.status(400).json({
        error: "no_milestone",
        message: msg(
          await locale(),
          "This item is not in the sprint yet. Put it in one with /agile:sprint-start before breaking it down.",
        ),
      });
      return;
    }

    // The marker is what the board reads back (issueBody.js); the line under
    // it is for whoever opens the issue on GitHub.
    const body = buildTaskBody(parentNumber, detail, await locale());
    const createArgs = ["issue", "create", "--title", title, "--label", "type:subtask", "--body-file", "-"];
    if (column && TARGET_LABEL[column]) createArgs.push("--label", TARGET_LABEL[column]);
    if (parent.milestone?.title) createArgs.push("--milestone", parent.milestone.title);
    if (assignee) createArgs.push("--assignee", assignee);

    const out = await gh(createArgs, { input: body });
    const taskNumber = issueNumberFromUrl(out);

    const ownerRepo = await getOwnerRepo();
    // The sub_issues REST endpoint wants the numeric database id, not the
    // GraphQL node id `gh issue view --json id` returns (a string like
    // "I_kwDO..." — the REST API rejects that with a 422). Fetch it from the
    // plain REST issue representation instead.
    const { id } = await ghJson(["api", `repos/${ownerRepo}/issues/${taskNumber}`, "--jq", "{id}"]);
    await gh(["api", "-X", "POST", `repos/${ownerRepo}/issues/${parentNumber}/sub_issues`, "-F", `sub_issue_id=${id}`]);

    res.status(201).json({ ok: true, number: taskNumber, url: out.trim() });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/stories/:parentNumber/tasks/:number", async (req, res, next) => {
  try {
    const task = await ghJson(["issue", "view", req.params.number, "--json", "number,title,assignees,body"]);
    res.json({ ...task, detail: parseTaskDetail(task.body) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/stories/:parentNumber/tasks/:number", async (req, res, next) => {
  try {
    const number = req.params.number;
    const { title, assignee, detail } = req.body ?? {};
    if (!title) {
      res.status(400).json({ error: "missing_fields", message: msg(await locale(), "A title is required.") });
      return;
    }

    // Only when reassigning: the current assignees exist to be removed, and
    // a title-or-description edit has nothing to remove. See
    // needsCurrentState in stories.js — same reasoning, smaller surface.
    const current = assignee !== undefined ? await ghJson(["issue", "view", number, "--json", "assignees"]) : { assignees: [] };
    const editArgs = ["issue", "edit", number, "--title", title];
    for (const a of current.assignees ?? []) editArgs.push("--remove-assignee", a.login);
    if (assignee) editArgs.push("--add-assignee", assignee);

    // Only when the client sent the field — a caller that doesn't know about
    // descriptions must not be able to erase one, and rewriting the body is
    // what re-emits the parent marker.
    let input;
    if (detail !== undefined) {
      editArgs.push("--body-file", "-");
      input = buildTaskBody(req.params.parentNumber, detail, await locale());
    }

    await gh(editArgs, input === undefined ? undefined : { input });
    res.json({ ok: true, number: Number(number) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/stories/:parentNumber/tasks/:number", async (req, res, next) => {
  try {
    const args = ["issue", "close", req.params.number, "--reason", "not planned"];
    await gh(args);
    res.json({ ok: true, number: Number(req.params.number) });
  } catch (err) {
    next(err);
  }
});
