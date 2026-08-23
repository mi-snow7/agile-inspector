import { parseParentNumber, extractSection, parentMarker, sectionMarker, heading } from "./issueBody.js";

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got:      ${JSON.stringify(actual)}\n       expected: ${JSON.stringify(expected)}`); }
};

console.log("\n== 親リンク ==");
check("marker", parseParentNumber(`${parentMarker(12)}\n親: #12`), 12);
check("legacy 親:", parseParentNumber("親: #7"), 7);
check("legacy 親ストーリー:", parseParentNumber("親ストーリー: #3"), 3);
check("legacy 全角コロン", parseParentNumber("親ストーリー： #5"), 5);
check("無し", parseParentNumber("なにもない本文"), null);
// The point of the change: prose can be reworded / translated freely.
check("英語の散文 + marker", parseParentNumber(`${parentMarker(42)}\nParent: #42`), 42);
check("散文だけ書き換えられても marker が残る", parseParentNumber(`${parentMarker(9)}\n親issue → #9 を見てね`), 9);

console.log("\n== セクション抽出 ==");
const marked = [
  sectionMarker("intro"), "会員として、Xをしたい。なぜならYだから。", "",
  sectionMarker("ac"), "## 受け入れ条件", "- [ ] 条件1", "- [ ] 条件2", "",
  sectionMarker("detail"), "## 詳細", "背景メモ",
].join("\n");
check("marker: ac", extractSection(marked, "ac", "## 受け入れ条件").includes("条件1"), true);
check("marker: ac が detail を含まない", extractSection(marked, "ac", "## 受け入れ条件").includes("背景メモ"), false);
check("marker: detail", extractSection(marked, "detail", "## 詳細").includes("背景メモ"), true);

const legacy = ["会員として、Xをしたい。なぜならYだから。", "", "## 受け入れ条件", "- [ ] 旧条件", "", "## 詳細", "旧メモ"].join("\n");
check("legacy: ac", extractSection(legacy, "ac", "## 受け入れ条件").includes("旧条件"), true);
check("legacy: ac が detail を含まない", extractSection(legacy, "ac", "## 受け入れ条件").includes("旧メモ"), false);
check("legacy: detail", extractSection(legacy, "detail", "## 詳細").includes("旧メモ"), true);
check("セクション無し", extractSection("ただのテキスト", "ac", "## 受け入れ条件"), null);

console.log("\n== 見出しの言語 ==");
check("ja 見出し", heading("ja", "ac"), "## 受け入れ条件");
check("en 見出し", heading("en", "ac"), "## Acceptance Criteria");
check("未知の locale は en に落ちる", heading("fr", "ac"), "## Acceptance Criteria");
check("locale 未設定も en", heading(undefined, "ac"), "## Acceptance Criteria");
// The whole point: an English body must be readable by the same parser.
const enBody = [
  sectionMarker("ac"), heading("en", "ac"), "- [ ] shows the last 30 days", "",
  sectionMarker("detail"), heading("en", "detail"), "some background",
].join("\n");
check("en 本文: ac", extractSection(enBody, "ac", "## 受け入れ条件").includes("last 30 days"), true);
check("en 本文: detail が ac に混ざらない", extractSection(enBody, "ac", "## 受け入れ条件").includes("background"), false);
// The detail section carries its own heading line; stripping must not depend
// on the heading being Japanese.
check(
  "en 本文: detail の見出し除去",
  extractSection(enBody, "detail", "## 詳細").replace(/^##[^\n]*\n?/, "").trim(),
  "some background",
);

console.log("\n== locale を途中で切り替えたとき ==");
// A project switches to en with Japanese issues already filed. Sections are
// found by their marker, so the heading's language never matters — which is
// the whole reason the markers exist.
const oldJa = [sectionMarker("ac"), heading("ja", "ac"), "- [ ] 30日分が出る"].join("\n");
check("マーカーは言語に依存しない", extractSection(oldJa, "ac", null).includes("30日分"), true);
check("見出しだけの旧本文も読める", extractSection("## 詳細\n昔の書き方", "detail", "## 詳細").includes("昔の書き方"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
