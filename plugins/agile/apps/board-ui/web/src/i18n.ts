/**
 * Two languages, keyed on the English string.
 *
 * `.agile/config.yml`'s `locale` is free-form — the model follows whatever a
 * team puts there, Korean included — but this screen ships Japanese and
 * English only. The server collapses anything that is not `ja` to `en`, so
 * **English is the fallback**, which is also why the keys are the English
 * text: a string with no Japanese entry renders as its own key rather than as
 * a missing-translation marker.
 *
 * Deliberately not a library. There are two languages and no plurals, dates or
 * interpolation beyond what a template literal already does, so a Map and a
 * function are the whole requirement — and this way nothing is added to what
 * the board downloads.
 */

export type Locale = "ja" | "en";

/**
 * Module-level rather than React state, deliberately. `locale` comes from
 * `.agile/config.yml` — a committed team agreement, not a per-person
 * preference — so it cannot change while the board is open, and there is no
 * language switcher to build. Introducing a context to re-render on a change
 * that cannot happen would be machinery for a requirement we decided against.
 * If a switcher is ever wanted, this is the thing to replace.
 */
let current: Locale = "en";

/**
 * Set once, from the board payload, before anything renders text.
 *
 * **Anything that is not `ja` becomes `en`**, including a field the server
 * did not send. That is not defensiveness for its own sake: the parameter was
 * typed `Locale` and assigned straight through, so when `/api/board` turned
 * out not to carry `locale` at all, `current` became `undefined` — and
 * `t()`'s `current === "en"` test then failed for every string, rendering the
 * whole board in Japanese whatever the project had chosen. TypeScript could
 * not see it because the lie was in the JSON, not in the call. Normalising
 * here means the worst a missing field can now do is fall back to English.
 */
export function setLocale(locale: Locale | undefined) {
  current = locale === "ja" ? "ja" : "en";
}

export function getLocale(): Locale {
  return current;
}

const ja: Record<string, string> = {
  // Navigation and board chrome
  Backlog: "バックログ",
  Board: "ボード",
  "Sprint board": "スプリントボード",
  "Kanban board": "カンバンボード",
  Retrospective: "ふりかえり",
  "Switch view": "画面切替",
  Swimlane: "スイムレーン",
  Reload: "再読込",
  Refresh: "更新",
  Close: "閉じる",
  Cancel: "やめる",
  Save: "保存",
  Add: "追加",
  Create: "作成",
  Delete: "削除",
  Edit: "編集",
  None: "なし",
  Unknown: "不明",
  "More actions": "その他の操作",
  "Error: ": "エラー: ",

  // Columns
  "To Do": "To Do",
  "In Progress": "In Progress",
  "In Review": "In Review",
  Done: "Done",

  // Lanes
  "By assignee": "担当者",
  "By parent": "親課題",
  Expedite: "特急",
  Standard: "標準",
  Background: "バックグラウンド",
  Unassigned: "未割り当て",
  "Other items": "その他の課題",
  "🚨 Expedite — drop everything else": "🚨 特急（Expedite） — 手を止めてでも最優先",
  "Standard — ordinary development work": "標準（Standard） — 通常の開発タスク",
  "🐢 Background — not urgent": "🐢 バックグラウンド（Background） — 急ぎではない",
  "More: ": " ほか",
  "Unfinished sub-tasks remain": "未完了のサブタスクが残っています",
  "Finish or withdraw them first.": "先に Done にするか、取り下げてください。",
  "Cannot reach the board-ui server. Check in your terminal that it is running.":
    "board-ui サーバーに接続できません。サーバーが起動しているか、ターミナルで確認してください。",
  "Withdraw (close)": "取り下げ (close)",
  "Finish or withdraw the sub-tasks before finishing the parent.":
    "親を Done にする前に、サブタスクを Done にするか取り下げてください。",
  "This project is not initialised yet. Run": "このプロジェクトはまだ初期化されていません。Claude Code で",
  "in Claude Code.": "を実行してください。",
  Retry: "再試行",
  "Items with a status label but no sprint": "スプリントに入っていないのに status ラベルが付いた課題",
  "Put them back in the sprint, or remove the label.": "スプリントに入れ直すか、ラベルを外してください。",
  "Move anyway": "それでも移動する",
  "start next": "次に着手する",
  "after that": "そのあと",
  someday: "いつか",
  "Unset — no priority decided yet": "未設定 — 優先度をまだ決めていない",
  "Drag here to change priority": "ここにドラッグすると優先度が変わります",
  "Drop here to join this sprint and move to To Do": "ここにドロップすると、このスプリントに入って Todo に移ります",
  "Drop here to move to To Do": "ここにドロップすると Todo に移ります",
  "It has a status label but no milestone for the current sprint. Dragging it into a column fixes it.":
    "status ラベルは付いていますが、現在のスプリントの milestone がありません。ドラッグしてカラムに入れ直すと直ります。",
  "Out of sync": "未同期",
  "This item is finished, but sub-tasks are not": "この Issue は完了していますが、未完了のサブタスクがあります",
  "Finish or withdraw them, or reopen this item.":
    "サブタスクを Done にするか取り下げるか、この Issue を開き直してください。",
  "Sub-tasks open": "サブタスク未完了",
  "A title is required.": "タイトルは必須です。",
  "Add a sub-task to": "サブタスク追加:",
  "Implement the history API": "履歴APIの実装",
  "What to do, what done means, any links": "やること、完了の条件、参考リンクなど",
  "Add to": "追加先",
  "Labels, milestones and the rest are edited on": "ラベルやマイルストーンなど、その他の項目は",
  "the item page on GitHub": "GitHub 上の詳細ページ",
  Withdraw: "取り下げる",
  Round: "回",
  "Written by": "書いた人",
  "Somewhere to note what was said. Click to type.": "話に出たことを書き留められます。クリックして入力。",
  "This project is not initialised yet.": "このプロジェクトはまだ初期化されていません。",
  "Everyone writes at the same time. Press refresh to see the others\u2019 cards.":
    "全員が同時に書いてください。他の人のカードは「更新」を押すと出ます。",
  "Unfinished Try from last time": "前回からの未完了 Try",
  "Nothing carried over.": "持ち越しはありません。",
  High: "高",
  Medium: "中",
  Low: "低",
  Parent: "親",
  "Add a sub-task": "サブタスクを追加",
  "Remove from sprint": "スプリントから外す",
  "No description. Click to write one.": "本文はありません。クリックして書けます。",
  "A requirement that delivers value to an end user": "エンドユーザーに価値が届く機能要件",
  "Technical or operational work — setup, refactoring, dependency bumps":
    "技術的・運用的な作業（環境構築、リファクタ、依存更新）",
  "Existing expected behaviour is broken": "既存の期待動作が壊れている不具合",
  "Create an item": "課題を作成",
  "As a customer…": "購入者として…",
  "Search results go blank from page 2": "検索結果が2ページ目から空になる",
  "Upgrade to Node 22": "Node 22 へのアップグレード",
  "The starting point comes from": "書き出しは",
  "Your team can edit it.": "から来ています。チームで直せます。",
  Empty: "空です",
  "Nothing to show.": "表示できる Issue がありません。",
  "Current sprint": "現在のスプリント",
  Expand: "展開",
  Collapse: "折りたたむ",
  done: "完了",
  "This item is not in the sprint yet": "この Issue はまだスプリントに入っていません",
  "Sub-task": "サブタスク",

  // Item fields
  Status: "ステータス",
  Priority: "優先度",
  Points: "ポイント",
  Assignee: "担当",
  Type: "種別",
  Sprint: "マイルストーン",
  Subtask: "サブタスク",
  "Sub-tasks": "サブタスク",
  Details: "詳細",
  Title: "タイトル",
  Description: "本文",
  "Acceptance criteria": "受け入れ条件",

  // States and messages
  "The backlog is empty.": "バックログは空です。",
  "Check in the backlog": "バックログで確認",
  "Open on GitHub": "GitHubで開く",
  Started: "着手済",
  "Not planned": "取り下げ",
  Loading: "読み込み中",

  // Retrospective
  "Keep — what to carry on": "Keep — 続けたいこと",
  "Problem — what got in the way": "Problem — 困ったこと",
  "Try — what to attempt next": "Try — 次に試すこと",
  "What went well, and how you want to keep working":
    "うまくいったこと、続けたい進め方",
  "Where it stalled, what was awkward": "詰まったところ、やりにくかったこと",
  "An improvement to try next period": "次の期間で試したい改善",
};

/**
 * Translate. The argument is the English text, which doubles as the key — so
 * an untranslated string still renders, in English, rather than blowing up or
 * showing a key.
 */
/**
 * A count, with the counter Japanese needs. "5" reads fine in English; 「5」
 * alone reads unfinished in Japanese, where a number is normally followed by
 * one. Concatenating a translated label with a bare number is exactly the
 * thing that does not survive a language change — this keeps that decision in
 * one place instead of at every call site.
 */
export function count(n: number): string {
  return current === "ja" ? `${n} 件` : String(n);
}

/**
 * **Never call this at module scope.** The locale arrives with the board
 * payload, so a `t()` evaluated while the module graph loads runs before
 * `setLocale` and freezes on English. Constants that need translating are
 * functions, called during render.
 */
export function t(en: string): string {
  if (current === "en") return en;
  return ja[en] ?? en;
}
