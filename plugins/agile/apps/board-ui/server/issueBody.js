/**
 * Issue bodies carry two audiences: a person reading them on GitHub, and this
 * tool reading them back. Those used to be the same text — the parent link was
 * found by matching the literal word 親, the story intro by matching
 * "XとしてYをしたい。なぜならZだから。", the acceptance criteria by matching the
 * heading "## 受け入れ条件".
 *
 * What this tool still reads back is now small: a sub-task's parent link, and
 * a sub-task's 詳細 section. Story and Bug bodies are prose written from a
 * team-owned template (see templates.js) and nothing parses them, so they
 * carry no markers at all.
 *
 * That coupled the data format to one language, and it broke silently: reword
 * the sentence on GitHub and the card detaches from its parent, drops out of
 * its swimlane and stops counting toward WIP, with nothing to indicate why.
 * The parent marker had already reached its second spelling (親ストーリー: →
 * 親:) before this module existed.
 *
 * So the structure now lives in HTML comments, which GitHub renders as
 * nothing. The prose above them is free to be written, translated or reworded
 * without the parser noticing. Old bodies still parse — every reader falls
 * back to the original Japanese pattern.
 */

export const MARKER = {
  parent: "agile:parent",
  ac: "agile:ac",
  detail: "agile:detail",
  steps: "agile:steps",
  expected: "agile:expected",
  actual: "agile:actual",
};

const comment = (name, value) => (value == null ? `<!-- ${name} -->` : `<!-- ${name} ${value} -->`);

/** Visible section headings. The marker above each one is what the parser
 * reads, so these exist purely for the person looking at the issue — which is
 * exactly why they have to follow the locale rather than staying Japanese. */
export const SECTION_HEADINGS = {
  ja: {
    ac: "## 受け入れ条件",
    detail: "## 詳細",
    steps: "## 再現手順",
    expected: "## 期待する動作",
    actual: "## 実際の動作",
  },
  en: {
    ac: "## Acceptance Criteria",
    detail: "## Details",
    steps: "## Steps to reproduce",
    expected: "## Expected behaviour",
    actual: "## Actual behaviour",
  },
};

export function heading(locale, name) {
  // `locale` is free-form — a team may put anything there and the model will
  // follow it — but only these two exist in writing, so anything else is
  // English. Same rule as the board UI: Japanese when asked for, English
  // otherwise.
  return (SECTION_HEADINGS[locale] ?? SECTION_HEADINGS.en)[name];
}

export function parentMarker(number) {
  return comment(MARKER.parent, `#${number}`);
}

export function sectionMarker(name) {
  return comment(MARKER[name] ?? name);
}

/** `<!-- agile:parent #12 -->`, falling back to the visible parent line so a
 * sub-task whose marker was deleted by a hand edit on github.com still nests.
 *
 * Two spellings of that line exist because it follows `locale`: the Japanese
 * one ("親: #12", and the older "親ストーリー: #12") is what every sub-task
 * written before 0.2.2 carries, since the code emitted it whatever the
 * project's language was. **Both stay readable forever** — a repository that
 * switched languages holds a mixture, and so does one seeded before the fix.
 */
const PARENT_MARKER_RE = /<!--\s*agile:parent\s*#(\d+)\s*-->/;
const PARENT_LEGACY_RE = /親(?:ストーリー)?\s*[:：]\s*#(\d+)/;
const PARENT_EN_RE = /^\s*Parent\s*:\s*#(\d+)\s*$/m;

/** The heading a sub-task's 詳細 section had before it carried a marker.
 * Japanese because every body written then was, whatever the project's
 * language — a value measured against existing data, not a translation. */
export const LEGACY_DETAIL_HEADING = SECTION_HEADINGS.ja.detail;

/** Removes the parent link in every spelling it has ever been written in, so
 * what is left is the part a person wrote. Used when a sub-task has no
 * `agile:detail` section to read — one written before the section existed, or
 * edited straight on github.com. */
export function stripParentLines(text) {
  return (text ?? "")
    .replace(/<!--\s*agile:parent[^>]*-->/g, "")
    .replace(/^\s*親(?:ストーリー)?\s*[:：]\s*#\d+\s*$/gm, "")
    .replace(/^\s*Parent\s*:\s*#\d+\s*$/gm, "");
}

export function parseParentNumber(body) {
  const text = body ?? "";
  const m = text.match(PARENT_MARKER_RE) ?? text.match(PARENT_LEGACY_RE) ?? text.match(PARENT_EN_RE);
  return m ? Number(m[1]) : null;
}

/**
 * Everything from a section marker up to the next marker (or the end).
 * `legacyHeading` is the literal heading the section used to be found by, tried
 * only when the marker is absent.
 */
export function extractSection(body, name, legacyHeading) {
  const text = body ?? "";
  const marker = new RegExp(`<!--\\s*${MARKER[name] ?? name}\\s*-->`);
  const start = text.match(marker);
  if (start) {
    const from = start.index + start[0].length;
    const rest = text.slice(from);
    const next = rest.search(/<!--\s*agile:[a-z]+/);
    return (next === -1 ? rest : rest.slice(0, next)).replace(/^\n+/, "").trimEnd();
  }
  if (!legacyHeading) return null;
  const idx = text.indexOf(legacyHeading);
  if (idx === -1) return null;
  const rest = text.slice(idx + legacyHeading.length).replace(/^\n/, "");
  // Pre-marker bodies delimited sections with the next "## " heading.
  const nextHeading = rest.search(/\n## /);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trimEnd();
}
