# JIRA backend mechanics

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> is said out loud. Every sample message in this file shows the **shape** of
> what to say, never its wording — do not echo the English.

Read when `.agile/config.yml` says `backend: jira`. The contract is `README.md`.

**Position: we own no screen at all.** Both the board and the backlog are
Jira's, and we only open them. What this plugin holds is **the queries, the
numbers and the facilitation.** Layout is none of its business.

## Setup

**Assume `acli` is not installed.** A team adopting Jira has no reason to have
it already, which makes this the first thing they meet — unlike `gh`, which a
developer on GitHub usually has behind them.

```bash
brew tap atlassian/homebrew-acli     # macOS
brew trust atlassian/acli            # Homebrew 6.x refuses to install from an untrusted tap
brew install acli
acli --version
```

> **`brew tap … && brew install` alone fails on Homebrew 6.** It taps fine and
> then declines to install, printing a wall of trust advice in which the line
> that matters is easy to miss. Give all three commands — measured on Homebrew
> 6.0.18, which installed acli 1.3.29. Note the tap normalises to
> `atlassian/acli`, so that is the name `brew trust` takes.
>
> The binary is also downloadable directly:
> https://developer.atlassian.com/cloud/acli/

Then authenticate — **the browser flow, so no token is created**:

```bash
acli jira auth login --web
```

> **Have them run this in their own terminal, not through this session.**
> It blocks waiting on a browser, and a session that captures its output cannot
> see it finish — so the login appears to hang even after the user has clicked
> Accept, with nothing on screen to explain why. `brew install` is fine to run
> inline because it prints and exits; **anything that waits on an external event
> is not.**

### Two different failures, two different things to say

| What happened | What to say |
|---|---|
| `acli: command not found` | **Not installed.** Give the install command above and stop. **Never tell them to authenticate** — they would go looking for a login prompt that does not exist |
| `acli jira auth status` reports unauthenticated | **Installed but not logged in.** Give `acli jira auth login --web` and stop |
| Authenticated against the wrong site | Say which site it is on, and offer `acli jira auth login --web` to switch |
| `acli jira auth status` reports the right site | **Say nothing and carry on.** Do not walk someone through a login they have already done |

**Check this before anything else in `/agile:init`.** Every step below calls
`acli`, so skipping the check produces a wall of `command not found` with no
explanation of what to install.

## Two routes, used for different things

| | Uses | Auth | When |
|---|---|---|---|
| **Everyday use** | `acli` (Atlassian's own CLI) | `acli jira auth login --web` (browser — **no token**) | always |
| **Discovery at init** | REST directly (Basic auth) | email + API token | **once** |

`acli` is the counterpart of `gh`; `workitem search --jql …` maps onto
`gh issue list`.

> **Careful: the browser login is the broader of the two.** The scopes
> `acli jira auth login --web` actually requests (measured 2026-08-18) are
> `manage:jira-project`, `manage:jira-configuration`, `write:jira-work`,
> `read:jira-work`, `read:jira-user`, `read:me` and `offline_access` — **plus
> Confluence write and admin scopes**. There is no way for a user to narrow
> them.
>
> So it is the reverse of the intuition: **the low-friction everyday route hands
> over the wider permission.** "It can be scoped to read" only ever applied to
> the API token used at init. Understand too that `status_write: false` is
> **self-restraint, not a permission boundary** — the grant allows writing.

**Discovery at init is the one thing `acli` cannot reach** (measured
2026-08-18, acli 1.3.23). `acli jira board view --id N --json` returns only
`{id, link, location, name, type}` — **neither the column configuration nor the
points field**. There is no raw-API command (`acli jira api` does not exist),
and `acli jira field` has no list or search.

So **exactly one person creates one API token, once.** The discovered values go
into `.agile/config.yml`, which is committed and shared, so **nobody else ever
needs a token.**

> Giving up points (and therefore velocity) removes even that. Leave the door
> open to initialising with `capabilities.points: false`.

## How things are classified — never match on display names

**Names are translated for display, and the translation is not what anything
matches on.** Measured on a `locale: ja_JP` instance (2026-08-22):

```
/rest/api/3/project/{key}/statuses  →  「レビュー中」「進行中」「完了」, "To Do"
JQL  status = 'レビュー中'           →  ✗ does not exist
JQL  status = 'In Review'           →  ✓
```

**The stored names are English throughout.** What the REST endpoint returned was
a translation applied for the caller's locale — and "To Do" only looked like an
exception because Jira has no Japanese translation for it. Do not conclude from
a localised response that the project was set up in that language.

**And the two operations disagree about which string to use.** Measured:

| | Accepts | Rejects |
|---|---|---|
| **JQL** (reading) | `Task`, `Story`, `Bug` — **English** | `タスク`, `ストーリー`, `バグ` |
| **`workitem create --type`** (writing) | `タスク` — **the localised name** | `Task` |

**The same issue type is two different strings depending on what you are
doing.** This is why reading goes through ids and the name for creating is asked
for at init rather than derived — neither side can be inferred from the other.

Underneath, though, there is **always a language-independent classification.**
Use these two and nothing else.

| Axis | Values | Used for |
|---|---|---|
| `statusCategory.key` | `new` / `indeterminate` / `done` (plus `undefined`) | deciding not-started and done |
| `issuetype.hierarchyLevel` | `1` (Epic) / `0` (work) / `-1` (sub-task) | deciding what gets counted |

**`indeterminate` covers both In Progress and In Review**, so it cannot separate
the columns on its own. **Columns come from `columnConfig`** (below); the
category answers only "not started?" and "done?".

Anything at `hierarchyLevel = 0` is treated as work, whatever it is called. A
default team-managed project has a `Feature` type, which is `0` and therefore
handled exactly like Story/Task/Bug — **no special case needed**. The same holds
when a team adds types of its own.

> **Exception: creating an item does need the display name.** (Measured
> 2026-08-19.) `acli jira workitem create --type` accepts **only a name, and
> only the localised one**.
>
> ```
> --type "Task"    → ✗ Please provide valid issue type. Allowed issue types for
>                      project are : エピック, Subtask, タスク, ストーリー, Feature, バグ
> --type "タスク"   → ✓ created
> ```
>
> Reading (`issuetype in (…)` in JQL) takes ids, so the rule holds there.
> **Read by id, write by the localised name.** Never carry a name across from
> one to the other: JQL wants the untranslated one, which a localised endpoint
> will not show you, and create wants the translated one, which JQL rejects.
>
> A useful side effect: **that rejection lists the project's types.** Even on
> the token-free route, one deliberately invalid type name enumerates them.

## init (discovery)

### 1. Ask for the board's URL

**Never construct it.** The shape differs by project style, and `board_id`
cannot be derived from the site URL.

```
company-managed: https://<site>.atlassian.net/jira/software/c/projects/KEY/boards/42
team-managed:    https://<site>.atlassian.net/jira/software/projects/KEY/boards/42   ← no /c/
legacy layout:   https://<site>.atlassian.net/secure/RapidBoard.jspa?rapidView=42
```

Take `site`, `projectKey` and `board_id` from it, and record the style from
whether `/c/` is present.

> **On detecting company-managed, say so straight away.** Verification was done
> **on team-managed only** — standing up a company-managed instance needs
> organisation admin. **Saying it beforehand beats failing quietly.**
>
> ```
> This looks like a company-managed project. That configuration is unverified,
> so column discovery and sprint handling may not behave as expected.
> Let me know if something breaks — carrying on for now.
> ```
>
> **Do not stop.** It will probably work, and stopping means nobody can even
> try.

**Validation**: `GET /rest/api/3/serverInfo` returns **200 without
authentication**, so a pasted URL can be checked as a real Jira Cloud site
before asking anyone to authenticate.

### 2. Read the board configuration (**optional** — the only place a token is used)

`acli` cannot reach the column configuration or the points field, so this one
step goes to REST directly. **Do not make it mandatory** — putting "go and
create a token" in front of a first run loses teams there. The default is the
token-free route below, and **it can be added later by re-running `/agile:init`**
(which is idempotent by design).

#### The plugin never receives the token

**Print the command, have the user run it, and take back only the JSON.** The
token reaches neither the conversation nor a file — if we never hold it, it
cannot end up in `.agile/config.yml`, which is committed.

> **Forbidden**: writing the token into `.agile/config.yml`, having it pasted
> into chat, or saving it to any file in the repository. **Only the discovered
> values are stored.**

#### Steer towards a read-only token

When creating one at
https://id.atlassian.com/manage-profile/security/api-tokens, **scopes can be
selected** (the `read:jira-work` family). Write scopes are not needed, so do not
take them. Scopes cannot be changed afterwards, so they have to be narrowed at
creation.

**A scoped token goes to a different host.** Not `<site>.atlassian.net` but
`api.atlassian.com/ex/jira/<cloudId>`. The `cloudId` is **available without
authentication** (measured).

```bash
curl -s https://<site>.atlassian.net/_edge/tenant_info      # → {"cloudId":"…"}

curl -s -u "<email>:<token>" -H "Accept: application/json" \
  "https://api.atlassian.com/ex/jira/<cloudId>/rest/agile/1.0/board/<board_id>/configuration"
```

(An older, unscoped token still works against `https://<site>.atlassian.net/rest/…`.
The response is the same either way.)

**Four things arrive at once** (measured):

| Available | Used for |
|---|---|
| `columnConfig.columns[]` (column names + each column's status ids) | **the column definition itself** |
| `estimation.field.fieldId` | the points field (e.g. `customfield_10016`) |
| `columnConfig.constraintType` | Jira's own column constraints. Anything other than `none` means **we hold no `wip_limit` of our own** |
| `ranking.rankCustomFieldId` | backlog rank (Jira genuinely has one) |

> `estimation`'s display name is "Story point estimate" on team-managed and
> "Story Points" on company-managed. **Another reason never to search by name.**
>
> A `customfield_*` number **differs between projects inside one organisation**
> (it varies with when the project was created and from which template). Looking
> one up and reusing it elsewhere does not work — **always fetch it per
> project.**

#### The token-free route (the default)

| | What to do instead |
|---|---|
| Columns | Show the statuses `acli` found on actual items and **ask "which column is in progress?" and "which is awaiting review?"** — `statusCategory` settles not-started and done automatically, so only the `indeterminate` ones need a human |
| Points | **Give up.** Set `capabilities.points: false` and produce no velocity |
| Column constraints, backlog rank | Not fetched (`wip_limit` uses our own settings) |

> **This only ever sees statuses that currently hold a card.** (Measured
> 2026-08-20: three of four appeared, because nobody had anything in progress.)
> **An empty column is invisible entirely.** Always add "are there other
> columns?" to the question, and **never present the discovered list as
> complete** — a column missed here vanishes from the board the moment work
> lands in it.

**"Answer two questions" completes far more often than "go and create a
token."** Only a team that later wants points needs to walk the steps above,
once.

### 3. Determine the mode and the sprint length

**The board's `type` is unusable.** A team-managed board returns `"simple"` and
never identifies itself as scrum or kanban.

```bash
acli jira board list-sprints --id <board_id>   # or /rest/agile/1.0/board/<id>/sprint
```

- Sprints come back → the board **can** run sprints, so `mode: sprint` is the
  suggestion. The gap between `startDate` and `endDate` on the `state: active`
  one is `sprint.duration_days` (14 in the measurement)
- Nothing comes back, or it errors → `mode: kanban`

**This is what to suggest, not what to set.** A board that supports sprints is
not proof the team works in them — plenty of teams leave a scrum board on an
open-ended sprint and pull continuously, which is kanban with a sprint object
attached. `init` still asks, with the finding as the default; **whichever way
the team answers wins.**

> **The response key is `sprints`, not `values`.** (Measured 2026-08-20.)
> ```json
> { "isLast": true, "maxResults": 50, "total": 1, "startAt": 0, "sprints": [ … ] }
> ```
> Reading it the way the REST docs describe returns **zero, with no error, and
> the mode is misdetected as kanban.** This was hit for real during
> verification.

### 4. Collect the issue types by hierarchy level

JQL has no syntax for filtering on `hierarchyLevel`, so **store them as lists of
ids**.

```bash
curl -s -u "$EMAIL:$TOKEN" ".../rest/api/3/issuetype"   # each entry carries hierarchyLevel
```

### 5. The only things to ask

| Item | Where it comes from |
|---|---|
| Mode / sprint length / columns / points field / issue types | discovered above |
| `locale` | `locale` from `GET /rest/api/3/myself` |
| Priority | use Jira's five levels (Highest…Lowest) as they are |
| **The type to file improvements as** | **← ask.** Offer the list and let them pick (stored as `types.create_as`). Nothing in the API says which of the types means "Task" |
| **The DoD** | **← a team agreement, so nothing can substitute for it. The only other question** |

Labels, templates and classifications are **not created** — the existing ones
are used. The DoD lives in `.agile/definition_of_done.md`, as on GitHub.

## Configuration

```yaml
backend: jira
capabilities:
  status_write: false        # column moves happen in Jira
  field_write:  false        # priority, estimates and sprint membership too
  delete: true               # W12
  points: true               # false when estimation could not be discovered
  sprint: true
  builtin_retro_board: true  # work in Jira, stickies in this repository's Issues.
                             # false where the repository has Issues disabled
jira:
  site: <site>.atlassian.net             # the host, without a scheme or a path
  project_key: EN
  board_id: 1
  project_style: team-managed        # from whether the URL has /c/
  board_url:   https://…/jira/software/projects/EN/boards/1
  backlog_url: https://…/jira/software/projects/EN/boards/1/backlog
  columns:                            # keep columnConfig's order exactly.
                                      # `name` is for display only — never put it
                                      # in JQL. Filter on status_ids
    - { name: "To Do",       status_ids: ["10001"] }
    - { name: "In Progress", status_ids: ["10002"] }
    - { name: "In Review",   status_ids: ["10003"] }
    - { name: "Done",        status_ids: ["10000"] }
  points_field: customfield_10016
  native_wip: none                    # constraintType. Anything else ⇒ ignore wip_limit
  types:
    work:    ["10003", "10004", "10006"]   # hierarchyLevel = 0 (ids, for reading via JQL)
    subtask: ["10002"]                     # -1
    epic:    ["10001"]                     # 1 (excluded from counting)
    create_as: "タスク"                     # the display name passed to --type when creating.
                                           # Ids will not work; the localised name is required
```

## The operations

These answer R1–R6 and W1–W14 in the contract (`README.md`). Answer every row.
**Measured 2026-08-19/20 against a live team-managed instance (acli 1.3.23).**

### R1 — list by condition

```bash
acli jira workitem search --jql "<expression>" \
  --fields "summary,status,assignee,priority,issuetype,labels" --json --paginate
```

**Do not ask for `key`.** `key` and `id` always arrive at the **top level**, not
inside `fields`. Passing `--fields key` alone returns `[null, null, null]`.

Only nine fields can be displayed (see "acli's read limits" in `README.md`).
**Filtering is not restricted**, so a field that cannot be displayed can still
be used in JQL.

| Purpose | JQL (**every clause run against the live instance**) |
|---|---|
| The board | **two queries — see below** |
| The backlog | `project = <KEY> AND issuetype in (<work ids>) AND sprint is EMPTY AND statusCategory != Done` |
| Stalled | the above plus `AND statuscategorychangeddate <= -<stale_days>d` — **not `updated`, see below** |
| Completed | `AND statusCategory = Done AND statuscategorychangeddate >= -<n>d` |
| Children of a parent | `AND parent = <KEY>` |

#### Stall is measured on the column, never on `updated`

`updated` moves for **any** change, a comment included — so writing the blocker
down is itself what hides it. Measured 2026-08-23 on the item that had genuinely
sat in review for eight days:

```
statuscategorychangedate = 2026-08-15   ← 8 days in review
updated                  = 2026-08-23   ← our own blocker comment
```

```
project = EN AND statusCategory = "In Progress" AND updated <= -7d
  → no results                                   ← the stall is gone
project = EN AND statuscategorychangeddate <= -7d
  → EN-4 (レビュー中), EN-5 (To Do)               ← both, correctly
```

**The daily reliably erases the very stall it just recorded**, and the more
diligently a team notes its blockers the more thoroughly they disappear. Nothing
errors; the warning simply stops firing.

`statuscategorychangeddate` measures **time in the current status category**,
which is what "stalled" means. Note the spelling: the JQL name doubles the `d`
(`…changeddate`) while the field on a read is `statuscategorychangedate` with
one. Both were checked against the instance.

> **Category, not status.** A move within the same category — one in-progress
> status to another — does not reset it. That is the behaviour wanted here: the
> work has not left the middle of the board.

**Exclude Epics (`hierarchyLevel = 1`) by leaving them out of `issuetype in
(…)`** — never in a list, never counted towards WIP or completion (parent and
child would be counted twice).

#### Anything scoped to a sprint needs two queries

**JQL's `sprint` does not match sub-tasks.** Not in any form — measured
2026-08-22 on a sprint holding one story and its two sub-tasks:

```
project = EN AND sprint in openSprints()   → ['EN-3']            ← the story only
project = EN AND sprint = 1                → ['EN-3']
project = EN AND sprint is not EMPTY       → ['EN-3']
project = EN                               → ['EN-3','EN-4','EN-5']
```

**The sub-tasks carry the field** — `EN-4`'s Sprint value is `EN Sprint 1` — so
this is not missing data. JQL simply does not match sub-tasks on it.

**This matters more than it looks.** Sub-tasks are the units moved day to day,
so a single sprint-scoped query returns the containers and none of the work: the
board comes back looking almost empty, with no error to explain it.

So every sprint-scoped read is two steps:

```bash
# 1. the parents in the sprint
acli jira workitem search --jql "project = <KEY> AND issuetype in (<work ids>) \
  AND sprint in openSprints()" --fields "summary,status,assignee,priority,issuetype,labels" --json --paginate

# 2. their children, by key
acli jira workitem search --jql "project = <KEY> AND parent in (<keys from step 1>)" \
  --fields "summary,status,assignee,priority,issuetype,labels" --json --paginate
```

Applies to `/agile:board`, `/agile:standup` and `/agile:sprint-close` alike —
**anywhere the current sprint is the scope.** The backlog query is unaffected
(sub-tasks do not belong there anyway).

#### The sprint field is a list, and it accumulates

An item carried from one sprint to the next holds **both**, oldest first —
measured 2026-08-23 on an item that crossed one boundary:

```
EN-3   sprint=['EN Sprint 1', 'EN Sprint 2']
```

It is a history, not a pointer. **Reading it as a single value returns the
sprint the item started in**, which is exactly wrong and gets wronger the longer
something is carried — the items most likely to be misread are the ones already
in trouble. Match on the whole list, or take the last entry; and prefer
`sprint in openSprints()` over comparing names at all, which sidesteps it.

The same shape is why closing does not empty a sprint: the closed one stays in
the list beside the open one.

#### And a sub-task cannot be carried over on its own

A sub-task's sprint **follows its parent**. All three items in the measurement
report the identical sprint object, and none of them can be filtered on it —
which is the same fact seen from two sides.

**`/agile:sprint-close`'s carry-over does not work item by item here.** Where an
unfinished sub-task's parent is finished, returning "the unfinished work" to the
backlog is not available: the only thing that moves is the parent, and moving it
takes the completed story along with it.

Say so and offer the two real choices rather than picking one:

| | |
|---|---|
| **Detach the sub-task** | Convert it to a standalone item, which then owns its own sprint field and can be carried on its own |
| **Carry the parent** | Reopen the parent and take the whole family across — which also clears the finished-parent-with-open-children warning |

**This is the team's call, not ours** — and on JIRA we cannot make either move
anyway (`field_write: false`), so it is a question and a pointer to the backlog
screen.

#### Ask it **before** closing, because afterwards the work disappears

Closing does not empty the sprint (W9), and the two facts compound. A sub-task
left unfinished under a finished parent, in a closed sprint, is reachable from
**neither** board:

```
EN-3  story, 完了    ── stays in the closed sprint
  └ EN-4  レビュー中  ┐ a sub-task never appears in the backlog on its own
  └ EN-5  To Do      ┘ and the parent it follows is finished
```

The board shows the active sprint, which this is not. The backlog lists work
items, which sub-tasks are not. **Nothing errors and nothing is flagged** — the
work is simply gone from every screen the team looks at, and the only way back
is to know the keys.

So `/agile:sprint-close` puts the carry-over question **before** the close, with
the consequence stated: unfinished sub-tasks under a finished parent will not be
findable afterwards unless one of the two moves is made first. Once the sprint
is closed, the same advice still applies but the team has to go and find the
items to act on it.

**And once it has happened, the backlog URL is the wrong thing to hand over.**
Pointing at the screen where the work should be is useless when the reason it
needs fixing is that it is not on that screen. **Give the item's own address**,
`<site>/browse/<KEY>`, one per stranded item — that is the only door left. The
backlog URL still belongs in the message, for the moves that do happen there;
it just cannot be the whole of it. **Measured 2026-08-23**, where the first
instruction of a four-step repair could not be started from the screen the
instructions named.

> **This is the failure the Definition of Done catches from the other end.**
> A parent finished while its children are open is exactly what produces it, so
> a team that has run into it once usually wants the DoD line as well.

> A misspelling makes JQL **error** rather than pass quietly. One query against
> a non-existent field returns the values that project actually accepts.

### R2 — one item, every field

```bash
acli jira workitem view <KEY> --fields "*all" --json    # 51 fields, incl. parent / updated / customfield_*
```

**No batching — one item at a time.** Parent nesting and the points total need
it, so **keep it out of the daily paths** (see the call-count table in
`README.md`).

### R3 — merged pull requests

The code lives outside Jira, so this is **backend-independent** — the same as R3
in `github.md`. Note that **linking a PR to an item only works when the item's
key is in the commit message.**

### R4 — sprints

```bash
acli jira board list-sprints --id <board_id> --json
acli jira sprint view --id <sprint_id> --json
```

The one at `state: active` is the current sprint; `startDate` and `endDate` give
the length. (Mind the `sprints` key — see init step 3.)

### R5 — parent and child

**`parent` is not in `search --fields`'s allowlist.** Two ways round it:

- query per parent with `--jql "parent = <KEY>"` (one call per parent)
- read `fields.parent` from `view --fields "*all"`, one item at a time

### R6 — auth and project identity

```bash
acli jira auth status
curl -s https://<site>/rest/api/3/serverInfo          # 200 unauthenticated; validates the URL
```

### W1 — create

```bash
acli jira workitem create --project <KEY> --type "<types.create_as>" \
  --summary "<title>" --description "<body>" --label <label>
```

**`--type` takes the localised display name** (`--type "Task"` is rejected — see
"How things are classified" above). `--parent <KEY>` sets a sub-task's parent.

**`additionalAttributes` in `--from-json` is the only way to set arbitrary
fields** (priority, estimate, sprint and so on); `--generate-json` prints a
template. For several at once, `create-bulk --from-csv` / `--from-json`.

### W2 / W3 — edit, and change type

```bash
acli jira workitem edit --key <KEY> --summary "<new title>" --description "<new body>" --yes
acli jira workitem edit --key <KEY> --type "<display name>" --yes
acli jira workitem edit --key <KEY> --labels a,b --remove-labels c --yes
```

`--jql` and `--filter` allow bulk edits (**show them before running them**).

### W4 / W5 / W8 — priority, estimate, sprint membership: **acli cannot change these**

**Measured: `edit` has no flag for any of them, and its `--from-json` schema does
not include them either** (it accepts assignee, description, issues,
labelsToAdd, labelsToRemove, summary and type, and nothing else).
`additionalAttributes` exists **only on create**. `acli jira sprint` has no
command for moving items in or out.

So **JIRA treats these the same way it treats `status_write`**:

```yaml
capabilities:
  status_write: false
  field_write: false     # no priority, estimate or sprint membership either
```

**The damage is small.** `/agile:sprint-start` always worked by opening the
backlog screen, letting the team move things, and re-reading what they chose —
on Jira that maps directly onto **dragging into a sprint on the native backlog**.
Priority changes in `/agile:backlog` become the same kind of thing.

**Reading back is unaffected**, so inspection, warnings and facilitation — the
actual product — are untouched.

> A token would allow writing these over REST, but that overturns the decision
> not to require a token for everyday use (`README.md`), so it is not taken.

### W7 — finish and withdraw

**Not performed** (see below).

### W9 — create a sprint, set its goal, close it

```bash
acli jira sprint create --board <board_id> --name "Sprint 6" --start <ISO> --end <ISO>
```

**`create` starts the sprint** — it comes back `state: active`, not `future`, so
nothing further is needed to make the board show it.

**Jira has a dedicated goal field** (GitHub has to borrow the milestone's
description).

#### Every `update` is a replace, whatever is being changed

`update` is not a patch. **Name, start, end and state all have to be present
every time**, whether the point of the call is the goal or the close:

```
✗ スプリントのステータスが必要です        ← setting only --goal
✗ スプリントの開始日を指定してください。   ← setting only --state
```

**Note what that is: acli's own error, in the instance's language.** It is a
measurement like any other localised value — do not match on its text, and do
not translate it when quoting it.

So **every** sprint update is read-then-resupply:

```bash
acli jira sprint view --id <sprint_id> --json      # name, startDate, endDate, state

# set the goal — the state has to come along even though it is not changing
acli jira sprint update --id <sprint_id> \
  --name "<name>" --start "<startDate>" --end "<endDate>" \
  --state active --goal "<sprint goal>"

# close it — same shape, state is what changes
acli jira sprint update --id <sprint_id> \
  --name "<name>" --start "<startDate>" --end "<endDate>" --state closed
```

**Read first, then send everything back.** Anything left out is not preserved,
it is rejected — which is the safer of the two failures, but it does mean a
sprint's own values have to be in hand before touching any one of them. Pass the
dates back exactly as they were read. **Closing early is normal** — a
sprint finished on the 22nd whose `endDate` is the 27th keeps the 27th, and the
minutes are where the real dates belong.

#### Closing does **not** empty the sprint

**Measured 2026-08-23 on a real close.** Unfinished items keep the sprint field
and it simply changes state with them:

```
EN-3  完了       sprint: EN Sprint 1 (closed)
EN-4  レビュー中  sprint: EN Sprint 1 (closed)   ← unfinished, still there
EN-5  To Do      sprint: EN Sprint 1 (closed)   ← unfinished, still there
```

Jira's own UI asks where to send unfinished work; `acli` does not, and there is
no equivalent flag. **So the carry-over is a question asked before closing, not
a clean-up performed afterwards** — see the next section for why afterwards is
too late.

### W10 — link a child to a parent

Pass `--parent <KEY>` at creation. `fields.parent` is first-class, so none of
GitHub's body markers are needed.

### W11 — comment

```bash
acli jira workitem comment create --key <KEY> --body "<text>"
```

### W12 — delete

```bash
acli jira workitem delete --key <KEY> --yes
```

The reverse of GitHub: **deleting is ordinary here, and withdrawing (a state
change) is what cannot be done.** Follow `/agile:issue`'s "prefer withdrawal"
principle by **pointing at withdrawal in their own UI first**, and only delete on
an explicit request.

### W13 — initialise

**Create nothing.** Use the existing statuses, priorities and issue types (see
"init" above).

### W14 — set or clear the assignee

```bash
acli jira workitem assign --key EN-4 --assignee "someone@example.com"
acli jira workitem assign --key EN-4 --assignee "@me"
acli jira workitem edit  --key EN-4 --remove-assignee
```

**An email or an account id — never a display name**, which is the same rule as
everywhere else here. `@me` resolves to the authenticated account and is what
"I'll take it" becomes when the person saying it is the one running the command.

**One assignee, and only one.** Jira's field is single-valued, so a second
`assign` **replaces** the first rather than adding to it — a pair or a mob loses
everyone but one, with no error and nothing on screen to show it happened. Put
the first person named on the item and **keep the rest in the comment**; see
"W14 holds a different number of people on each backend" in `README.md`.

**This is not blocked by `field_write: false`.** That covers priority, estimates
and sprint membership, none of which acli can write; assignment it can. A team
whose columns we cannot touch can still have its daily recorded.

### Moving columns and finishing (W6 / W7)

**Not performed.** What a skill does under `capabilities.status_write: false` is
defined in `README.md`.

Changing state in Jira is a workflow transition: only transitions allowed from
the current status can run, and some of them have required fields. That breaks
this plugin's assumption that an item can move to any of five columns. And **the
team is already moving cards in Jira**, so there is nothing to take over.

(`acli jira workitem transition` does exist, so a change of policy is
implementable.)

## Opening a screen (URL parameters)

**Jira's board switches lanes by URL too.** What `docs/open-board.md` does with
`?view=board&lane=assignee` maps straight onto `groupBy` — **the structure of
opening a screen is identical to GitHub's; only the spelling of the URL
differs.**

```
https://<site>/jira/software/projects/EN/boards/1?filter=&groupBy=none
                                                           └ assignee / subtask
```

| Our lane | Jira | When |
|---|---|---|
| `lane=assignee` | `groupBy=assignee` | the daily (`/agile:standup`) |
| `lane=parent` | `groupBy=subtask` (**to be confirmed**) | breakdown, per-story progress |
| none | `groupBy=none` | the plain board |
| `lane=expedite` | **no equivalent** (kanban's expedite lane is label-driven) | — |

The calling skill **always states `groupBy`** (omitting it leaves whatever was
selected last time), exactly as on GitHub. For the backlog, open `backlog_url`
rather than `board_url`.

## KPT

**Decided 2026-08-19: no retro items and no retro board are created inside
Jira.** `retro.board: external` is JIRA's default.

The reason is that **the board's display is decided by the team's filter, not
ours.** Stickies created in the same project land on their real board and
backlog, and the only way to hide them is to rewrite their filter — against the
"do not touch their environment" line drawn by `status_write: false`. Archiving
was tried as a way out and **turned out to need Premium** (measured 2026-08-19;
it failed on a free/standard site).

Rejected alternatives:

| | Why not |
|---|---|
| A dedicated retrospective Jira project | Some organisations restrict project creation. Moving an adopted Try into the work project changes its key |
| A label, plus asking the team to edit the board filter | Needs permission (**team-managed may not expose an editable filter at all**), and is a permanent change to a shared asset that breaks silently when reverted |
| Coexist, and fold them away by archiving | **Archiving is Premium-only.** Measured failure |

**The flow and its rules live in `README.md`** ("The retrospective surface") —
the clipboard as the join, keeping the rounds separate, keeping the raw text in
the repository, and anonymity. **Only one thing is JIRA-specific: file only the
agreed Try, as an ordinary work item (W1). Never give it points**, so velocity
stays clean.

> The GitHub backend stays on `retro.board: builtin`, keeping board-ui's KPT
> screen and `type:kpt`. The only difference is that **hiding them works there
> because we write every query** (see `github.md`), and that does not hold on
> JIRA.

## Open questions

- Which scope name the agile endpoint
  (`/rest/agile/1.0/board/{id}/configuration`) actually needs — whether
  `read:jira-work` suffices or something finer-grained is required
- How `configuration` differs on company-managed
- The shape of `constraintType` when it *is* configured (how per-column min/max
  arrive)
- What `groupBy=subtask` actually groups by (per parent, or by whether something
  is a sub-task). Whether it matches our `lane=parent` is visible on screen
- Whether `groupBy=assignee` **lists sub-tasks as cards in their own right**.
  Assignee lanes at sub-task granularity are a deliberate divergence of ours, so
  if this does not line up, drop it on JIRA
- Whether `groupBy` takes other values (`epic`, perhaps)
