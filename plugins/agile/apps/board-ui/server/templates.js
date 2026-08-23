import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadPmConfig, CONFIG_DIR } from "./config.js";
import { PROJECT_ROOT } from "./projectRoot.js";

/**
 * Issue bodies used to be assembled from a form: persona, feature, value, a
 * list of acceptance criteria, a description — five inputs before you could
 * file a story. Jira asks for a summary and a description and nothing else,
 * and filling in five boxes to produce one paragraph is the friction that
 * stops people filing issues at all.
 *
 * So a body is written, not composed, and what you start from is a template.
 * These are the built-in ones; `/agile:init` copies them to
 * `.agile/templates/<type>.md`, where the team owns them — the same
 * arrangement as `.agile/definition_of_done.md`, and for the same reason:
 * how this team writes a story is the team's call, not the plugin's.
 *
 * Deliberately free of `<!-- agile:* -->` markers. The two that matter
 * (agile:parent, agile:detail) belong to sub-tasks and are written by
 * tasks.js, never typed by a person. The section markers were only ever read
 * by the form that decomposed a story back into fields, which no longer
 * exists — and a file the team is invited to edit shouldn't carry invisible
 * comments that nothing reads.
 */
export const TEMPLATE_DIR = path.join(CONFIG_DIR, "templates");
export const TEMPLATE_TYPES = ["story", "task", "bug"];

/**
 * One entry per language, like INTRO_TEMPLATES in issueBody.js: adding a
 * language is adding a row here and nowhere else. These are only the
 * starting point — once init has written them out, the project's own files
 * win, in whatever language they were edited into.
 */
const TEMPLATES = {
  ja: {
    story: `## 背景・目的 (Context)
〈誰〉が〈何〉をできず困っている。これができると〈どんな価値〉がある。
- なぜこの開発が必要なのか？（ユーザーの課題解決、または技術的な理由）

## 受け入れ条件 (Acceptance Criteria)
- [ ] 〇〇の操作ができること
- [ ] 〇〇の条件下では適切なエラーが表示されること

## 技術的制約・考慮事項 (Tech Notes)
- 既存のシステムやAPIとの連携において注意すべきこと
- 想定されるエッジケース
- ※ ここは「守るべき制約」まで。設計や実装方針はサブタスク側に書く

## スコープ外 (Out of Scope)
- 今回のチケットでは「やらないこと」（※これがあると要件の肥大化を防げます）

## 関連リンク (References)
- デザイン: 
- API仕様: 
`,
    bug: `## 前提条件・環境 (Preconditions / Environment)
- 発生環境（本番 / ステージング / ローカル）、ブラウザ・OS・バージョン
- 使用したアカウント・権限、特定のデータ状態、APIのリクエストペイロードなど
- いつから / 頻度（毎回・たまに・一度だけ）
- ※ トークン・パスワード・実在の個人情報はマスクする（Issue は残り続けます）

## 再現手順 (Steps to Reproduce)
1. 
2. 
3. 

## 期待する動作 (Expected)
- 本来どうなるべきか

## 実際の動作 (Actual)
- 実際に何が起きたか（エラーメッセージ、ログ、スクリーンショット）
- ※ 原因の推測はここに書かない。調査結果はコメントへ

## 影響範囲 (Impact)
- 誰が・どれだけ困っているか
- 回避策の有無（※これが優先度の判断材料になります）

## 関連リンク (References)
- 該当のPR・コミット: 
- ログ・スクリーンショット: 
`,
    // Two of these four sections are the ones a Task actually fails on:
    // "done" is never defined (a refactor has no natural end), and the reason
    // to do it now is never written down (so it's carried over forever).
    task: `## 目的・概要 (Why & What)
- なぜ今これをやるのか（きっかけ、放置するリスク）
- 何をどう変えるのか（ざっくりとした作業方針）

## 完了条件 (Done when)
- [ ] 〇〇が動いている / 〇〇のライブラリに置き換わっている
- [ ] 既存の〇〇を呼んでいる箇所がすべて移行済み
- ※ 「終わったと言える状態」を先に書く。明確に書けない場合は、まず調査（Spike）タスクとして切る

## 影響範囲・リスク (Impact & Risk)
- デグレのリスクがある箇所、テスト時に重点的に確認すべきポイント
- （サーバー側や連携の変更がある場合）想定ダウンタイム、ロールバック手順

## 関連リンク (References)
- 設計メモ・関連Issue: 
`,
  },
  en: {
    story: `## Context
<who> can't <do what> today. Being able to gives them <what value>.
- Why is this worth building? (a user's problem, or a technical reason)

## Acceptance criteria
- [ ] <something> can be done
- [ ] under <condition>, a sensible error is shown

## Tech notes
- Anything to watch for around existing systems and APIs
- Edge cases to expect
- Constraints only — design and implementation notes belong on the sub-tasks

## Out of scope
- What this ticket deliberately does *not* cover (this is what keeps it from growing)

## References
- Design: 
- API spec: 
`,
    bug: `## Preconditions / Environment
- Where it happened (production / staging / local), browser, OS, version
- Account and permissions used, the data state, the request payload
- Since when, and how often (every time / sometimes / once)
- Mask tokens, passwords and real personal data — issues stick around

## Steps to reproduce
1. 
2. 
3. 

## Expected behaviour
- What should have happened

## Actual behaviour
- What happened instead (error message, logs, screenshot)
- Don't guess at the cause here — findings go in the comments

## Impact
- Who is affected, and how badly
- Is there a workaround? (this is what decides the priority)

## References
- PR / commit: 
- Logs, screenshots: 
`,
    task: `## Why & What
- Why now (what triggered it, what happens if it's left)
- What changes, roughly (the shape of the work)

## Done when
- [ ] <something> works / has been replaced by <something>
- [ ] every existing caller of <something> has been migrated
- ※ Write the finished state first. If you can't state it, cut a spike instead

## Impact & Risk
- Where a regression could hide; what to test hardest
- (For server or integration changes) expected downtime, rollback plan

## References
- Design notes, related issues: 
`,
  },
};

export function defaultTemplates(lang = "ja") {
  return TEMPLATES[lang] ?? TEMPLATES.ja;
}

/**
 * What a new issue of each type starts from: the project's files if it has
 * them, otherwise the built-ins for the configured language — so a project
 * initialised before templates existed still gets a sensible starting point.
 *
 * Read per request rather than cached, so editing the markdown takes effect
 * without restarting anything, the same way config.yml does.
 */
export async function loadTemplates(cwd = PROJECT_ROOT) {
  const cfg = await loadPmConfig(cwd);
  const fallback = defaultTemplates(cfg?.locale === "ja" ? "ja" : "en");
  const entries = await Promise.all(
    TEMPLATE_TYPES.map(async (type) => {
      try {
        const raw = await readFile(path.join(cwd, TEMPLATE_DIR, `${type}.md`), "utf8");
        // An empty file is a legitimate choice — "start me from nothing" —
        // where a missing one only means the project predates templates.
        return [type, raw];
      } catch (err) {
        if (err.code === "ENOENT") return [type, fallback[type]];
        throw err;
      }
    }),
  );
  return Object.fromEntries(entries);
}
