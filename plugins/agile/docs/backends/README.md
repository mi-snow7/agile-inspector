# The backend contract (internal spec, shared by the skills)

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> is said out loud. **It is free-form** — follow whatever a team puts there.
> (The visual board ships Japanese and English only, and treats anything that is
> not `ja` as English; that limit is the board's, not this rule's.) Every sample message in this file shows the **shape** of
> what to say, never its wording — do not echo the English.

**This is not a skill.** It is the spec each `/agile:*` skill consults to learn
how items are read and written, and **only one file is ever actually read** —
the one named by `backend:` in `.agile/config.yml` (`github.md` or `jira.md`).
Loading every backend spec would put the mechanics of unused backends into
context on every invocation.

## Why they are separate

`SKILL.md` holds **the ceremony and the judgement** only. What to ask, in what
order to run it, where to stop — that is what a skill is; `gh issue edit
--add-label` is not. The immediate motive is to stop nine files from growing
every time a backend is added.

### Words that may not appear in a `SKILL.md`

| Not this | This |
|---|---|
| the `status:in-progress` label, `gh issue edit` | "move that item to the in-progress column" |
| `#12` | "that item", "the item in question" (identifiers only when displaying) |
| close it / remove the milestone | "finish it", "take it out of the sprint" |
| `type:story` | "Story" |

**The test is: would this sentence still be true on another backend?** If not,
it is mechanics, and it belongs in this directory.

## The operations

Every backend doc **answers every row** of this table. Anything it cannot
implement is declared as such — see Capabilities below.

### Reads

| | Operation | GitHub Issues | JIRA |
|---|---|---|---|
| R1 | List items by condition (state, column, type, priority, assignee, sprint, last update) | `gh issue list --json … --search` | `acli jira workitem search --jql … --json` |
| R2 | One item's body and comments | `gh issue view` | `acli jira workitem view` |
| R3 | What actually shipped in a period (merged PRs) | `gh pr list --state merged --search "merged:>=…"` | the same — the code lives on GitHub either way, so this is **backend-independent** |
| R4 | Sprints: all, current, past | `gh api repos/…/milestones` | `acli jira board list-sprints` |
| R5 | Parent and children | `gh api …/sub_issues` plus the body's parent line | `fields.parent` (first-class) |
| R6 | Auth state and project identity | `gh auth status` / `gh repo view` | `acli jira auth status` |

### Writes

| | Operation | GitHub Issues | JIRA |
|---|---|---|---|
| W1 | Create an item (with type and body) | `gh issue create --label type:*` | `acli jira workitem create` |
| W2 | Edit body and title | `gh issue edit --body` | `acli jira workitem edit` |
| W3 | Change type | swap the `type:*` label | the `issuetype` field |
| W4 | Change priority | swap the `prio:*` label | the `priority` field (**use Jira's own five levels**) |
| W5 | Change the estimate | swap the `points:*` label | the `customfield_*` discovered at init |
| W6 | **Move between columns** | swap the `status:*` label | **not performed** (`status_write: false`) |
| W7 | **Finish or withdraw** | `gh issue close --reason` | **not performed** (a transition on Jira) |
| W8 | Add to / remove from a sprint | `--milestone` / `--remove-milestone` | the Sprint field |
| W9 | Create a sprint, set its goal, close it | `gh api …/milestones` (POST / PATCH) | `acli jira sprint create` / `update` |
| W10 | Link a child to a parent | `gh api …/sub_issues` | pass `parent` at creation |
| W11 | Add a comment | `gh issue comment` | `acli jira workitem comment` |
| W12 | Delete an item | `gh issue delete` | `acli jira workitem delete` |
| W13 | Initialise the classification | create 21 labels | **create nothing** — use the existing statuses, priorities and types |
| W14 | **Set or clear the assignee** (**how many fit differs — see below**) | `gh issue edit --add-assignee` / `--remove-assignee` | `acli jira workitem assign` |

## Capabilities

Some backends **do not do** certain operations. Branching on the backend's name
would scatter `if jira` across the skills, so **the backend declares
capabilities and the skills read only those.**

```yaml
capabilities:
  status_write: false   # no W6/W7. Column moves belong to the other UI
  field_write:  false   # no W4/W5/W8. Priority, estimates and sprint membership too
  delete:       true    # W12
  points:       true    # W5 (false when there is nowhere to record them — no velocity)
  sprint:       true    # W9 (false disables the sprint skills entirely)
  builtin_retro_board: true   # see "The retrospective surface" below
```

**`/agile:init` writes all six, every time.** A backend's section shows its own
values, and the set is not optional or partial — **a config missing one of them
was written before that key existed**, which in practice means 0.1.x, which was
GitHub-only. So **an absent key reads as `true`**: that is what was true then,
and it keeps an old project working rather than silently switching a capability
off under it.

Never omit one to mean "not applicable". Write it with the value that holds.

**`field_write: false` covers exactly three things** — **priority (W4),
estimates (W5), and moving items in and out of a sprint (W8)**. Labels, titles,
bodies, assignees and types (W1–W3, W14) **can** still be written (measured: acli has
flags for those four alone). Do not read it loosely as "fields cannot be
written" and give up editing altogether.

**Its behaviour** is defined once, in the same shape as `status_write`:

- Asked to change one, **do not** — say in one line where it can be changed
  (wording rules below)
- **Still read it back.** Wait for "done", fetch the new state, and **confirm it**
- Inspection, warnings and facilitation carry on **exactly as they are**

The damage is smaller than it sounds. Item selection in `/agile:sprint-start`
was always "open the screen, let the team move things, re-read and confirm" —
**that flow does not change by a word on a backend that cannot write.**

### W14 holds a different number of people on each backend

**GitHub takes several assignees; Jira takes exactly one.** Pair and mob work
therefore cannot be recorded the same way, and the failure is silent — naming two
people on Jira keeps the last and drops the other with no error.

So the rule a skill follows is **"record who took it", not "assign them"**:

- Put on the item whoever the backend can hold — **the first named**, so the
  choice is the team's rather than an artefact of ordering
- **Say out loud that it holds one**, once, and put the others where they can be
  read — the comment the daily is writing anyway. Never let a name disappear
  quietly because a field was too narrow
- On a backend that holds several, assign all of them and say nothing

**Not a capability.** Nothing is unavailable — the work is owned either way, and
one is a perfectly good answer to "who do I ask about this". Adding a flag would
imply a skill should behave differently, and it should not: it records who took
the work and the backend keeps as much of that as it can.

**What a skill does when `status_write` is `false`** is likewise settled **here,
once**, not in each skill:

- Asked to move a column, **do not** — say in one line where to do it
- Inspection (WIP limits, stalls, replenishment) **continues** — reading is
  enough for all of it
- Told something is finished, record it (a comment, the minutes) and leave the
  state alone

#### How to word it

"I asked and it did not do it" reads as a missing capability. In truth **the
team was already moving those cards in that UI**, so nothing was taken away. The
wording is what decides which of those it feels like, so four rules:

| | |
|---|---|
| **Do not apologise, do not blame the constraint** | "due to workflow restrictions…" turns our situation into the user's problem. Say plainly that the board is theirs |
| **Claim only what was done** | If a comment was left, say a comment was left. Never say "recorded" when nothing was |
| **Say where to do it** | Not "please move it on the board" — give the board's URL, and the lane when it matters |
| **Say it once** | Repeating it every time is nagging. From the second time in a session, stay quiet and keep inspecting |

```
✗ To comply with workflow restrictions, please move the card on the board.
✓ Recorded as done in the minutes. Move the card in Jira when you like → <board_url>
```

> **Tidying KPT cards is outside `status_write`.** With `retro.board: builtin`,
> `/agile:retro` creates its own stickies and puts them away again — unlike
> moving somebody else's work, **this is only folding away what we made**, so it
> is allowed even at `status_write: false`. **How to put them away — closing, or
> a field — is the backend's business.**
>
> This once said "never close, always fold with a field". That rule was written
> for a backend that could not write state yet still held retro cards, and
> **that case no longer exists** — it was decided that JIRA would not store KPT
> at all (`jira.md`). **The rule had outlived its reason, so it went.** With
> `retro.board: external` there is nothing to put away in the first place.

## The retrospective surface (`retro.board`)

**An axis independent of `backend:`.** A GitHub team may well want FigJam.

| Value | Meaning |
|---|---|
| `builtin` | The KPT screen in `apps/board-ui`. Cards live in **this repository's GitHub Issues** |
| `external` | A whiteboard the team already uses (FigJam / Miro / Confluence whiteboard). **We open the URL and never call its API** |
| `chat` | No screen — run it in the conversation |

```yaml
capabilities:
  builtin_retro_board: true   # false ⇒ builtin cannot be chosen

retro:
  board: external             # builtin | external | chat
  url: https://…              # with external. **present = a fixed board / absent = ask each round**
```

**Whether `builtin` is available is a capability**, never a check on the
backend's name. `builtin_retro_board` asks **"does board-ui have anywhere to put
cards?"** — it is not a property of the work backend.

> **The built-in KPT board always stores in this repository's GitHub Issues.**

| Situation | `builtin_retro_board` |
|---|---|
| `backend: github-issues` | `true` (the same place the work lives) |
| **`backend: jira` and the repository has Issues enabled** | **`true`** (work in JIRA, stickies in GitHub Issues) |
| Not GitHub, or Issues disabled | `false` |

Decided once at init with `gh repo view --json hasIssuesEnabled`. **Never
guessed.**

`builtin` is offered even on `backend: jira` because it is **genuinely the
stronger option** there:

| | JIRA + KPT in GitHub Issues | An external board |
|---|---|---|
| Who wrote a card | ✅ each person writes under their own credentials | ❌ a flat list relayed by the facilitator |
| Structure, and history across rounds | ✅ survives as cards | only the raw text in the minutes |
| Tracing where a Try came from | ✅ **the JIRA item's background can carry the card's URL** | it cannot |
| Requires | **`gh` auth**, on top of Jira's | the board's URL |

**The price is a second authentication.** A team not on GitHub (GitLab, say)
cannot choose it and goes to an external board or `chat` — which is why it is
offered but **never the default**.

### Who asks, when, and what

| Skill | How often | Asks |
|---|---|---|
| `/agile:init` | once | **Which way to run it.** Saved to `config.yml`, which is committed (it is a team agreement) |
| `/agile:retro` | every round (step 0) | **This round's URL** (only with `external`) |

| Shown to the user | Stored | Offered when |
|---|---|---|
| Use this plugin's KPT board (**stored in GitHub Issues; needs `gh` auth**) | `board: builtin` | `builtin_retro_board: true` |
| Always the same board | `board: external` + `url: <given>` | always |
| A new one each retrospective | `board: external` (**no `url` written**) | always |
| Just in the conversation | `board: chat` | always |

**Say inside the choice that it needs authentication.** Finding out about
`gh auth login` afterwards means choosing again. With
`backend: github-issues`, `gh` is already in use, so the caveat is dropped.

**Making "a new one each time" an explicit choice is the point.** A missing
`url` alone cannot be told apart from "not configured yet", and the skill would
ask about it every single round.

### The opening of `/agile:retro` (step 0)

| Setting | Behaviour |
|---|---|
| `builtin` | Ask nothing. Open the KPT board |
| `external` with a `url` | "Shall we use `<url>`? If you made a new one, paste the link" |
| `external` without one | "Paste the link to this round's board." **Read the previous round's minutes and offer that URL for reference** |
| `chat` | Say nothing about links. Start from "write your Keeps and paste them here" |

**Never rewrite `config.yml` unasked.** Each round's URL lives in the minutes at
`.agile/retro/<YYYY-MM-DD>.md`, so "last time's board" is answerable from there
— no need to produce a `git diff` every fortnight.

**Update it only when the change is permanent** (Miro to FigJam, say), and only
after asking. Not writing silently is the same rule as every other write.

```
Recorded this round's URL in the minutes. Use this board from now on?
(yes → I'll update the setting / no → keep it to this round)
```

### Say plainly that `chat` is the weaker option

This ceremony works because **everyone writes at the same time, in silence**.
`chat` structurally puts the facilitator in the middle, so **the anchoring the
rounds exist to prevent comes straight back** — the loudest voice and the first
opinion pull everyone along.

It exists anyway because **a team that skips retrospectives for want of a tool is
the worse outcome.** It suits **teams of one to three** (where anchoring barely
applies) and asynchronous work. If four or more choose it, say once that a larger
group is more easily pulled by whoever speaks first — then follow their choice.

### Do not let the configuration fork

"Work in JIRA, KPT in GitHub Issues" is allowed, but **no `retro_backend:` key is
created.** The single line above — the built-in KPT board always stores in this
repository's GitHub Issues — is enough, so all that is added is one capability
flag.

**Skills read only `retro.board`.** Nothing anywhere has to reconcile where the
work lives against where the stickies live.

**An adopted Try always goes to the work backend** (`backend:`). Even with
stickies in GitHub Issues, the improvement task is created in JIRA — that is
where the work flows. **Always put the originating card's URL in the
background** (it is in the minutes too). Where the stickies and the item live in
different systems, that link is the only way back.

**Always record the URL actually used in that round's minutes**
(`.agile/retro/<YYYY-MM-DD>.md`). Six months later, which board belonged to
which round is not answerable from the config.

### With `external`, the join is the clipboard

**No whiteboard APIs are implemented.** Each tool adds its own auth and schema
and a permanent obligation to follow its changes, and all it buys is reading the
cards back. Instead, **the join is "select the stickies, copy, paste into
chat".**

```
external tool (diverge) → the model (converge, facilitate) → backend (execute)
    write stickies           group and classify              file only the
                             the pasted text                 agreed Try (W1)
```

The boundary falls cleanly — **arranging stickies is what people are good at**,
**reading a messy list and grouping it instantly is what the model is good at**,
**tracking state precisely is what the backend is good at**.

Rules:

- **Keep the rounds separate, and take K / P / T as separate pastes.**
  Keep → dig → Problem → dig → Try, **one paste per round**. Name the lane when
  asking ("select **only the Keep stickies** and copy them"). One combined paste
  destroys the premise that people write in silence to avoid anchoring, **and
  makes it impossible to recover which card belonged to which lane**
- **If a mixed paste arrives, do not guess.** Sorting cards into lanes by
  guesswork silently corrupts the minutes and the basis for choosing a Try. Say
  so and ask for it again ("Keep and Problem look mixed — could you select just
  the Keeps?"). Only where the tool emitted the lane headings itself and **the
  split is unambiguous**, say how you read it and confirm before continuing
- **Try is written before it is discussed, then pasted.** Opening straight into
  discussion lets the loudest voice lead. Write, paste, then discuss
- **Keep the raw pasted text in `.agile/retro/<YYYY-MM-DD>.md`.** That way even
  unadopted cards survive across rounds, and "this Problem has come up three
  times running" becomes sayable. **The archive ends up in the repository** —
  not in the backend, not in the whiteboard
- **Accept that it is anonymous.** `builtin` cards know who wrote them (each
  person writes under their own credentials); a paste is a flat list relayed by
  the facilitator, so "ask whoever wrote this" becomes something asked out loud
  — and **in a retrospective the anonymity is arguably a feature**
- **Only the agreed Try is filed.** Stickies themselves never enter the backend

> **Unverified**: whether the major whiteboard tools really paste selected
> stickies as plain bullets (this may vary by environment). **It degrades to
> reading them aloud or typing them**, so nothing structural rests on it — but
> the wording should already include "if it will not paste, just read them out".

## Identifiers

How an item is named in chat is the backend's business (`#12` on GitHub,
`EN-12` on Jira). **A `SKILL.md` never assumes the shape of an identifier** — it
says "that item", and uses the backend's notation only where something must be
displayed.

The same goes for linking from commit messages (the pre-fill in
`/agile:standup`): **how that link is spelled belongs to the backend.**

## Columns

| | How the columns are decided |
|---|---|
| GitHub | **We define them** — five fixed (Backlog / To Do / In Progress / In Review / Done) |
| JIRA | **Their board's columns, as they are.** Both the count and the names are theirs |

A `SKILL.md` never names a column. It says "the first column", "the in-progress
column", "the last column", and the real names come from the config.

## Configuration

The **shared part** of `.agile/config.yml` (`mode`, `locale`, `wip_limit`,
`stale_days`, `sprint.current`, `sprint.duration_days`, `retro.board`) is
backend-independent.

> **`sprint.current` is "the name of the current sprint"**, which is not
> necessarily a GitHub milestone. In 0.1.x this key was `sprint.milestone` —
> **accept either when reading, write only `sprint.current`**
> (`activeSprint()` in `board-ui/server/config.js` is the single implementation).

Backend-specific values go under a key named after the backend.

```yaml
backend: jira
jira:
  # jira.md owns what goes here
```
