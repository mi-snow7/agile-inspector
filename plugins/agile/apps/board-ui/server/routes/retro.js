import { Router } from "express";
import { gh, ghJson, getOwnerRepo } from "../gh.js";
import { loadPmConfig } from "../config.js";
import { hasLabel } from "../columns.js";
import { msg, retroLabelDescription, uiLocale, unknownLaneMessage } from "../i18n.js";

export const retroRouter = Router();

const KPT_LABEL = "type:kpt";
const KAIZEN_LABEL = "kaizen";
const ROUND_PREFIX = "retro:";
const LANE_LABEL = { keep: "kpt:keep", problem: "kpt:problem", try: "kpt:try" };
const CARD_LIMIT = 200;

/** Which round a card belongs to, e.g. "2026-08-11". Null for an adopted Try
 * created before rounds were labelled. */
function roundOf(issue) {
  return (issue.labels ?? []).find((l) => l.name.startsWith(ROUND_PREFIX))?.name.slice(ROUND_PREFIX.length) ?? null;
}

function laneOf(issue) {
  for (const [lane, label] of Object.entries(LANE_LABEL)) {
    if (hasLabel(issue, label)) return lane;
  }
  return null;
}

function today() {
  // Local date, matching what the user would call "today" while sitting in
  // the meeting. Only ever read once per request; the round a card gets is
  // whatever currentRound() settles on, so a retro running across midnight
  // keeps writing into the round it started in.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Which round the board is currently showing.
 *
 * Derived from the data — the newest round among open KPT cards — rather
 * than from the clock, for two reasons. Every participant opens this board
 * on their own machine, so a server-side "today" could disagree between
 * them (different timezones, or one of them crossing midnight); and a retro
 * that starts at 23:50 must keep collecting into the round it started in
 * rather than splitting in two. Falls back to today when no cards exist yet,
 * which is exactly the "new round starting now" case.
 */
function currentRound(kptCards) {
  const rounds = kptCards.map(roundOf).filter(Boolean);
  // YYYY-MM-DD sorts chronologically as a string.
  return rounds.length > 0 ? rounds.sort().at(-1) : today();
}

async function fetchOpen(label) {
  return (
    (await ghJson([
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      label,
      "--json",
      // body rides along so the detail panel can show and edit what a card
      // grew during the discussion, without a fetch per card.
      "number,title,labels,assignees,createdAt,body",
      "--limit",
      String(CARD_LIMIT),
    ])) ?? []
  );
}

const toCard = (issue, ownerRepo) => ({
  number: issue.number,
  title: issue.title,
  round: roundOf(issue),
  author: issue.assignees?.[0]?.login ?? null,
  url: `https://github.com/${ownerRepo}/issues/${issue.number}`,
  // What was said about this sticky, written while the group walked through
  // it. Empty on a card that has only ever been a one-line note.
  body: issue.body ?? "",
});

retroRouter.get("/retro", async (_req, res, next) => {
  try {
    const cfg = await loadPmConfig();
    if (!cfg) {
      res.status(400).json({ error: "not_initialized", message: msg(uiLocale(cfg), "Run /agile:init in this project first.") });
      return;
    }
    const ownerRepo = await getOwnerRepo();
    const [kptCards, adopted] = await Promise.all([fetchOpen(KPT_LABEL), fetchOpen(KAIZEN_LABEL)]);
    const round = currentRound(kptCards);

    const thisRound = kptCards.filter((i) => roundOf(i) === round);
    const lane = (name) => thisRound.filter((i) => laneOf(i) === name).map((i) => toCard(i, ownerRepo));

    // Anything still open from an earlier round that represents work the team
    // said it would try: an adopted Try (kaizen) that never got done, and a
    // Try card that was never converted or discarded. Both belong at the top
    // of the next retro — "we said we'd do this; what now?" — which is the
    // only thing that stops retrospectives from being write-only.
    //
    // Keep/Problem cards from earlier rounds are not shown: they are the
    // record of a past discussion, closed when that retro ended. Seeing one
    // here would mean a retro was abandoned midway, not that it needs
    // carrying forward.
    const carried = [
      ...adopted.filter((i) => roundOf(i) !== round),
      ...kptCards.filter((i) => roundOf(i) !== round && laneOf(i) === "try"),
    ].map((i) => ({ ...toCard(i, ownerRepo), adopted: hasLabel(i, KAIZEN_LABEL) }));

    res.json({
      repo: ownerRepo,
      mode: cfg.mode,
      round,
      lanes: { carried, keep: lane("keep"), problem: lane("problem"), try: lane("try") },
    });
  } catch (err) {
    next(err);
  }
});

// Labels are created per round rather than seeded by /agile:init, since a new
// one appears every retrospective. --force keeps it idempotent, so every
// participant's first card can safely try.
async function ensureRoundLabel(round) {
  const lang = uiLocale(await loadPmConfig());
  await gh([
    "label",
    "create",
    `${ROUND_PREFIX}${round}`,
    "--color",
    "ededed",
    "--description",
    retroLabelDescription(lang, round),
    "--force",
  ]);
}

function issueNumberFromUrl(url) {
  const m = url.trim().match(/\/issues\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

retroRouter.post("/retro/cards", async (req, res, next) => {
  try {
    const { lane, title, round } = req.body ?? {};
    if (!LANE_LABEL[lane] || !title?.trim()) {
      res.status(400).json({ error: "missing_fields", message: msg(uiLocale(await loadPmConfig()), "lane and title are required.") });
      return;
    }
    // The client sends the round it is displaying, so a card written at
    // 00:01 still joins the round the meeting started in.
    const target = round || today();
    await ensureRoundLabel(target);
    // Cards carry no milestone and no points:* on purpose — that is what
    // keeps them out of sprint-close's demo list and sprint-start's velocity
    // without either of those needing a filter. See skills/init/SKILL.md.
    const out = await gh([
      "issue",
      "create",
      "--title",
      title.trim(),
      "--label",
      KPT_LABEL,
      "--label",
      LANE_LABEL[lane],
      "--label",
      `${ROUND_PREFIX}${target}`,
      "--body",
      "",
    ]);
    // The url comes back too, so the browser can put the card on screen
    // without refetching — a refresh here would drag in everyone else's cards
    // mid-writing, which is the one thing this screen is built to avoid.
    res.json({ ok: true, number: issueNumberFromUrl(out), url: out.trim() });
  } catch (err) {
    next(err);
  }
});

retroRouter.patch("/retro/cards/:number", async (req, res, next) => {
  try {
    const number = req.params.number;
    const { lane, title, body } = req.body ?? {};
    const args = ["issue", "edit", number];
    if (title?.trim()) args.push("--title", title.trim());
    // Only when sent: a lane drag says nothing about the body and must leave
    // it alone. Empty string is a real value — it clears the notes.
    if (body !== undefined) args.push("--body-file", "-");
    if (lane) {
      if (!LANE_LABEL[lane]) {
        res.status(400).json({ error: "bad_lane", message: unknownLaneMessage(uiLocale(await loadPmConfig()), lane) });
        return;
      }
      // Read the current labels first: --remove-label on a label the issue
      // doesn't carry makes gh exit non-zero.
      const current = await ghJson(["issue", "view", number, "--json", "labels"]);
      for (const [key, label] of Object.entries(LANE_LABEL)) {
        if (key !== lane && hasLabel(current, label)) args.push("--remove-label", label);
      }
      args.push("--add-label", LANE_LABEL[lane]);
    }
    if (args.length === 3) {
      res.status(400).json({ error: "nothing_to_do", message: msg(uiLocale(await loadPmConfig()), "One of lane, title or body is required.") });
      return;
    }
    await gh(args, body !== undefined ? { input: body } : undefined);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Removing a sticky note from the board. Closing rather than deleting keeps
// the trail — a retro card that was written and then withdrawn is still part
// of what happened.
retroRouter.delete("/retro/cards/:number", async (req, res, next) => {
  try {
    const { comment } = req.body ?? {};
    const args = ["issue", "close", req.params.number, "--reason", "not planned"];
    if (comment?.trim()) args.push("--comment", comment.trim());
    await gh(args);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
