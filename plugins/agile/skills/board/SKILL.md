---
description: Open the agile board for the current mode (sprint board in sprint mode, kanban board in kanban mode) on screen and summarise it in text as well. Inspects WIP limits, To Do replenishment and stalled work, and moves items between columns where the backend allows it. Adding, editing and deleting items belongs to /agile:issue.
---

# /agile:board — open the agile board

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

**Called with no arguments by default.** Open the board for the current mode on
screen, and summarise it in text as well.

| `mode` in `.agile/config.yml` | Board |
|---|---|
| `sprint` | **Sprint board** — scoped to the current sprint. The surface for finishing what was promised inside the period |
| `kanban` | **Kanban board** — no boundary. The surface for keeping the flow moving |

**Do not let the mode be passed as an argument.** "Agile board" is the umbrella;
the sprint board and the kanban board sit under it, and one team never runs both
at once (one cuts the work into periods, the other refuses to — opposite rules,
and mixing them confuses the floor). Which one to look at is already settled by
the operating mode, so there is nothing here to choose.

**This command owns display and column movement only.**

| Command | Subject | Owns |
|---|---|---|
| **`/agile:board`** | **The board** | **Moving items between columns** |
| `/agile:backlog` | The backlog (not yet in a sprint) | Changing priority |

The rules for adding, editing and deleting items live in `/agile:issue`; taking
stock of the whole backlog is `/agile:refine`. When someone asks for a new item
here, do not make them retype it somewhere else — delegate to `/agile:issue` and
carry it out on the spot (below).

## Mechanics

Everything that touches the backend — queries, column representation, movement —
lives in `docs/backends/`. **Read only the file named by `backend:` in
`.agile/config.yml`.** This skill states what to ask, what to check and what to
say; it never names a label, a command or an identifier format.

## Preconditions

- If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
- **If the backend's command-line tool is missing, or present but not
  authenticated, those are different problems** — follow "Setup" in
  `docs/backends/…` and stop. Telling someone to authenticate a tool they have
  not installed sends them looking in the wrong place.
- Read from `.agile/config.yml`: `mode` (which board), the WIP limits for the
  in-progress and review columns, the To Do minimum (default 2), and
  `stale_days` (default 7).
- **An older config that lacks these must not error** — fall back to defaults.
- Read `capabilities` too. `status_write: false` changes what this command does
  with a request to move something (below); it changes nothing about inspection.

## Display and inspection

**Produce both the screen and the text.** `/agile:backlog` opens the backlog
screen, and this is its counterpart — a board exists to be dragged, so returning
text alone and waiting to be asked to open it is the wrong way round.

1. **Open the screen** (`docs/backends/…`, board view; add a swimlane only when
   there is a reason to, below).
2. **Summarise in text as well**, so the situation is legible without looking at
   the screen — mid-task, or to paste into chat.

Fetch every column, plus a few recently finished items. **Retrieve whatever the
backend offers as the stall clock in the same pass** — time in the column where
that exists, the last-touched time where it does not (`docs/backends/` says
which). Stall detection needs it and a second round trip is waste.

> **Withdrawn items are not completed items.** Anything closed as "not planned"
> was decided against, and must stay out of the finished list, the counts and
> velocity alike.

> **Retro stickies are not work.** Exclude them from every query on this board.

### Display rules

- **Name which board this is** at the top — "Sprint board (Sprint 6, 3 days
  left)", "Kanban board".
- **Column order runs from the first column to the last.** In sprint mode, show
  the backlog too, even though the board screen hides it (the screen has a
  separate backlog view; chat has no view switcher, so hiding it here leaves
  "what do we pull next" visible from nowhere).
- Each row: identifier, title, priority, assignee — in whatever notation the
  backend uses. Put high priority at the top of each column.
- **Nest children under their parents** (below).
- **Warn about a finished parent with unfinished children**: mark it and say
  which children are still open. When someone closes a parent directly in the
  backend this tool cannot prevent it, so the job is **to notice, not to block**.
- **Catch a parent left behind**: if children are moving but the parent has not
  started yet, offer to move it (below).
- **WIP check**: compare the in-progress and review columns against their limits
  and warn when exceeded — "In Progress holds 4 against a limit of 3; consider
  moving one to review or back". Count **units of work**: sub-tasks, and any
  Task or Bug that was never broken down. A Story, and any parent that has
  children, is **a container and is not counted** — counting a parent and its
  children both would double-count the same work.
  > If the backend runs its own column limits and they are configured, **say
  > nothing** — it is already warning, and a second voice is noise.
- **Replenishment signal**: when the To Do column falls below its minimum, prompt
  for a refill (below).
- **Stall detection**: flag work sitting too long in the in-progress and review
  columns (below).
- **(sprint mode)** Scope every query to the current sprint.
- **(sprint mode) Closing-days mode**: if the sprint ends within two days,
  suggest "rather than starting something new, shall we carry what is in
  progress and in review through to done?" Name the items still in progress and
  the ones stuck in review.

## Swimlanes

A swimlane groups the cards into horizontal rows. **Which lanes make sense is
decided by the mode.**

| Mode | Lanes |
|---|---|
| sprint | **none** (plain board) / **by parent** / **by assignee** |
| kanban | **none** (plain board) / **expedite** (class of service) |

**The cards that move through columns are units of work** — sub-tasks, and
Story/Task/Bug that were never broken down. A parent that has children is a
container, so in the by-parent lane it becomes the row heading.

### The two sprint lanes

| Lane | When |
|---|---|
| **By assignee** | **The daily standup.** Who is holding what, whether anyone is stuck, whether the load has skewed — checked one person at a time |
| **By parent** | **Ordinary development during the day.** "To ship this story, which sub-tasks are left?", seen per feature |

Suggesting "follow by parent normally, switch to by assignee for the standup" is
fine.

### The one kanban lane

| Lane | When |
|---|---|
| **Expedite** (expedite / standard / background) | Keeps incidents and critical bugs from being buried in the ordinary column. High priority rides the top lane, low priority the bottom; a sub-task without its own priority inherits its parent's |

**Kanban gets no assignee lane.** Kanban is pull-based — whoever is free takes
the next item — so there is no prior assignment to group by. Slicing it by person
hides the very thing kanban exists to show: which column the work is piling up
in.

### Choosing a lane

The caller states the lane; omitting it leaves whatever was selected last time.
**Do not specify one without a reason.** The URL spelling is in
`docs/backends/`.

### How to recommend them

**Do not push lanes early.** Start from the default plain board and introduce a
lane when the matching complaint appears — "it is hard to tell whose progress is
whose in the standup", "urgent bugs get buried". More lanes make the board taller
and the whole harder to see.

## Replenishment

Kanban has **no sprint boundary, and therefore no moment that decides what comes
next**. Flow is kept instead by pulling from the backlog as the To Do column
drains. Nobody will point this out, and the column runs dry and the work stops —
so **check the remaining count every time the board is shown**.

When To Do is below its minimum, close the display with:

```
🔻 To Do is down to 1 item (minimum 2). Shall we replenish from /agile:backlog?
```

- **Never replenish unasked.** What to pull involves priority and business
  judgement. Prompt only.
- If accepted, run the `/agile:backlog` display and move items from there into
  To Do (in sprint mode this also puts them into the sprint — same rule as
  movement, below).
- **Count units of work**, the same way WIP is counted.
- **Ask whether what is being pulled is small enough.** Kanban has no planning
  session, so this is the only moment anything is looked at before it starts
  moving — and a Story pulled whole sits in one column for a fortnight and
  makes every flow number meaningless. Where an item is clearly more than a few
  days, offer to break it into sub-tasks (`/agile:issue`) before it enters To Do.
  **Offer, do not insist**: some work genuinely is one piece, and this is not a
  refinement session.

In sprint mode the same prompt is fine when the count drops, but adding to To Do
mid-sprint is scope, so add: "into this sprint, or the next one?"

## Stall detection

The most important number in kanban is **how long work takes to flow through**.

**Measure how long the item has been where it is** — not how long since anything
happened to it. `docs/backends/` says which timestamp gives that. Where the
backend offers only "last touched", say so when reporting, and read the next
paragraph as a standing hazard rather than a possibility.

> **A clock that any edit resets erases the stall the moment it is written
> down.** Recording a blocker is a change to the item, so on a last-touched
> clock the daily's own record is what stops the warning firing — and the more
> conscientiously a team notes its obstacles, the more completely they vanish.
> Nothing errors and nothing is missing from the screen; the warning simply goes
> quiet. **So a blocker is never left to the clock to remember.** It is carried
> in the daily's own record, raised again next time by name, and stays raised
> until somebody says it is gone.

List anything in the in-progress or review columns that has sat there for
`stale_days` or more.

```
⚠️  Stalled: these have sat in progress or review for a while
  ABC-12  Implement the history API      In Progress   9 days   @taro
  ABC-15  Review the list screen         In Review    12 days
```

- **Do not assert the cause.** Ask — "is this waiting on review?", "would
  splitting it help?" It may simply be work in progress that nobody touched.

**An item in a working column with nobody on it is worth one question.** Not an
error — somebody may have moved it ahead of picking it up — but nothing that is
actually being worked on should be ownerless, and the daily reads owners to know
who to ask. Say who it is and ask whose it is; **never guess from who moved it**.
- If review keeps stalling, that **is** the bottleneck, and it is material for
  the next `/agile:retro`. Saying so is fine.
- **Say nothing when there is nothing.** "No stalled items" every single time is
  noise.

## Item types, parents and children

Two levels, as in Jira:

| Type | Role |
|---|---|
| Story | A requirement that delivers value to a user |
| Task | Technical or operational work — setup, refactoring, investigation |
| Bug | A defect that needs fixing |
| Sub-task | The smallest unit, broken out of one of the above |

**Story, Task and Bug are peers**: they sit in the backlog and enter a sprint.
The units moved day to day are **sub-tasks, and any Task or Bug not broken down**.
Nest sub-tasks under their parent.

```
In Progress
  ABC-12  View my purchase history [high]        ← parent (Story)
    └ ABC-15  Implement the history API   @taro  ← sub-task
    └ ABC-16  Build the list screen       @hanako
  ABC-20  Upgrade to Node 22 [Task]              ← never broken down; a unit itself
```

**When every child of a parent is finished**, *suggest* moving the parent forward
to review — "all sub-tasks of ABC-12 are done; if the acceptance criteria hold it
could move to review." **Never move it automatically**: children finishing is not
the parent finishing, and the acceptance criteria and DoD still have to be
checked.

**Watch the reverse too.** If any child is in progress or in review while the
parent is still in a not-started column, offer to move the parent. People drag
the sub-task cards, so the parent gets left behind, and both the by-parent lane
headings and the board columns drift away from reality. **Suggest only, here as
well.**

> "Not started" is a role, not a column name — the backends do not agree on how
> many columns come before work begins. Resolve it through `docs/backends/`, and
> never assume the second column is To Do.

## Moving items between columns

The default is display with no arguments, but **"move ABC-12 to in progress" said
while looking at the board is a natural thing to say**, so accept it in text too.
**A single item named explicitly needs no screen** — finish it in text.

> **When `capabilities.status_write` is `false`, this section does not run.**
> The backend's own UI owns column movement. Follow the wording rules in
> `docs/backends/README.md`: do not apologise, claim only what was actually done,
> point at where to do it, and say it once. Everything else on this page —
> inspection, WIP, replenishment, stalls — continues unchanged.

Before moving:

- **If the destination is at its WIP limit, warn and confirm before acting.**
- **If the config asks for it, check the children before finishing a parent.**
  When unfinished children remain, do not finish it — list them and ask whether
  to finish or withdraw those first. When the config does not ask, do not block —
  but the finished-parent warning above still fires.
- **(sprint mode) Moving in and out of the board is moving in and out of the
  sprint.** Backlog items carry no sprint; moving out of the backlog joins the
  current sprint, moving back to the backlog leaves it, and movement between the
  other columns leaves the sprint alone.
- **(sprint mode) Starting something new in the last two days** earns one
  remark — "N days left; shall we finish what is in progress first?" Do not
  forbid it.
- **Moving to review or done** should glance at `.agile/definition_of_done.md` if
  it exists — "has the review and testing in the DoD been done?" If there is no
  DoD file, do not ask. One remark, never enforcement.

## When asked to create or edit

Being asked "file that too" while looking at the board is a natural thing to
say, so **delegate to the `/agile:issue` procedure and carry it out here**. Do
not push back with "please use `/agile:issue`" and make them retype it — Create
is reachable from every screen in Jira too; the entry point being implemented
once does not mean the user gets moved between screens.

- Create, edit, delete → follow `skills/issue/SKILL.md` and report the type it
  was judged to be
- Reworking priorities or estimates in bulk → point at `/agile:refine`, which is
  a ceremony for comparing many items at once and deserves the screen and some
  time

**Do not add filing rules to this skill.** Type judgement and body formatting
live in `skills/issue/SKILL.md` alone; this page only refers to them. Two copies
always drift.

## Stance

WIP overruns and stalls are **advice, never enforcement**. After any change,
summarise in a line or two what moved and where, with a link when it helps.
