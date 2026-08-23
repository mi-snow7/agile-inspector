---
description: Initialise this project for agile management. Picks the backend, sets up whatever classification it needs, writes local settings (WIP limits, To Do minimum, stale threshold) to .agile/config.yml, places the item templates, and agrees the Definition of Done. Re-running on an initialised project touches nothing that exists and only adds what is missing.
---

# /agile:init — initialise the project

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

Set this project up so the other `/agile:*` commands have what they need: a
backend, the classification that backend requires, **local settings only** in
`.agile/config.yml`, the item templates, and an agreed Definition of Done. **Item
data itself is never stored locally.**

**Re-running is safe.** On an already-initialised project, existing labels,
settings, templates and the DoD are **left alone** and only what is missing gets
added. When a plugin update introduces something new under `.agile/`, running
this catches up.

## Mechanics

What the chosen backend needs — creating classifications, or discovering what
already exists — lives in `docs/backends/`. **Read only the file for the backend
being initialised.**

## 1. Agree the language, before anything else

**This is the first question, ahead of the backend.** Everything after it —
which tracker, the tooling check, the install instructions when a CLI is
missing — is spoken to a person, and getting that in the wrong language is a
bad first impression at the one moment there is nothing else to judge the tool
by.

**In "add what is missing" mode, ask nothing.** Read `locale` from the existing
`.agile/config.yml` and use it.

**Present the options as the language names themselves**, so the question is
readable whichever way it lands, with the one inferred from the conversation
marked as the default:

```
言語 / Language
  1. 日本語        ← 推測
  2. English
```

`locale` governs **both what this plugin says and what it writes** — templates,
label descriptions, item boilerplate.

**`locale` is free-form.** Anything can go there — `ko`, `de`, `zh` — and this
plugin will follow it. **The visual board ships two languages only**, Japanese
and English, and treats anything that is not `ja` as English. If a team picks a
third language, **say that once**: the conversation and everything written
follow their language, but the board's own buttons will be in English.

**This is changeable later.** Switching keeps existing items readable and does
not translate anything already written — only new text follows the new setting.
Mixed languages are hard on people though, so it is better decided up front.

**From here on, everything is said in that language.**

## 2. Decide the backend

Ask which system holds the team's work, unless the request already says. Then
follow that backend's initialisation section.

The shape differs fundamentally, and it is worth knowing which one you are in:

| | |
|---|---|
| **A backend with little taxonomy of its own** | **Create it.** The plugin defines the classification, because there is almost none to reuse |
| **A backend already in use** | **Discover and adapt.** The statuses, types and priorities are the team's. **Create nothing, rename nothing, and never ask them to change their workflow** — it is frequently a shared, admin-owned asset |

**Anything that requires negotiating with an administrator before first use puts
this tool out of reach of the teams it is for.** Where a discovery is not
available, degrade — run with fewer columns, or without velocity — and say what
was given up.

### Check its tooling before going further

Once the backend is chosen, **confirm its command-line tool is installed and
authenticated** — "Setup" in that backend's file has the commands and what to
say. **Stop here if it is not.** Everything below this point calls that tool, so
continuing produces a wall of `command not found` with no explanation.

**Installed-but-unauthenticated and not-installed-at-all are different
problems**, and the guidance differs. Do not conflate them: a team adopting Jira
will not have `acli` yet, which makes this the very first thing they hit.

## 3. Agree the mode

**In "add what is missing" mode, ask nothing.** Read `mode` from the existing
`.agile/config.yml` and use it.

If the request does not say, ask: "kanban (a continuous flow) or sprint (fixed
periods)?" Some backends can answer this themselves — take it from there and
confirm rather than asking cold.

**In sprint mode, confirm the sprint length too** ("how many days is a sprint?
e.g. 1 week / 2 weeks"). With no answer, default to 14. `/agile:sprint-start` and
`/agile:sprint-close` use it to calculate end dates.

## 4. Agree how retrospectives are run

Offer the choices defined in `docs/backends/README.md` ("Who asks, when, what")
and save the answer. **Where a choice needs an extra authentication, say so in
the choice itself** — finding out afterwards means choosing again.

This is a team agreement, which is why it lives in the committed config rather
than being asked every time.

## 5. Set up the classification

Follow the backend's section. **On a backend that creates its own**, this step is
idempotent and safe to run in "add what is missing" mode — only the absent pieces
appear.

Two rules hold wherever classifications are created:

- **Identifiers are fixed ASCII and are never translated.** Every skill, the
  board UI and every existing item match on those exact strings. Only the
  human-readable descriptions follow `locale`.
- **Do not invent a classification for something the backend already expresses.**
  The first and last columns are usually implicit — an item that has not started,
  and one that is finished — and giving them their own marker creates two sources
  of truth.

**With `retro.board: builtin`, the stickies need their classification too — and
it may not be in the same place as the work.** The built-in KPT board stores its
cards in this repository's GitHub Issues whatever `backend:` says, so on a
backend that lives elsewhere **this step runs twice**: the work classification
where the work is, and the sticky classification in the repository. Skipping the
second half leaves a board that was offered, chosen, and cannot run — the
failure only shows up at the first retrospective. `docs/backends/github.md` owns
the sticky classification in both cases; read its KPT section even when it is
not the work backend.

> **Retrospective stickies are not work.** Where they live in the same store as
> items, they must be excluded from the board, the backlog and every count. They
> carry no sprint and no estimate, so they fall out of velocity on their own. An
> adopted Try loses its sticky classification and joins the ordinary board as an
> improvement task — see `skills/retro/SKILL.md`.

**The hierarchy is two levels, as in Jira.** Story, Task and Bug are peers that
sit in the backlog and enter a sprint; a sub-task is a child of one of them and
never exists alone. **The units moved day to day are sub-tasks, and any Task or
Bug that was never broken down.**

## 6. Write the local settings

Create `.agile/config.yml`. **Settings only — never item data.**

**In "add what is missing" mode, do not touch it.** The values in it are the
team's decisions. Even if new keys have since been introduced, leave it: **every
unset key must work from its default.**

```yaml
mode: kanban            # kanban | sprint
backend: <chosen>
locale: ja              # free-form. Governs what is said and what is written.
                        # The board UI ships ja + en; anything else renders in English
capabilities:           # what this backend does — see docs/backends/README.md.
  status_write: true    # write all of them, always, with the backend's values;
  field_write: true     # a missing key is read as true, which is only correct
  delete: true          # for a config written before the key existed
  points: true
  sprint: true
  builtin_retro_board: true
retro:
  board: builtin        # builtin | external | chat
  # url:                # external with a fixed board
wip_limit:
  doing: 3              # limit on the in-progress column
  review: 3
  todo_min: 2           # below this, /agile:board prompts for replenishment
                        # kanban has no sprint boundary, so without a "pull now"
                        # signal the flow simply stops
stale_days: 7           # this long in the in-progress or review column → warn
sprint:                 # used only in sprint mode
  current: null         # the active sprint; set by /agile:sprint-start
  duration_days: 14
experimental:           # ⚠ under trial. These may change or disappear without
                        #   notice. If one disappears the behaviour reverts to
                        #   the default; items and labels are unaffected
  require_subtasks_done: false
                        # true prevents finishing a parent while sub-tasks remain
                        # open. Default false — Jira also lets you close a parent
                        # by default and expects a validator when you don't want
                        # that. Even at false, a finished parent with open
                        # children is flagged, and a parent closed directly in
                        # the backend cannot be stopped at any setting
```

Backend-specific keys go under a key named after the backend; that shape is
defined in its own file.

## 7. Place the item templates

Create `story.md`, `task.md` and `bug.md` under `.agile/templates/`.
**Skip any that exist; create only what is missing.** These are the starting
point for new items, read by both the board's create dialog and `/agile:issue`.
**Write them in the `locale` agreed in step 1.**

Offer them as a starting point and say they can be adapted — they are the
equivalent of Jira's item templates, and **can be edited at any time.**

`story.md` covers context and purpose, acceptance criteria, technical
constraints, what is out of scope, and links. **Out of scope earns its place** —
it is what stops requirements from swelling.

`bug.md` covers preconditions and environment, reproduction steps, expected
behaviour, actual behaviour, impact, and links. Two notes belong in it: **mask
tokens, passwords and real personal data** (items live forever), and **keep
speculation about the cause out of the report** — findings go in comments.

`task.md` deliberately has only four headings — why and what, **done when**,
impact and risk, links. Technical and operational work varies so much that more
headings guarantee empty ones. **Making the team write "done when" first is the
point**: refactors and dependency bumps are the work most likely to start without
anyone having decided where the finish line is.

> **Do not copy DoD items into "done when".** Criteria common to every item —
> "tests pass", "reviewed" — belong to `.agile/definition_of_done.md`. What goes
> here is only what makes **this** item finished.

> Acceptance criteria are **per item**; the template just leaves room for them.
> The DoD agreed in the next step is **common to all items**. They are different
> things (see `/agile:issue`).

## 8. Agree the Definition of Done

**If `.agile/definition_of_done.md` already exists, skip this step.** Something
already agreed does not get rebuilt (revisiting it belongs to `/agile:retro`).

**Agree it before development starts.** Without it, "there are no tests" and "it
wasn't reviewed" surface as rework. The DoD is not the specification of an
individual story (that is acceptance criteria, and `/agile:issue`'s business) —
it is **the quality and technical bar common to every item**.

Offer a starting point and let the team adapt it, or take it as-is. Where an
organisation has product-wide standards, encourage building on those.

```markdown
- [ ] Merged into the central repository
- [ ] Follows the coding standards (automated checks pass)
- [ ] Approved in code review by another developer
- [ ] All required tests pass
- [ ] Deployed to staging and working correctly
- [ ] Accepted by the product owner
```

Save it as `.agile/definition_of_done.md`. `/agile:board` refers to it when items
move towards review and done, and `/agile:retro` revisits it.

## 9. Closing message

**In "add what is missing" mode, lead with what was added and what was left
alone** — "added the three files under `.agile/templates/`; config.yml and the
DoD are unchanged" — then describe only the additions. What follows is for a
first initialisation.

- What was created or discovered, and **anything given up** because a discovery
  was unavailable
- The item templates, with a note that **they can be edited later**
- The agreed DoD
- How to file: `/agile:issue` (the type is judged from the request; a Story's
  acceptance criteria go in the body, and are **not** the DoD)
- What to run next: `/agile:issue`, `/agile:backlog`, `/agile:board`,
  `/agile:standup`, `/agile:refine`, `/agile:retro`
  - in sprint mode, prompt for `/agile:sprint-start` to begin the first sprint
  - in kanban mode, push the team to **decide how often they will run
    `/agile:retro`** — with no sprint boundary, an undecided cadence means it
    never happens
- One line on how columns and completion are represented on this backend
- **Push them to commit `.agile/` to git.** WIP limits, the DoD and the sprint
  length are team agreements, not personal preferences — untracked, whoever
  clones the repository has none of it, gets told to run `/agile:init`, and
  re-initialises with different values. For the DoD, "common to every item" stops
  being true at all. (Only the active sprint changes from sprint to sprint,
  producing a one-line diff at each start and close. That is normal.)
