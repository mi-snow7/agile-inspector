# Opening the visual board (internal procedure)

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> is said out loud. Every sample message in this file shows the **shape** of
> what to say, never its wording — do not echo the English.

**This is not a skill.** It is not invoked as a slash command — it is **the
procedure for opening a screen on the GitHub Issues backend**. Putting it under
`skills/` would list it in the slash menu and confuse people, so it lives in
`docs/` deliberately.

**Skills never read this file directly.** A skill reads
`docs/backends/<name>.md`, named by `backend:` in `.agile/config.yml`, and
arrives here from there — **only when `backend: github-issues`**. With
`backend: jira` there is no screen of ours to open, so Jira's own board URL is
opened instead (see "Opening a screen" in `docs/backends/jira.md`).

When a user asks for a screen, the entry point is `/agile:board` for the board,
`/agile:backlog` for the backlog and `/agile:retro` for the retrospective.

This starts the local web app (`apps/board-ui`) that allows editing stories and
breaking down sub-tasks by drag and drop. **The browser is never given a
token**: the local server runs the `gh` CLI and reads and writes GitHub Issues
directly — the same credentials and the same data as every skill.

## Which screen to open

The app has three screens, selected by the `view` parameter in the URL. **The
caller always states it** — omitting it restores the previous selection, which
may not be the screen that was intended.

| Screen | URL | For |
|---|---|---|
| Backlog | `http://127.0.0.1:5173/?view=backlog` | Planning: `/agile:backlog`, `/agile:refine`, item selection in `/agile:sprint-start` |
| Board | `http://127.0.0.1:5173/?view=board` | Execution: `/agile:board`, `/agile:standup`, breaking down sub-tasks |
| Retrospective | `http://127.0.0.1:5173/?view=retro` | The ceremony: `/agile:retro`, the retrospective inside `/agile:sprint-close` |

> **`?view=retro` is only for `retro.board: builtin`.** That setting decides
> where the retrospective happens — this screen, a whiteboard the team already
> uses, or the conversation — so **check it before opening anything**. Opening
> the built-in screen for a team that agreed on FigJam puts the round in the
> wrong place, and the cards written there are lost to everyone else.
> `skills/retro/SKILL.md` owns the decision; this file only says how the screen
> opens once it has been made.

**The retrospective is unlike the other two.** Everyone opens it on their own
machine and writes their own cards, so **participants run the skill themselves**
as well as the facilitator (`/agile:retro` → "join").

**A screen opened with `?view=retro` does not switch to the backlog or the
board.** The restriction is deliberate: participants should not have **a
write-enabled board one click away** in a meeting where a stray drag would move a
real item. And since the ceremony works by everybody writing at once, there is
nothing to go and look at anyway.

**The skill opens it instead.** Asked for the backlog mid-retrospective, open it
**as a separate screen**, following `docs/backends/` — board-ui's `?view=backlog`
on GitHub, Jira's backlog URL on Jira. **A switch inside the screen cannot know
the backend**; the skill does.

**Never specify whether the board is a sprint board or a kanban board** — the
app decides by reading `mode` from `.agile/config.yml`. One team never runs both
at once, so there is nothing to choose.

### Swimlanes (the optional `lane` parameter)

Board screen only. Omitted, it keeps the previous selection (none at all, the
first time). **Specify one only when a particular lane is the point.**

| URL | For |
|---|---|
| `?view=board&lane=assignee` | The daily (`/agile:standup`, sprint mode only) |
| `?view=board&lane=parent` | Breaking down sub-tasks, per-story progress (sprint mode only) |
| `?view=board&lane=expedite` | Checking urgent work (kanban mode only) |

Passing a lane the mode does not support does no harm — it falls back to none.
What the lanes are and when to use them belongs to "Swimlanes" in
`skills/board/SKILL.md`.

## Preconditions

If `gh auth status` is unauthenticated, or `.agile/config.yml` is missing, say
"run `/agile:init` first" and stop.

## Starting it

When a skill says "open the screen", the GitHub Issues backend **follows this
procedure as written**. On Jira, "open the native board URL" sits in the same
place — **the judgement about when to open and which lane to use is shared;
only the opening differs by backend.**

1. **Check whether it is already running — and whether that server is ours.**

   ```bash
   curl -s http://127.0.0.1:4174/api/config
   ```

   A connection error means it is not running: go to step 2. If it answers, the
   JSON carries `projectRoot`, `pluginRoot` and `version`, and **those must be
   checked**.

   | Check | Result |
   |---|---|
   | `projectRoot` matches the current project (`pwd`) and `version` matches this plugin | Reuse it. Go to step 5 |
   | Only `version` differs (an old server for the same project) | Stop and restart it — step 1b |
   | `projectRoot` differs (a server for another project) | **Do not kill it silently — ask first**, then step 1b |
   | `projectRoot` is **absent entirely** | An old server that does not report its identity. Since there is no way to tell whose it is, treat it as another project's: ask, then step 1b |

   The port is fixed at 4174 and `projectRoot` is fixed when the server starts,
   which means **a server started for another project will happily answer this
   project's requests.** Skip the check and the screen fills with another
   repository's issues, and dragging writes to that repository. All the user
   sees is "my issues aren't showing up", which leads nowhere.

   When it is another project's server, offer both options:

   > The board for `/path/to/other-project` is running. Stop it and switch to
   > this project? (Or, to use both at once, this one can start on another
   > port.)

1b. **Stop it, then start again.** `npm run dev` starts two things — the API on
   4174 and Vite on 5173 — so **kill both**. Killing only one leaves Vite
   serving the old plugin.

   ```bash
   lsof -ti tcp:4174 -sTCP:LISTEN | xargs -r kill
   lsof -ti tcp:5173 -sTCP:LISTEN | xargs -r kill
   ```

   **Kill by port, never by pattern.** `pkill -f vite`, `pkill -f node` and
   anything else that matches on a command line will take down whatever else the
   user happens to be running — another project's dev server, their editor's
   language server — with no warning and no way to tell what was lost. The ports
   above are ours; a process listening on one of them is ours by definition, and
   that is the whole reason the check exists. A pattern kill has already taken
   down an unrelated project's dev server here, which is why this is a rule
   rather than a preference.

   Confirm they are down before step 2.

2. **Locate the plugin's installation** — walk `../../apps/board-ui` relative to
   this file's own path (`plugins/agile/docs/open-board.md`). Where
   `${CLAUDE_PLUGIN_ROOT}` is available, prefer
   `${CLAUDE_PLUGIN_ROOT}/apps/board-ui`.

3. Install dependencies, first time only.

   ```bash
   test -d "<board-ui>/node_modules" || npm install --prefix "<board-ui>"
   ```

4. Pass **the user's current project directory** (wherever `.agile/config.yml`
   is — normally this session's working directory) as
   `BOARD_UI_PROJECT_ROOT`, and start `npm run dev` in `<board-ui>`.

   ```bash
   BOARD_UI_PROJECT_ROOT="$(pwd)" npm run dev --prefix "<board-ui>"
   ```

   This runs the server (API, `127.0.0.1:4174`) and the front end (Vite,
   `127.0.0.1:5173`) together and is long-running, so run it in the background.
   Check the startup log for errors before continuing —
   `curl -s http://127.0.0.1:4174/api/config` can take a few seconds to answer.

5. **Open the browser automatically.** Do not stop at printing a URL.

   ```bash
   open "http://127.0.0.1:5173/?view=board"          # macOS (?view=backlog / ?view=retro,
                                                     # or ?view=board&lane=assignee for a lane)
   # xdg-open "http://127.0.0.1:5173/?view=board"    # Linux
   # start "http://127.0.0.1:5173/?view=board"       # Windows
   ```

   Use `127.0.0.1`, never `localhost` — Vite's `server.host` is pinned to it,
   and `localhost` resolves to IPv6 `::1` in some environments, leaving the two
   ends disagreeing.

   Only where no suitable command exists, print the URL and ask the user to open
   it. (The server is started for this project, so opening it alongside another
   project means avoiding a collision with `BOARD_UI_PORT` and Vite's `--port`.)

## Stopping

If the user asks to stop it, terminate the background process that was started.
When another skill decided at step 1 that it was "already running" and skipped
this procedure, that skill **has no authority to stop it** — never kill a server
you did not start.

**The exception is a mismatch at step 1.** A server on a different version may be
killed without asking: it is looking at the same project, so nothing is lost, and
leaving it up serves a screen whose code is stale. A server for **another
project** is killed **only after asking** — two may be open on purpose, in which
case move one to another port with `BOARD_UI_PORT` and Vite's `--port`.

## Stance

- The server listens on `127.0.0.1` only, and the GitHub token is never handed to
  the browser. **This is a deliberate safety property** — do not expose it
  externally on request without a reason.
- Everything done on screen (dragging between columns, moving between priority
  buckets, adding and editing items, breaking down sub-tasks, writing KPT cards)
  acts on the same labels and issues as `/agile:board`, `/agile:issue` and
  `/agile:retro`, so chat and screen are always looking at the same data.
- Sprint planning (which stories go into the next sprint) and any automatic
  execution ("start work when it moves to In Progress") are **out of scope for
  this UI** — it is a visual board for people to look at and move, and nothing
  more.
