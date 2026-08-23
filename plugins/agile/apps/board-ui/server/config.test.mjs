import { activeSprint } from "./config.js";

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got:      ${JSON.stringify(actual)}\n       expected: ${JSON.stringify(expected)}`); }
};

console.log("\n== 現在のスプリント ==");
check("current を読む", activeSprint({ mode: "sprint", sprint: { current: "Sprint 6" } }), "Sprint 6");
check("旧 milestone にフォールバック", activeSprint({ mode: "sprint", sprint: { milestone: "Sprint 5" } }), "Sprint 5");
check("両方あれば current が勝つ", activeSprint({ mode: "sprint", sprint: { current: "Sprint 6", milestone: "Sprint 5" } }), "Sprint 6");

console.log("\n== スプリントが無い状態 ==");
// kanban で誤って絞り込むと、ボードから全カードが消える。
check("kanban は常に null", activeSprint({ mode: "kanban", sprint: { current: "Sprint 6" } }), null);
check("スプリント未開始", activeSprint({ mode: "sprint", sprint: { current: null } }), null);
check("sprint キーごと無い", activeSprint({ mode: "sprint" }), null);
check("config が無い", activeSprint(null), null);
check("config が空", activeSprint({}), null);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
