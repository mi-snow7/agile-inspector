---
description: The backlog refinement ceremony. Takes its time over the backlog — splitting items, clarifying acceptance criteria and estimating story points — until the top of it is ready to be started. Run it on a regular cadence, weekly or so, in either mode. To just look at the backlog or change one priority, use /agile:backlog.
---

# /agile:refine — refine the backlog

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

The **regular** working session (weekly or so) that gets the next items into a
state where development can start on them.

**Both modes use it.** In sprint mode it makes the next planning session go
smoothly; in kanban mode it means **replenishment is never a scramble** — the top
of the backlog is already startable when To Do drains.

**This is a ceremony, not a screen.** To simply look at the backlog or change a
single priority, `/agile:backlog` is enough. This one is for sitting down and
taking stock — estimating, splitting and clarifying acceptance criteria
included.

Creating and editing a single item is `/agile:issue`.

## Scope

**Story, Task and Bug that are still in the backlog.** All three are peers on the
same priority ladder, and this is where the balance gets examined — whether
features are piling up while debt and bugs slide.

**Sub-tasks are out of scope.** They do not exist in the product backlog; they
are produced by `/agile:sprint-start` from items already chosen for that sprint.
Breaking down something that may never be started is wasted work.

## Mechanics

Queries and edits live in `docs/backends/`. **Read only the file named by
`backend:`.**

## Preconditions

If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
**If the backend's command-line tool is missing, or present but not
authenticated, those are different problems** — follow "Setup" in
`docs/backends/…` and stop. Telling someone to authenticate a tool they have not
installed sends them looking in the wrong place.

## Procedure

**Open by running the `/agile:backlog` display**: the bucketed list, and the
backlog screen. How the list is produced, how priority is shown and how the
screen is opened all live in `skills/backlog/SKILL.md` — **do not copy any of it
here**, two copies always drift. This ceremony also reads the bodies, so fetch
those as well.

Work in text one item at a time, while the screen stays available for editing
priority, estimates and acceptance criteria, and for withdrawing what is no
longer wanted.

For each item, show its current priority and estimate, and whether it has
acceptance criteria at all. Then do the four things below in order. **There is no
need to finish all four in one sitting** — stopping partway is fine.

### a) Reorder

Adjust priorities to match how the business has moved.

> **When `capabilities.field_write` is `false`**, the team reorders in their own
> tool. Run the ceremony exactly as written — go item by item, say what should
> change and why — then wait, re-read, and confirm what they did. **Agreeing the
> order is the ceremony; applying it was only ever the easy part.**

### b) Add and remove

File new requests, and withdraw what is no longer needed — the same way
`/agile:issue` does it, carried out here without leaving the session. Follow that
skill's rule on withdrawal versus deletion, including what to do when this tool
cannot change state.

### c) Break down what is too big

Among the high-priority items likely to be started soon, find any that plainly
will not fit in one sprint and propose splitting them. When splitting, create the
smaller items and withdraw the original with a comment saying it was split.

**The type does not change when splitting** — a large Story becomes several
smaller Stories. **Never create sub-tasks here.**

### d) Clarify and estimate

For those same top items:

- If the acceptance criteria are empty or thin, talk them through and add them to
  the body.
- If there is no estimate, agree one with the team on a Fibonacci-ish scale
  (1/2/3/5/8). Say plainly that the aim is not precision — only a sense of
  **whether this is bigger or smaller than the others**.

> If the backend cannot record estimates (`capabilities.points: false`), do (d)
> as a conversation and skip the recording. **Do not invent somewhere to store
> it** — an estimate hidden in a body nobody reads is worse than none, because
> velocity will silently be wrong. Where it *can* store them but this tool
> cannot write them (`field_write: false`), agree the number and have the team
> enter it, then re-read to confirm.

Low-priority items, and anything unlikely to be started for a while, do not need
(c) or (d). Refining only as far ahead as you are about to work is the whole
idea.

## Closing report

- Bullet what was reprioritised, added or removed, split, and estimated
- Name anything still near the top with no acceptance criteria or no estimate, as
  **candidates for the next refinement**

## Stance

- **Confirm one item at a time.** Never apply a bulk change without showing it
  first.
- Estimates and splitting decisions need the team's agreement. **Never decide
  them alone.**
- Do not try to perfect every item. Work down from the top, as far as the time
  allows.
