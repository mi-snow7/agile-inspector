---
description: "[sprint mode only] Sprint planning. Starts a new sprint, then drafts the goal, selects items against it, confirms the goal and breaks work into sub-tasks. Assigns nobody — owners are decided when work is picked up, at the daily. The end date is calculated from duration_days. Independent of /agile:sprint-close — it does not necessarily follow it on the same day."
---

# /agile:sprint-start — start a sprint

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

**Sprint planning itself.** Create the new sprint, select the items, agree the
goal, break things down, and update `.agile/config.yml`. Creating the sprint is
something this command does for the team; people should only need to touch
sprints by hand in irregular situations.

**Completely independent of `/agile:sprint-close`.** Closing does not chain into
this — the team takes the review and the retrospective away with them and plans
the next sprint afterwards, in practice often the next working day. Run this at
the start of every sprint.

## Mechanics

Creating a sprint, putting items into it, setting its goal and linking parents
to children all live in `docs/backends/`. **Read only the file named by
`backend:`.** Read `capabilities` too — `sprint: false` means this command does
not apply at all, and `points: false` removes velocity (below).

## Preconditions

- If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
- **If the backend's command-line tool is missing, or present but not
  authenticated, those are different problems** — follow "Setup" in
  `docs/backends/…` and stop. Telling someone to authenticate a tool they have
  not installed sends them looking in the wrong place.
- If `mode: kanban`, ask: "this project is not in sprint mode — switch `mode` to
  sprint in config.yml?"
- If a sprint is already active, ask before overwriting. Normally advise
  **closing it first with `/agile:sprint-close`**; proceed only if the user says
  outright that this is an irregular case.
- If `.agile/definition_of_done.md` is missing, it should exist before
  development starts — ask "the Definition of Done isn't set. Shall we agree it
  first?" and, if so, agree it here exactly as `/agile:init` does and write the
  file before continuing.

## Procedure

### 1. Decide the name and the end date

- **Name**: follow whatever the existing sprints are called (if the last was
  "Sprint 5", this is "Sprint 6"; from "Sprint 1" if there are none). If the
  convention is unclear, ask.
- **End date**: today plus `sprint.duration_days` (default 14, and **say so** —
  "config.yml had no duration, so I used 14 days").

### 2. Create the sprint and update config.yml

Create it, then **immediately** write the new sprint's name into
`sprint.current` in `.agile/config.yml` (leave `duration_days` alone).

**Update it before opening any board.** The board's column filtering reads
`sprint.current` to decide what belongs to the current sprint, so skipping
ahead shows the wrong sprint entirely.

> Some backends normalise dates in ways that can move an end date by a day.
> After creating, **check the date that came back is the one you meant**, and
> correct it if not. The per-backend detail is in `docs/backends/`.

### 3. Plan the sprint

In order: **draft the goal → select the items → confirm the goal → break down**.
Propose and confirm each time; never apply anything in bulk.

**The goal is drafted before anything is selected**, because it is what makes
selection a decision rather than an accumulation. Picked first and summarised
afterwards, the goal becomes a description of whatever was chosen — and the tell
is a sentence joined by "and also", carrying two purposes because two unrelated
things were taken. It is finalised at 3-2, once the selection is real; the draft
exists to be argued with, not to constrain.

#### 3-0. Draft the goal

Ask the product owner what this sprint is **for** — one sentence, before the
backlog is opened. Where they have no answer yet, take the top of the backlog and
offer a reading of it: "this looks like it is mostly about X — is that the point
of this one?"

**Do not polish it.** It is a question to hold each candidate against, and it
will change as the selection does.

**Nothing is assigned here — not at 3-0, not anywhere in planning.** Who does
what is decided when somebody picks the work up, which is the daily's business
(`skills/standup/SKILL.md`). Handing out owners at planning turns a team into a
list of individuals and fixes a plan that was never meant to survive contact
with the week.

#### 3-1. Select the items

**Re-evaluate the carry-over first, one item at a time, and only then work down
the rest of the backlog.** Rolling unfinished work into the next sprint
unexamined is exactly what this step exists to prevent.

**a) The carry-over**

> **An item nobody can see needs its own address, not a screen's.** Where a
> carried-over item never made it back — it is still tied to the finished period,
> or it only exists through a parent — the screen the team would normally work on
> is exactly the one it is missing from. **Link each such item directly**, and
> say what has to happen to it. Handing over the planning screen alone asks them
> to find something that is not there.

For each carried-over item, read the note that `/agile:sprint-close` left on it
and ask the product owner's question. Offer three answers:

- **A. Take it again** — still high priority, nearly done. Confirm what is left,
  then put it into the new sprint and clear the carry-over marker.
- **B. Push it back** — priority has dropped. Re-prioritise it and clear the
  marker; it becomes an ordinary backlog item and does **not** go into the
  sprint.
- **C. Split it or drop it** — it was too big, or it is no longer wanted.
  Splitting follows `/agile:issue`; dropping follows that skill's withdrawal
  rule, including what to do when this tool cannot change state.

**b) The rest of the backlog**

Present the backlog in priority order, with estimates where they exist, **and
show the draft goal alongside it.** For each candidate the question is whether it
serves that goal — an item that does not is not thereby rejected, but taking it
should be a decision somebody makes out loud, not something that happens by
scrolling.

**Offer past velocity as a guide.** Total the points completed in up to the last
three finished sprints and use the **average** (the single value if there is only
one; add the range when the spread is wide).

> **Withdrawn items are not completed items.** Keep them out of the velocity
> total, or it will read high and the team will over-commit.

> If the backend cannot record estimates (`capabilities.points: false`), there is
> no velocity. Skip it and go straight to the last paragraph of this step.

Once the candidates and the velocity are on screen, **open the backlog screen**
(`docs/backends/…`) and ask the team to move the items they are taking into the
new sprint, saying that the average burn over the last three sprints was N
points. Wait for them — "tell me when you're done". If the choice is already
clear in text, taking the identifiers directly is fine too.

When they say they are finished, re-fetch what is now in the sprint and confirm
it back. Show the point total, and if it is over the average, **push back
gently** — "the last three sprints averaged 15 points (12–18); this comes to 21.
Will that overflow?" Never forbid it. **The call is the team's.**

If there is no history (first sprint), or most items have no estimate, do not
force estimation. Ask instead: "how much do you think fits this time?"

> **Where this tool cannot write** (`status_write` or `field_write` set to
> `false`), **it does not put anything into the sprint** — the team does, on the
> screen that is already open. **This step does not change by a word**: it was
> always "open the backlog, wait while they move things, re-read and confirm".
> Only the sentence about what to do changes, and the confirmation still
> happens, because reading back always works.

#### 3-2. Confirm the sprint goal

Bring the draft from 3-0 back beside what was actually selected, and ask whether
it still says what this sprint is for. Selection nearly always moves it — that is
the point of drafting it early rather than the sign of a bad draft.

**One purpose, one sentence.** If it has become two joined by "and", say so and
ask which is the sprint — a goal covering everything cannot tell anyone what to
drop when the week goes wrong, which is the only moment a goal has to earn its
keep. The team may keep it anyway; **the call is theirs**.

Record it on the sprint so `/agile:standup` and others can read it back.

#### 3-3. Break down into sub-tasks (optional)

For each item in the sprint — Story, Task or Bug alike — ask whether to break it
down, and create sub-tasks only where they are wanted. Leaving an item as a
single unit of work is perfectly fine.

When breaking down, **switch the board to the by-parent lane**
(`docs/backends/…`). The item being decomposed becomes the row heading, so there
is no mistaking which parent a sub-task is being added to. The team can add them
from the screen; if they list them in text instead, create them here.

Each sub-task is created **inside the sprint** and **linked to its parent**. How
the link is recorded is the backend's business.

### 4. Closing report

- The sprint that was created, its end date and its goal
- What happened to each carried-over item (A / B / C)
- The items taken into the sprint, and any sub-tasks created
- What to run next: `/agile:board`, `/agile:standup`, `/agile:issue`

## Stance

Creating the sprint and updating config.yml can be done without asking.
**Overwriting an active sprint, selecting the items, and breaking work down are
confirmed first.**
