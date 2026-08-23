---
description: Add, edit or remove a single item (Story / Task / Bug). Judges the type from the request, shapes a Story into persona form with acceptance criteria, and a Bug into reproduction steps. Reworking the whole backlog belongs to /agile:refine.
---

# /agile:issue — add, edit and remove a single item

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

**All item CRUD comes through here.** Story, Task or Bug, there is one entry
point — "file a bug", "add a task to bump the library", "I want to be able to
…" all arrive here and get their type judged.

The subject is **a single item**. Taking stock of the whole backlog — reordering,
splitting, estimating — is `/agile:refine`; moving items between columns and
showing the board is `/agile:board`.

## Judging the type

Infer it from the request. **Never stall on it** — file with the judgement
stated, and say it can be corrected (changing type is one field).

| Type | Test | Body shape |
|---|---|---|
| Story | A requirement that **delivers value to an end user**. "I want to be able to…", "I need to see…" | Persona form plus acceptance criteria (strict) |
| Bug | **Existing expected behaviour is broken.** "…doesn't work", "…throws an error", "it crashes" | Reproduction / expected / actual |
| Task | Neither of the above — **technical or operational work**. Setup, refactoring, dependency bumps, investigation | No enforced shape; a clear title and summary |

How to word an uncertain judgement:

> Filed as a Task. If it's user-facing, it can become a Story.

**Sub-tasks are not created here.** They are produced by `/agile:sprint-start`,
which breaks down items already chosen for that sprint, and they do not exist in
the backlog — breaking down something that may still be two months away is
wasted work.

## Mechanics

Creating, editing, changing type and removing all live in `docs/backends/`.
**Read only the file named by `backend:`.** Read `capabilities` too — it decides
what "remove" can mean (below).

## Preconditions

If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
**If the backend's command-line tool is missing, or present but not
authenticated, those are different problems** — follow "Setup" in
`docs/backends/…` and stop. Telling someone to authenticate a tool they have not
installed sends them looking in the wrong place.

If the backend needs its classifications set up in advance and some are missing,
create the missing ones (`docs/backends/…`; `/agile:init` holds the canonical
list). Where a backend supplies its own, use those and create nothing.

## Acceptance criteria are not the Definition of Done

Easily conflated, so keep them apart.

- **Acceptance criteria** — this command's business. **Specific to one item**:
  what has to be true for it to be accepted, in business and functional terms
  ("an error appears when the password is wrong"). Written in the item body.
- **Definition of Done** — `/agile:init`'s business. **Common to every item**:
  the quality and technical bar ("tests pass", "reviewed"). Exactly one exists,
  at `.agile/definition_of_done.md`. Not handled or written here.

## Body format

**Read `.agile/templates/<type>.md` and write from it.** There are three —
`story.md`, `task.md`, `bug.md` — created by `/agile:init`. They are **files the
team edits**, so their contents differ per project: never carry a hard-coded
boilerplate, always read first.

The board's create dialog reads the same files, so **an item filed from chat and
one filed from the screen come out the same shape**. If the files are missing
(initialised before templates existed), plain markdown with headings is fine —
no special markers or required structure.

Fill the placeholders from what was said. **Leave what you could not fill
empty** — it can be edited later. Unused headings can be deleted.

## Operations

### Add

1. **Judge the type** from the request.
2. Ask for what is missing, according to type.
   - Story: persona, capability, value. Do not re-ask for what is already in the
     request. If "why do you want it" is absent, ask once. Empty acceptance
     criteria are fine to proceed with.
   - Bug: ask once for reproduction steps. Filing with them blank is fine —
     **recording the bug comes first**, detail can follow.
   - Task: normally ask nothing further.
3. Sanity-check the size. If it plainly will not fit in a sprint, suggest
   splitting — never insist.
4. Create it.

- **With no column given, it goes to the backlog** — no status, no sprint.
- Apply a priority if one was given.
- Only when the request clearly means "start this now" should it go straight
  into the board's first working column, and in sprint mode into the current
  sprint at the same time. **Putting it on the board without putting it in the
  sprint makes it appear in no column at all.**
- Afterwards, state **the type you judged** along with the item's identifier and
  link.

> When `capabilities.status_write` is `false`, creation still works — new items
> land in whatever state the backend starts them in. Do not try to place them in
> a column; say where they landed and leave any move to the team.

### Edit

Read the current body first, **show it, confirm what changes**, then write.
The whole body is replaced, so existing content — an acceptance-criteria
checklist especially — is easy to destroy by accident.

Changing type happens here too.

### Remove

**Prefer withdrawal to destruction.** A withdrawn item keeps its history and its
discussion, and it stays visible as a decision the team made; a deleted one
answers no questions later.

- Where withdrawing is available, withdraw with a reason and do not delete.
- **Where this tool cannot change state** (`status_write: false`), it cannot
  withdraw either — that is a move in the team's own tool. Say so, and offer to
  record the reason as a comment so the decision is not lost.
- Delete only when the user explicitly insists on the item being gone, after
  explaining that it is irreversible, and **only after confirming**. Some
  backends also require elevated permission.

## Do not open the board

The subject and the content are both explicit, so **do not open the board** —
finish in text. If the request turns out to span several items, point at
`/agile:refine`.

When the built-in board is open, the header's **Create** does the same thing —
a dialog with a type selector, reachable from any screen, as Create is in Jira.
Chat and screen act on the same items, so it makes no difference which is used.

## When another skill calls this

`/agile:board` and `/agile:refine` **delegate here** when someone says "file that
too" mid-flow. Use exactly the judgement and the body format on this page —
**the filing rules exist in this file and nowhere else.**

## Stance

- **Infer the type, file it, and state the result.** Never stall on a question
  just to classify.
- Only when a Story's persona or value is genuinely unclear, ask once before
  filing. Do not guess and commit.
- Empty acceptance criteria are fine — say they can be added later by editing.
- After creating, editing or withdrawing, summarise in a line or two what was
  done and to which item.
- **Backlog-wide stock-taking is not this command's job.** "Tidy up", "reorder",
  "refinement" → point at `/agile:refine`.
