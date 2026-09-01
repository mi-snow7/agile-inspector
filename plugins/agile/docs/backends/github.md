# GitHub Issues backend mechanics

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> is said out loud. Every sample message in this file shows the **shape** of
> what to say, never its wording — do not echo the English.

Read when `.agile/config.yml` says `backend: github-issues`. The contract is
`README.md`.

**Position: we provide the screen too.** GitHub Issues has neither a board nor
a backlog view, so `apps/board-ui` is started locally (`../open-board.md`).
Where JIRA is "no screen, thick config", this is **our screen and our queries,
all the way down** — which means nothing has to accommodate somebody else's
setup, and **we get to define the classification.**

## Setup

The `gh` CLI, and nothing else. **No token ever changes hands.**

```bash
brew install gh        # macOS. See https://cli.github.com/ for other platforms
gh auth login
```

A developer working on GitHub usually has both behind them already, which is why
this is rarely the obstacle it is on Jira — but **the two failures still need
telling apart**.

| What happened | What to say |
|---|---|
| `gh: command not found` | **Not installed.** Give the install command and stop |
| `gh auth status` reports unauthenticated | Prompt the user to run `gh auth login` **in their own terminal** — it is interactive and blocks |
| `gh auth status` is fine | **Say nothing and carry on** |

> **Interactive logins go in the user's own terminal, never through this
> session.** `gh auth login` waits on input and on a browser, and a session that
> captures its output cannot see it finish — it looks like a hang with no
> explanation. Commands that print and exit, like `brew install`, are fine
> inline.

The project is identified by
`gh repo view --json nameWithOwner -q .nameWithOwner`. A repository with no
GitHub remote cannot be initialised.

## How things are classified — labels are the whole taxonomy

GitHub Issues has two states, `open` and `closed`, so **every distinction beyond
that is invented with labels**. That is why `/agile:init` creates 21 of them.

| Family | Labels |
|---|---|
| Column | `status:todo` / `status:in-progress` / `status:in-review` |
| Priority | `prio:high` / `prio:mid` / `prio:low` |
| Type | `type:story` / `type:task` / `type:bug` / `type:subtask` / `type:kpt` |
| Estimate | `points:1` / `2` / `3` / `5` / `8` |
| Retrospective | `kpt:keep` / `kpt:problem` / `kpt:try` / `retro:<YYYY-MM-DD>` |
| Other | `kaizen` / `carried-over` |

**Label names are fixed ASCII and are never translated.** Every skill, the board
UI and every existing issue match on those exact strings. Only the description
follows `locale`.

`retro:<YYYY-MM-DD>` is the one exception to init creating them — `/agile:retro`
creates each round's as it goes.

### The 21 that init creates, with colours

Created with `gh label create <name> --color <hex> --description "<desc>"
--force`. `--force` makes it idempotent, so it is safe to run in
"add what is missing" mode. **Descriptions are written in `locale`'s language**;
below they are shown in English.

```
status:todo         1d76db   Board: To Do (queued to start)
status:in-progress  fbca04   Board: In Progress
status:in-review    d876e3   Board: In Review (awaiting review)
prio:high           b60205   Priority: high
prio:mid            fbca04   Priority: medium
prio:low            0e8a16   Priority: low
type:story          5319e7   User story (a requirement that delivers value to a user)
type:task           1d76db   Technical or operational work (a peer of Story)
type:bug            d73a4a   A defect that needs fixing (a peer of Story)
type:subtask        c5def5   The smallest unit, broken out of a Story/Task/Bug
type:kpt            fef2c0   A retrospective sticky. Not work — excluded from every count
kpt:keep            0e8a16   Retrospective: Keep
kpt:problem         d73a4a   Retrospective: Problem
kpt:try             1d76db   Retrospective: Try
kaizen              5319e7   An improvement adopted at a retrospective
carried-over        ededed   Unfinished work from the last sprint
points:1|2|3|5|8    bfd4f2   Story points
```

Descriptions are written into the repository at init and stay there, so
correcting one later means re-running `gh label create --force`.

### Columns

**Backlog and Done get no label of their own.**

| Column | Representation |
|---|---|
| Backlog | `open`, **no** `status:*` label |
| To Do | `open` + `status:todo` |
| In Progress | `open` + `status:in-progress` |
| In Review | `open` + `status:in-review` |
| Done | **`closed`** |

In `sprint` mode, an item carrying a `status:*` label **still counts as Backlog
if its milestone is not the current sprint** (the single implementation of that
rule is `computeColumn` in `board-ui/server/columns.js`).

### Withdrawn is not finished

`closed` covers two different things. **Anything whose `stateReason` is
`NOT_PLANNED` is not completed** — it was decided against. Keep it out of the
finished list, the counts and velocity alike.

### What is excluded from counting

- `type:kpt` — a retrospective sticky, not work. Always `-label:type:kpt` in
  every list and every count
- `type:story` — a container, never counted against WIP
- Any parent that has sub-tasks — counting parent and children both would
  double-count the same work

The rule lives in `countsTowardWip` in `columns.js`.

## Parent and child

**Represented twice: GitHub's own sub-issue link, and a parent line in the
body.** The link is created through `gh api …/sub_issues`, but **reading is done
from the body** — that data already arrived with the list, so no per-parent API
call is needed.

## Sprints

**A Milestone is a sprint.** Creating, setting the goal and closing all go
through `gh api repos/…/milestones` (POST / PATCH). `sprint.current` holds the
current sprint's name. The goal goes in the milestone's `description` — there is
no dedicated goal field as there is in Jira.

> **Always pass `due_on` as `T12:00:00Z` (noon UTC).** Passing `T00:00:00Z` can
> roll the date back a day under timezone normalisation (measured). Noon never
> does. **After creating, check the `due_on` that came back** and PATCH it if it
> moved.

## Configuration

```yaml
backend: github-issues
capabilities:
  status_write: true      # we move columns and finish items ourselves
  field_write: true       # priority, estimates and milestones are all writable
  delete: true
  points: true
  sprint: true
  builtin_retro_board: true   # false only where the repository has Issues disabled
```

No backend-specific keys — `gh` resolves the repository from the working
directory.

## The operations

These answer R1–R6 and W1–W14 in the contract (`README.md`). **Answering every
row is this file's job** — anything missing leaves the skills with nothing.

Shared preamble:

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

### R1 — list by condition

`type:kpt` is **excluded from every query** (a retrospective sticky is not
work).

> **`updatedAt` is the only clock here, and it is the weak kind.** GitHub keeps
> no per-label timestamp, so "how long has this been in review" cannot be asked —
> only "how long since anything happened", and **a comment counts as
> something**. Writing a blocker down therefore silences the stall warning for
> the item it was written on. There is no way round it on this backend, so
> **say the number is "since last touched" when reporting it**, and follow the
> standing rule in `skills/board/SKILL.md`: a blocker is remembered by the daily,
> never by the clock.

```bash
# per column (To Do / In Progress / In Review). updatedAt comes along because
# stall detection needs it and a second round trip is waste
gh issue list --state open --label status:in-progress \
  --json number,title,labels,assignees,updatedAt --limit 50

# Backlog, for the board (open with none of the status labels)
gh issue list --state open \
  --search '-label:status:todo -label:status:in-progress -label:status:in-review -label:type:kpt' \
  --json number,title,labels,assignees --limit 50

# Backlog, for the backlog screen (also drops sub-tasks — they do not exist there)
gh issue list --state open \
  --search '-label:status:todo -label:status:in-progress -label:status:in-review -label:type:subtask -label:type:kpt' \
  --json number,title,labels,assignees --limit 100

# Done (a few recently closed)
gh issue list --state closed --search '-label:type:kpt' --limit 5 \
  --json number,title,closedAt,stateReason

# completed within a period
gh issue list --state closed --search 'closed:>=<since> -label:type:kpt' \
  --json number,title,closedAt,assignees,stateReason --limit 30
```

**In sprint mode add `--milestone "<sprint.current>"` to each of these.**

> `stateReason: NOT_PLANNED` is **not completion**. Always drop those after
> fetching.

### R2 — one item's body and comments

```bash
gh issue view 12 --json body -q .body
gh issue view 12 --json number,title,labels,body,comments
```

### R3 — pull requests merged in a period

```bash
gh pr list --state merged --search "merged:>=<since>" --json number,title,mergedAt,author --limit 30
gh pr list --state merged --search "milestone:\"$MILESTONE\"" --json number,title,mergedAt --limit 100
```

Corroborate locally as well (**never report an empty result as a finding** — see
R3 in `README.md`).

```bash
git log --since="<since>" --oneline --no-merges
git status --short
```

### R4 — sprints (milestones)

```bash
# all of them
gh api repos/$OWNER_REPO/milestones --jq '.[] | {number, title, due_on}'
# the current sprint in detail (goal, due date, counts)
gh api repos/$OWNER_REPO/milestones \
  --jq ".[] | select(.title==\"$MILESTONE\") | {number, description, due_on, open_issues, closed_issues}"
# the last three closed (for velocity)
gh api "repos/$OWNER_REPO/milestones?state=closed&sort=due_on&direction=desc&per_page=3" --jq '.[].title'
# points completed in a past sprint
gh issue list --milestone "<past sprint name>" --state closed \
  --json number,labels,stateReason --limit 100
```

### R5 — parent and child

**Written both ways, read from the body.**

```bash
# reading (from the body already fetched with the list)
#   <!-- agile:parent #12 -->   ← what the board reads. Always include it
#   Parent: #12                 ← for a human looking at GitHub. Follows `locale`
# legacy spellings are still accepted, including the Japanese forms
# 「親: #N」「親ストーリー: #N」and a full-width colon

# following the link through the API instead
gh api repos/$OWNER_REPO/issues/<parent>/sub_issues --jq '.[] | {number, title, state}'
```

Reading from the body works off data the list already returned, **removing one
API call per parent**.

### R6 — auth and project identity

```bash
gh auth status
gh repo view --json nameWithOwner -q .nameWithOwner   # absent ⇒ no GitHub remote
gh repo view --json hasIssuesEnabled                  # decides builtin_retro_board
```

### W1 — create

```bash
gh issue create --title "<title>" --label type:story --body-file -
```

- With no column given, **apply neither a status label nor a milestone** (that
  is the Backlog)
- Only when the request means "start this now" add `--label status:todo`, and in
  sprint mode **always add `--milestone "$MILESTONE"` alongside it** — a status
  label without a milestone appears in no column at all

### W2 — edit body and title

```bash
gh issue edit 12 --body "<the whole updated body>"
gh issue edit 12 --title "<new title>"
```

**The body is replaced wholesale.** Read it first with
`gh issue view 12 --json body`.

### W3–W6 — swapping classifications (type / priority / estimate / column)

All of them are **label swaps**. **`--remove-label` on a label that is not
present can error**, so check the current labels first and remove only what is
actually there.

```bash
gh issue view 12 --json labels -q '.labels[].name'

gh issue edit 12 --remove-label type:task  --add-label type:story    # W3 type
gh issue edit 12 --remove-label prio:mid   --add-label prio:high     # W4 priority
gh issue edit 12 --remove-label points:3   --add-label points:5      # W5 estimate
gh issue edit 12 --remove-label status:todo --add-label status:in-progress  # W6 column
gh issue edit 12 --remove-label status:in-progress                   # W6 back to Backlog
```

Returning priority or estimate to "unset" means removing all of that family's
labels.

### W7 — finish, withdraw, reopen

```bash
gh issue close 12                                                     # Done
gh issue close 12 --comment "<reason>" --reason "not planned"         # withdrawn
gh issue reopen 12 && gh issue edit 12 --add-label status:in-progress  # sent back
```

### W8 — add to / remove from a sprint

**Backlog items carry no milestone**, so moving columns doubles as moving in and
out of the sprint.

```bash
gh issue edit 12 --milestone "$MILESTONE" --add-label status:in-progress  # Backlog → board
gh issue edit 12 --remove-milestone --remove-label status:in-progress     # board → Backlog
# moving within the board, or to Done, leaves the milestone alone
```

### W9 — create a sprint, set its goal, close it

```bash
# create (due_on at noon UTC — see the warning above)
gh api repos/$OWNER_REPO/milestones -f title="Sprint 6" -f due_on="2026-08-20T12:00:00Z" \
  --jq '{number, title, due_on}'

MS_NUM=$(gh api repos/$OWNER_REPO/milestones --jq ".[] | select(.title==\"Sprint 6\") | .number")
gh api -X PATCH repos/$OWNER_REPO/milestones/$MS_NUM -f description="<sprint goal>"  # goal
gh api -X PATCH repos/$OWNER_REPO/milestones/$MS_NUM -f state=closed                 # close
```

### W10 — link a child to a parent

```bash
gh issue create --title "<sub-task>" --label type:subtask --label status:todo \
  --milestone "$MILESTONE" --body "<!-- agile:parent #<parent> -->
Parent: #<parent>"

PARENT_ID=$(gh api repos/$OWNER_REPO/issues/<parent> --jq .id)
CHILD_ID=$(gh api repos/$OWNER_REPO/issues/<child> --jq .id)
gh api -X POST repos/$OWNER_REPO/issues/<parent>/sub_issues -F sub_issue_id="$CHILD_ID"
```

The second line is for humans and follows `locale`; **the HTML comment is what
the board reads**, so it is never optional.

> **`-F`, not `-f`.** `-f` sends every value as a string and this endpoint
> rejects that — `422 Invalid property /sub_issue_id: "5306909587" is not of
> type 'integer'`. The failure is quiet in the worst way: the sub-task has
> already been created by the line above, so what is left is a child with a
> parent marker in its body and no GitHub-native link. The board still nests
> it (it reads the body), which is exactly why nobody notices on the board.

If the sub_issues API is unavailable (organisation settings can make it fail),
fall back to appending a `- [ ] #<child>` task list to the parent's body —
GitHub links those automatically and shows a progress bar.

### W11 — comment

```bash
gh issue comment 12 --body "<text>"
```

### W12 — delete

**Do not use `gh issue delete`** — it is irreversible and needs admin rights.
Withdraw instead (W7). Only consider deletion when the user explicitly asks for
the item to be gone, after explaining the risk and confirming.

### W13 — initialise

See "The 21 that init creates" above. **Never touch existing labels, settings or
templates.**

### W14 — set or clear the assignee

```bash
gh issue edit 12 --add-assignee taro        # @me works too
gh issue edit 12 --remove-assignee taro
```

**GitHub allows several assignees**; the board shows the first. Adding does not
replace, so handing work over is remove-then-add, not add alone — and a pair or a
mob is simply several `--add-assignee`, which **is not true on every backend**
(see `README.md`).

## KPT

**Stored in the same issue store with `type:kpt`, and excluded by our own
queries.** We write every list and every count, so hiding them is reliable —
on JIRA the board's filter belongs to the team, which is why that approach is
unavailable there.

An adopted Try **stays the same issue**: drop `type:kpt` and `kpt:try`, add
`type:task` and `kaizen`. History and comments come with it.

```bash
# the round's label (not created at init — /agile:retro creates each round's)
gh label create "retro:$RETRO_DATE" --color ededed --description "Retrospective: $RETRO_DATE" --force

# create a card. NEVER give it a milestone or points — that is what keeps
# stickies out of the demo list and out of velocity automatically
gh issue create --title "<the card's text>" --label type:kpt --label kpt:problem \
  --label "retro:$RETRO_DATE" --body ""

# read this round's cards
gh issue list --state open --label type:kpt --label "retro:$RETRO_DATE" \
  --json number,title,labels,assignees --limit 200

# adopt: convert the sticky into a work item. Dropping type:kpt is the point —
# left on, the exclusion filter makes it vanish from the ordinary board
gh issue edit <n> --remove-label type:kpt --remove-label kpt:try \
                  --add-label type:task --add-label kaizen

# rejected, and the end-of-round tidy-up
gh issue close <n> --comment "<reason>" --reason "not planned"
gh issue list --state open --label type:kpt --label "retro:$RETRO_DATE" \
  --json number,labels -q '.[] | select([.labels[].name] | index("kpt:try") | not) | .number' \
| xargs -I{} gh issue close {} --comment "recorded in the $RETRO_DATE retrospective" --reason "completed"
```

A card's `author` is read from `assignees[0]` — each participant writes under
their own `gh` credentials, so that is the only record of whose card it is.
**Never close a `kpt:try` card during the tidy-up**: adopted ones were converted
and rejected ones were closed with a reason, so anything still there is a
decision that was missed.

> **Closing is the right way to put them away here.** The contract once said
> "never close, always fold with a field", written for a backend that could not
> write state yet still held retro cards. It was decided that JIRA would not
> store KPT at all, so that case disappeared and the rule went with it.

## What this implementation is for

**It is the reference.** What any line of the contract (`README.md`) actually
means can be read here first. When a JIRA decision is unclear, come back and ask
what the GitHub version did.

**Two things must not be copied, though.**

1. **Only GitHub lets us define the classification.** The 21 labels are possible
   because Issues arrives with almost no taxonomy. Doing the same to a JIRA
   project already in use would damage somebody's environment.
2. **`type:kpt` can be hidden only because we write every query.** On a backend
   whose own UI decides what is displayed, that move does not exist.
