---
description: "[sprint mode only] Close the current sprint. Runs the sprint review (demo, feedback, feeding it back into the backlog), delegates the retrospective to /agile:retro, and returns unfinished items to the backlog. Does not start the next sprint — that is /agile:sprint-start."
---

# /agile:sprint-close — close a sprint

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

Runs the two ceremonies of the last day: **the sprint review** (assessing the
outcome — demo and feedback) and **the retrospective** (delegated to
`/agile:retro`). Closing the sprint itself is done for the team.

**This does not start the next sprint.** Once the review and the retrospective
are over, the sprint is finished; planning the next one (`/agile:sprint-start`)
is a separate act at a separate time, in practice often the next working day.
**Do not merge closing and starting into one command** — doing so destroys the
order that makes the demo and the retrospective feed into the plan.

## Mechanics

Every query, the sprint close itself, and how carry-over is marked live in
`docs/backends/`. **Read only the file named by `backend:`.**

## Preconditions

- If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
- **If the backend's command-line tool is missing, or present but not
  authenticated, those are different problems** — follow "Setup" in
  `docs/backends/…` and stop. Telling someone to authenticate a tool they have
  not installed sends them looking in the wrong place.
- If the mode is not `sprint`, or no sprint is active, say "there's no active
  sprint — start one with `/agile:sprint-start`" and stop.

## Procedure

### 1. Gather the state of the sprint

- **Finished Story / Task / Bug** — the demo list. Sub-tasks are part of their
  parent and are not listed on their own
- Everything else finished in the sprint — material for the retrospective
- **Unfinished items** — the carry-over
- Pull requests merged against this sprint — more retrospective material

> **Withdrawn items are not completed items.** Keep them out of the demo list,
> the completed count and the points total alike.

### 2. Sprint review

Present the finished items as **a demo list** — identifier, title, link. The
actual demo is the team's to give; here, format the list and keep the record.

**Unfinished items are not demoed.** They do not meet the Definition of Done.
Report **the fact of their progress** instead — "the feature is implemented,
testing hasn't started" — asking the team for a line on each. **Do not mark
anything finished here.** Calling something done while its quality is unproven
is what produces the rework and the bugs later.

Ask: "was there any feedback from stakeholders?" If so:

- Summarise it
- Feed it into the backlog — a new item, or an addition to an existing one,
  following `/agile:issue`. **Confirm the content before creating anything.**

If there was none, move on.

### 3. Retrospective

**Run `skills/retro/SKILL.md` as written.** How KPT is collected, how the DoD is
revisited and how a Try becomes an item all live there, in one place — the
retrospective is run in kanban mode too, so it must not be buried inside the
sprint close.

When called from here:

- **Do not ask about roles.** Whoever ran this command is the facilitator (skip
  that step in `retro`).
- The period is **this sprint**. Hand over what step 1 already gathered —
  finished, unfinished, merged PRs — and **do not re-fetch it**.
- If estimates exist, produce **the points completed this sprint**; the next
  `/agile:sprint-start` uses it as the capacity guide.
- **Do not ask when the next retrospective is.** It comes with the next sprint
  close.

**How the participants join depends on `retro.board`**, and `retro` owns that.
When it uses the built-in board, **tell the participants how to open it**, and
**wait until everyone actually has it open** before starting Keep — the first
run may install dependencies. Starting without waiting silently drops the
opinions of whoever could not write yet.

### 4. Announce the remaining writes, then return the carry-over

Everything from here writes, so **list what is about to happen before doing
any of it**. The item most often left off is **putting the retrospective cards
away** (inside step 3) — routine, but omitting it from the list turns into "six
things were closed and nobody said so". The list covers:

- Where the minutes go (`.agile/retro/<date>.md`)
- **Putting the Keep / Problem cards away**, named individually
- Returning the carry-over, and how it will be marked
- Closing the sprint
- Clearing the active sprint from `config.yml`

**Never move unfinished work straight into the next sprint.** It goes back to the
backlog, and whether it returns is decided at the next `/agile:sprint-start`,
after the product owner has re-evaluated its priority. **This command does not
decide what comes next.**

On each unfinished item, leave the progress from step 2 as a comment — how far it
got, what remains — then mark it as carried over and remove it from the sprint.
**Leave its column alone**: it was genuinely in progress, and erasing that is a
loss of information.

> **Returning work item by item is not available on every backend.** Where a
> child's sprint follows its parent, an unfinished child cannot be returned
> alone — only the parent moves, and it takes its finished siblings with it.
> Check `docs/backends/`, **say which choices exist, and let the team pick**.
> Never quietly move a parent to carry one child.
>
> **Where this tool cannot write fields** (`field_write: false`), the comment and
> the carry-over marker still work — those are not among the fields it is barred
> from. **Taking the item out of the sprint is.** Check `docs/backends/` first:
> on some backends **closing the sprint moves unfinished work out by itself**, in
> which case there is nothing to do and nothing to ask for. Where it does not,
> say what has to be moved and leave it to the team — and **never let that turn
> into the carry-over silently riding into the next sprint**, which is the one
> thing this step exists to prevent.

**Settle it before the sprint is closed, not after.** Where the team has to make
the move themselves, closing first can put the work somewhere none of their
screens show it — a closed period is off the board, and an item that only
appears through its parent is off the backlog too. Nothing errors; the work is
simply not anywhere they look. So when `docs/backends/` says a carry-over needs
a human hand, **name the items, say what has to happen to them, and get an
answer while the sprint is still open.** Closing over an unanswered carry-over is
the failure this step exists to prevent, in its quietest form.

If the team would rather close now and sort it afterwards, that is their call —
**say that finding the items again will mean going by identifier**, then close.

### 5. Close the sprint

### 6. Update config.yml

Clear the active sprint, leaving the project with none.

### 7. Closing report

- Review: what was demoed, and any feedback with where it went
- Retrospective: Keep / Problem / Try, points completed if available, whether
  the DoD changed
- Carry-over: the items returned to the backlog
- What next: "run `/agile:sprint-start` when you're ready to begin the next
  sprint" — **say plainly that this command does not start it**

## Stance

- Feeding feedback into the backlog, and handling the carry-over, are **shown
  before they are done**. Never bulk-apply without confirming.
- Planning the next sprint is out of scope. Do not rush anyone — hand over the
  result of the close and stop.
- **Two things never to do:**
  - Never roll unfinished work into the next sprint automatically. It goes to
    the backlog, always.
  - Never close an unfinished item to make it look done when the DoD is unmet.
