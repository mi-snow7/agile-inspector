import { parseParentNumber as parseParentFromBody } from "./issueBody.js";

export function hasLabel(issue, name) {
  return (issue.labels ?? []).some((l) => l.name === name);
}

/** Jira's taxonomy, which this tool follows: Story / Task / Bug are peers
 * that sit in the backlog and enter a sprint; Sub-task is the child level
 * under any one of them. Returns null for an issue carrying no type label
 * (still a valid work item — it just hasn't been classified). */
export function issueType(issue) {
  if (hasLabel(issue, "type:story")) return "story";
  if (hasLabel(issue, "type:bug")) return "bug";
  if (hasLabel(issue, "type:task")) return "task";
  if (hasLabel(issue, "type:subtask")) return "subtask";
  return null;
}

export function isSubtask(issue) {
  return hasLabel(issue, "type:subtask");
}

// Every sub-task this tool creates carries a parent marker in its body (see
// issueBody.js / tasks.js). Reading it out of data we already fetched gives
// correct parent/child nesting with zero extra API calls, instead of firing a
// sub_issues lookup per parent — the GitHub-native sub-issue link is created
// too, this is just the cheap way to read it back.
export function parseParentNumber(issue) {
  return parseParentFromBody(issue.body);
}

/** Work items counted against a WIP limit: sub-tasks, and any Task/Bug/
 * untyped issue that hasn't been broken down. Stories never count (they're
 * containers by definition), and neither does a Task/Bug that has sub-tasks
 * of its own — counting both a parent and its children would double-count
 * the same work. */
export function countsTowardWip(issue, parentNumbers) {
  if (hasLabel(issue, "type:story")) return false;
  return !parentNumbers.has(issue.number);
}

/**
 * Which board column an issue belongs in.
 *
 * @param {object} issue
 * @param {{ sprintMilestone?: string | null }} [context] When given a
 *   sprintMilestone (sprint mode with an active sprint), a status:todo/
 *   doing/review label only counts if the issue's own milestone matches —
 *   otherwise the issue is treated as Backlog regardless of its status
 *   label. This is the single source of truth for that rule; board.js's
 *   column grouping and issues.js's move no-op guard both call this instead
 *   of each maintaining their own "is this an orphan" logic (see the bug
 *   that caused: a drag from a Backlog-displayed orphan into Todo being
 *   treated as a same-column no-op because the label-only check still said
 *   "todo"). Omit context (or pass none) to get the pure label/state
 *   reading — used for a nested task's own column badge, where "this task's
 *   milestone doesn't match" isn't a meaningful distinction to surface.
 */
export function computeColumn(issue, context = {}) {
  if (String(issue.state).toUpperCase() === "CLOSED") return "done";
  const { sprintMilestone } = context;
  if (sprintMilestone != null) {
    const issueMilestone = issue.milestone?.title ?? null;
    if (issueMilestone !== sprintMilestone) return "backlog";
  }
  if (hasLabel(issue, "status:in-progress")) return "doing";
  if (hasLabel(issue, "status:in-review")) return "review";
  if (hasLabel(issue, "status:todo")) return "todo";
  return "backlog";
}
