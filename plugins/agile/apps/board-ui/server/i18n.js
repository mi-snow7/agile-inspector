/**
 * What the server says out loud, in the project's language.
 *
 * The board's own chrome has been translated since the beginning
 * (`web/src/i18n.ts`), but everything the *server* produces was written in
 * Japanese and never went through anything: the refusal when a WIP limit is
 * reached, the validation errors, the parent line in a sub-task's body, the
 * description on a `retro:<date>` label. An English project got a Japanese
 * toast on an English board, and the sub-tasks it created did not match the
 * ones already in the repository.
 *
 * Same shape as the web side on purpose — keyed on the English string, so an
 * untranslated one renders as itself rather than as a missing-translation
 * marker, and `en` is the fallback for a free-form `locale` that names some
 * third language.
 *
 * **The two versions of a message live next to each other**, which is the
 * point: the thing that goes wrong with translations here is one copy being
 * edited and the other left behind, and a reviewer can only catch that when
 * both are on screen at once.
 */

/**
 * `.agile/config.yml`'s `locale` is free-form — a team may put `ko` there and
 * every generated sentence follows it — but this app ships two languages, so
 * anything that is not `ja` renders in English. The single place that rule is
 * expressed; `routes/board.js`, `templates.js` and `routes/tasks.js` all had
 * their own copy of it before.
 */
export function uiLocale(cfg) {
  return cfg?.locale === "ja" ? "ja" : "en";
}

const ja = {
  "Run /agile:init in this project first.": "先に /agile:init を実行してください。",
  "A title is required.": "title は必須です。",
  "lane and title are required.": "lane と title は必須です。",
  "One of lane, title or body is required.": "lane / title / body のいずれかが必要です。",
  "A sub-task cannot be broken down further.": "サブタスクをさらに分解することはできません。",
  "This item is not in the sprint yet. Put it in one with /agile:sprint-start before breaking it down.":
    "この Issue はまだスプリントに入っていません。/agile:sprint-start でスプリントに入れてから分解してください。",
};

/** A message with no values in it. */
export function msg(lang, en) {
  return lang === "ja" ? (ja[en] ?? en) : en;
}

/** `Unknown lane: keep` — the lane name is data and stays as it is. */
export function unknownLaneMessage(lang, lane) {
  return lang === "ja" ? `不明なレーン: ${lane}` : `Unknown lane: ${lane}`;
}

/** Refusing a drag that would breach a WIP limit. `column` is the board's own
 * key (`doing` / `review`) and is not translated — it is the same word the
 * column header shows, which is English on both boards (see COLUMN_LABELS). */
export function wipLimitMessage(lang, column, limit, currentCount) {
  return lang === "ja"
    ? `${column} は上限 ${limit} 件です（現在 ${currentCount} 件）。`
    : `${column} is limited to ${limit} (currently ${currentCount}).`;
}

/** Refusing to finish a parent while children are open, naming the first few.
 * Issue numbers are identifiers, so only the sentence around them changes. */
export function openSubtasksMessage(lang, open) {
  const shown = open
    .slice(0, 3)
    .map((s) => `#${s.number}`)
    .join(", ");
  if (lang === "ja") {
    const more = open.length > 3 ? ` ほか${open.length - 3}件` : "";
    return `未完了のサブタスクが ${open.length} 件あります（${shown}${more}）。`;
  }
  const more = open.length > 3 ? `, and ${open.length - 3} more` : "";
  return `${open.length} sub-task${open.length === 1 ? " is" : "s are"} still open (${shown}${more}).`;
}

/** The description written onto a `retro:<date>` label. Label *names* are
 * fixed ASCII and never translated; descriptions follow the locale — see
 * `docs/backends/github.md`. */
export function retroLabelDescription(lang, round) {
  return lang === "ja" ? `振り返り: ${round} の回` : `Retrospective: ${round}`;
}

/**
 * The human-readable half of a sub-task's parent link.
 *
 * The machine-readable half is `<!-- agile:parent #N -->` and never changes.
 * This line is for a person looking at the issue on GitHub, so it follows the
 * locale — `docs/backends/github.md` W10 has said so all along while the code
 * wrote `親: #N` unconditionally.
 *
 * **Both spellings are still read back** (`parseParentNumber` in
 * `issueBody.js`), so sub-tasks written before this, or by a team that has
 * since switched languages, keep nesting under their parent.
 */
export function parentLine(lang, number) {
  return lang === "ja" ? `親: #${number}` : `Parent: #${number}`;
}
