---
description: Facilitate the daily. Opens the board, fills in each person's "since last time / today" in advance from item state and recent commits and merged PRs, then goes round one at a time (right to left across the board in kanban mode). Catches blockers, records who has taken what, and closes with a summary.
---

# /agile:standup — facilitate the daily

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

**Stand in for the scrum master and chair the daily.** Not a summary and done —
open the board and go round, as the facilitator.

| Mode | Called | Route |
|---|---|---|
| sprint | **Daily scrum** | **By person.** One assignee at a time |
| kanban | **Daily** (standup) | **By board.** Walk right to left — review → in progress → to do |

Never ask which mode; read it from `.agile/config.yml`.

## How this gets used

**Everyone looks at the same board, and one person types.** Whoever is called on
answers out loud, and the person at the keyboard relays it into chat. Adapt the
writing to that:

- **Call people by their handle.** Never write "you" — the person reading is not
  the person answering, and it stops being clear whose turn it is.
- **One short step at a time.** Never emit everybody's section at once. Keep it
  to a few lines, the length someone can read aloud and relay.
- **Answers arrive in the relayer's words**, in the third person — "taro says
  he's stuck on the list screen". Do not ask again just because it did not come
  from the person themselves.

## Mechanics

Every query and every write lives in `docs/backends/`. **Read only the file
named by `backend:`.** Also read `capabilities` — `status_write: false` changes
how the daily ends (below).

## Preconditions

If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
**If the backend's command-line tool is missing, or present but not
authenticated, those are different problems** — follow "Setup" in
`docs/backends/…` and stop. Telling someone to authenticate a tool they have not
installed sends them looking in the wrong place.

## 1. Gather the material

**Collect all of it before starting.** Fetching mid-conversation stops the
meeting.

- The current board state — the in-progress, review and to-do columns, with
  assignees and however long each item has been where it is (`docs/backends/`
  says which timestamp gives that)
- **"Since last time"**: recently finished items, and pull requests merged in the
  window
- **Corroboration from the repository**: recent commits, and whether the working
  tree is dirty

> **Withdrawn items are not completed items.** Keep anything closed as "not
> planned" out of the finished list and the counts.

**Choosing the window.** Default to the last 36 hours, assuming this runs daily.
Days do get skipped, so **if 36 hours comes back empty or obviously thin, widen
and re-fetch** (3 days, then 7). If the user names a window — "since Friday" —
use it. Do not treat weekends specially; no business-day arithmetic.

**When the repository turns up nothing, do not report that as a finding.** Local
commits are corroboration for work that never became an item or a PR; the
primary source is the tracker and the merged PRs. Teams that run this plugin in a
**planning-only repository** have no code there, so those lookups are always
empty — that means "wrong place to look", not "nobody did anything". Treat it as
corroboration that was unavailable, silently. **Exclude it from the decision to
widen the window too** — no window will ever fill it, and re-fetching is waste.

In sprint mode, scope everything to the current sprint, and pick up the **sprint
goal and the end date** as well.

> **How well "since last time" fills in depends on the backend.** Where the
> tracker and the code host are the same system, merged work links itself to the
> item. Where they are not, the link exists only if people write the item's key
> in the commit message — so expect gaps, and **never present an absence as
> "nothing happened"**. Ask instead.

## 2. Confirm before starting

**Always ask. Never decide from the headcount.** There are days nobody gathers —
running asynchronously, or just wanting to see the state mid-task.

The ceremony is the default, so this is a start confirmation, not a two-item
menu.

```
## 🗓 Daily scrum 2026-08-11
🎯 Repurchase from the order history, end to end (Sprint 6 — 3 days left, 5/12 done)
Present: @taro / @hanako / @jiro

Start the daily scrum? (a summary alone is also fine)
```

- **The name changes with the mode** — "daily scrum" in sprint, "daily" in
  kanban.
- In sprint mode show the goal, the days remaining and the completed count. Show
  none of that in kanban — there is no boundary to count against.
- **Take the participants from the assignees** on the board. If it is wrong the
  user will say so; do not run a separate roll call.
- **When nothing is assigned yet, ask once** — "who is in today?" — and use that
  list. A sprint's first daily has no owners on it, and deriving the room from an
  empty board would silently run the ceremony for nobody.
- Ask even with one assignee. Alone, the same flow works as a self-check.
- If the request already said "just a summary", skip the question.

**On "no"** — do not open the screen. Emit only the closing summary format
(step 8), and because nothing was facilitated, include **only "since last time"
and "today"**. Blockers, the parking lot and the goal outlook are things you
learn by asking people, so leave them out. **Never infer them from data.**

**On "yes"** — continue.

## 3. Open the board and begin

The daily is where cards get moved while people talk, so **open the screen before
facilitating** (`docs/backends/…`; reuse it if already open).

| Mode | What to open | Why |
|---|---|---|
| sprint | Board, grouped **by assignee** | Going person by person, so the lane order is the running order |
| kanban | Board, **no grouping** | Watching flow, not people — the plain board shows where the columns clog |

Which lanes exist and when to use them is defined in `skills/board/SKILL.md`
("Swimlanes"). **Do not restate it here.**

Once open, add **one line of purpose** and start. Enough that a team new to agile
is not lost, without turning it into a lecture every morning.

```
Board's open. This isn't a progress report — it's to line up how we work today. Aim for 15 minutes.
```

## 4. (sprint) One person at a time

**Emit one person, then stop and wait.** Never run on to the next.

The job is not to *ask* — it is to **have filled it in already**. Present
everything the data can tell you, so people only speak the difference and the
blockers. Removing the "what did I do yesterday" pause is the point of having a
facilitator.

```
── @taro ──
Since last time: finished the history API (PR #38 merged)
Today:           the list screen (in progress for 2 days)
Anything to add, or anything blocking?
```

- **The three questions — yesterday, today, obstacles — are a default shape, not
  a rule** (the 2020 Scrum Guide stopped requiring them). If the team prefers
  another shape, follow it.
- If someone has nothing in progress, name one candidate from the top of the
  to-do column. **Do not assign it** — offer it. **If they take it, record that
  they did**: put their name on the item there and then. **When more than one
  person takes it** — a pair, a mob — record all of them; `docs/backends/` says
  how many the item itself can hold and where the rest go. **No name is dropped
  in silence.** Offering without
  recording leaves the decision in the room and the board still saying nobody
  owns it, so tomorrow's round has nothing to go on and the person has to say it
  again.
- **The moment work is picked up is the moment it gets an owner** — never
  earlier. Deciding at planning who will do what turns a team into a list of
  individuals and freezes a plan that was never meant to survive the week. So
  nothing is assigned in advance, and nothing that has been taken is left
  unassigned either.
- Where the data and reality disagree — a merged PR against an item still shown
  as in progress — point it out gently and ask whether to fix it now.

## 5. (kanban) Walk the board right to left

Kanban is pull-based and nothing is assigned in advance, so what is being
watched is **the flow of work**. Start from the column nearest completion —
emptying the right-hand end first is what keeps the flow from clogging.

```
── In Review (2) ──
ABC-12  Review the list screen (in review for 12 days)
ABC-18  Search fix
Is review stuck? This is the end we want cleared first.
```

Walk review → in progress → to do, and in each column ask only:

- **Review**: can anyone look at these? What is holding them?
- **In progress**: moving? Stuck? (raise a WIP overrun here)
- **To do**: which one gets pulled today? (prompt replenishment if it is below
  the minimum)

The rules for WIP, stalls, replenishment **and parent/child consistency** are in
`skills/board/SKILL.md`. The last one belongs here more than anywhere: people drag
the **sub-task** cards as they work, so a parent sits in a not-started column
while its children move — and the daily is the one moment somebody is looking at
the board with the team in the room. Raise it there, as a suggestion.
**Do not copy them here.**

## 6. Catch the blockers

The daily exists **to find blockers and get them removed**. When one surfaces, do
not let it slide past.

- **Do not solve it here.** When a discussion starts, cut it — "shall @taro and
  @hanako take this after? Let me finish the round first." This is the single
  biggest cause of a daily running long.
- **Whatever you cut goes into the parking lot, and the parking lot is always
  written out at the close** (step 8). Cutting without recording makes the
  promise to talk later evaporate on the spot — worse than not cutting at all.
  **Cutting and collecting are one move.**
- **Ask whether to record it.** Never file anything unasked.

```
Record this as a blocker on the list screen?
  a) leave a comment on the item
  b) file it as a separate task
  c) don't record it — verbal only
```

For (b), follow `skills/issue/SKILL.md`. **Do not restate the body formatting
rules here.**

**A blocker raised once is raised every time until it is gone.** Read the last
daily's record before the round starts, and bring each open blocker up by name —
**before anybody has to remind you**. Someone answering "same as yesterday" is
not the obstacle being tracked; it is the obstacle being tolerated, and the
number of days it has stood is the thing worth saying out loud.

Do not rely on the item itself to remember. **On backends whose staleness clock
is reset by any edit, the comment recording the blocker is what stops it being
flagged** (`skills/board/SKILL.md`) — the more carefully it was written down, the
more certainly it will not resurface on its own.

Close a blocker only when someone says it is cleared. Then say so, with how long
it stood.

## 7. Check whether the goal is still reachable (sprint only)

**Once the round is done, pull the view back from individual tasks to the sprint
goal.**

Skipping this is the most common failure — the daily ends as "everyone shared
their task status". Individuals can all be fine while the goal is not, so **put
the days remaining against the work remaining and ask**.

```
── Goal check ──
🎯 Repurchase from the order history, end to end (3 days left)
2 in progress, 1 in review, 4 to do. The list screen has sat in review for 12 days.

Is this goal still reachable this sprint?
```

- **Never rule on whether it will make it.** Lay out the facts — counts, days
  left, what has stalled — and leave the judgement to the team.
- **If the answer is "it's tight", ask for one move now** — "cut scope, reorder,
  or carry on?" Deciding now is safer than noticing at the end. **Prompt the
  decision; never execute it unasked.**
- If scope gets cut, hand the actual move to `skills/board/SKILL.md`.

Kanban has no sprint goal. Skip this step entirely.

## 8. Close

Produce something that can be pasted.

```
### ✅ Since last time
- History API done (@taro) / PR #38 merged

### 🎯 Today
- @taro: the list screen
- @hanako: the search form

### 🚧 Blockers
- Waiting on a decision about the response shape (@taro) → filed
- The list screen has sat in review for 12 days. Likely material for the next /agile:retro

### 🅿️ Parking lot
- Response shape → @taro / @hanako, right after this

### 🎯 Goal outlook
- Reachable, provided the review clears today
```

- **Omit a section entirely when it is empty.** Never pad with "nothing to
  report".
- "Goal outlook" is sprint-only, and carries **the team's answer from step 7
  verbatim**. Never write a guess there.
- **Park stalls and WIP overruns as material for the next retrospective.** Do not
  start root-causing them in the daily.

When the backend allows this tool to move cards, close by saying so — cards can
be dragged on the board, or moved from chat. **When `capabilities.status_write`
is `false`, say nothing about moving them**: the team moves cards in their own
tool, and pointing at that mid-close reads as an apology for something that was
never taken away.

## Stance

- **Chairing, not managing.** Do not grade progress or scold delay. Never
  "should" — instead, "this has stopped", "this one is the next candidate".
- **Never act unasked.** Moving a card, filing an item, assigning an owner — all
  of it is confirmed first.
- Mention the timebox when it is about to be passed, but **never cut the meeting
  off**.
