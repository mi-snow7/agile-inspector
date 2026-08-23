---
description: List the product backlog in priority order and open the backlog screen. Changes an item's priority on request. The stock-taking ceremony — estimating, splitting, clarifying acceptance criteria — belongs to /agile:refine.
---

# /agile:backlog — show the backlog and change priority

> **Speak the team's language.** `locale` in `.agile/config.yml` decides what
> this skill says out loud. Every example below shows the **shape** of a
> message, never its wording — do not echo the English.

Items not yet in a sprint, seen in priority order. What `/agile:board` does for
the board, this does for the backlog.

| Command | Subject | Owns |
|---|---|---|
| `/agile:board` | The board | Moving items between columns |
| **`/agile:backlog`** | **The backlog** | **Changing priority** |

**This command owns display and priority only.**

- Stock-taking that includes estimating, splitting and clarifying acceptance
  criteria is `/agile:refine`
- The rules for adding, editing and deleting are `/agile:issue` — if asked here,
  do not push back; follow `skills/issue/SKILL.md` and carry it out on the spot

## Mechanics

Queries, how priority is represented, and how the backlog is distinguished from
the board all live in `docs/backends/`. **Read only the file named by
`backend:`.**

## Preconditions

If `.agile/config.yml` is missing, say "run `/agile:init` first" and stop.
**If the backend's command-line tool is missing, or present but not
authenticated, those are different problems** — follow "Setup" in
`docs/backends/…` and stop. Telling someone to authenticate a tool they have not
installed sends them looking in the wrong place.

## Display

Fetch the open items that are not in a sprint and not on the board. **Exclude
sub-tasks** — they do not exist in the backlog, since they are created by
breaking down an item that has already been chosen for a sprint. Exclude retro
stickies as well; they are not work.

**Group by priority bucket.** Not every backend can store an arbitrary manual
ordering, so rank is expressed in four steps — high, mid, low, unset — and the
conversation is held at that grain rather than in "first, second, third".

```
high (2)
  ABC-12  📘 View my purchase history          pt:3  @taro
  ABC-18  🐛 Search results go blank on page 2
mid (1)
  ABC-20  🛠️ Upgrade to Node 22                pt:2
unset (1)
  ABC-22  📘 Favourites
```

- **Show the type** (Story / Task / Bug) on every row, so it is visible at a
  glance whether new features are piling up while debt and bugs slide.
- Show estimates where they exist, with a bucket total — a rough sense of
  capacity for the next sprint.
- **Say something when the shape is off**, such as many unset items or a growing
  high bucket: "there are 7 items at high — is every one of them really the top
  priority?" Never enforce it.

**Open the backlog screen as well** (`docs/backends/…`). The backlog is a thing
you compare items across and reorder, so it wants both the text list and the
screen.

> Where a backend has a real ranking field, prefer showing the order it already
> holds over inventing one. The four buckets are the floor, not the ceiling.

## Changing priority

Move the item between buckets. **A single item named explicitly needs no
screen** — finish it in text.

> **When `capabilities.field_write` is `false`, do not change it.** Priority is
> one of the three fields that backend does not let this tool write. Say where
> to change it, then **wait and re-read** — the display, the balance check and
> everything else on this page are unaffected.

**Do not put items into a sprint here.** That is planning, and `/agile:sprint-start`
does it while looking at velocity and the point total. Only if asked outright —
"put ABC-12 into this sprint" — treat it exactly as a move on `/agile:board`, and
add one remark that it is going in without capacity being considered.

## Stance

- Priority is **suggested, never decided** — it is a business call and belongs to
  the product owner.
- A skewed distribution or a pile of unset items is **pointed out only**. Never
  reassign priorities unasked.
- After a change, summarise in a line or two what moved to which bucket.
- "Tidy this up", "let's estimate", "this needs splitting" → point at
  `/agile:refine`. That is a ceremony that takes its time, and works at a
  different depth.
