import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { createStory, deleteStory, getStory, updateStory } from "../api";
import { COLUMN_LABELS } from "../columns";

/** Sub-tasks aren't created here — they're broken out of a parent during
 * planning, from the card's own "+ Sub-task". */
type IssueTypeChoice = "story" | "task" | "bug";

const typeChoices = (): { value: IssueTypeChoice; label: string; hint: string }[] => [
  { value: "story", label: "📘 Story", hint: t("A requirement that delivers value to an end user") },
  { value: "task", label: "🛠️ Task", hint: t("Technical or operational work — setup, refactoring, dependency bumps") },
  { value: "bug", label: "🐛 Bug", hint: t("Existing expected behaviour is broken") },
];

interface Props {
  storyNumber: number | null; // null = create mode
  assignees: string[];
  /** Starting text per type, from .agile/templates/<type>.md — see the
   * server's templates.js. Create mode only; editing shows what's there. */
  templates?: Record<IssueTypeChoice, string>;
  onClose: () => void;
  onSaved: (number: number) => void;
  /** Withdrawal, separately from onSaved — the saved path waits for the
   * issue to *appear* in the next board fetch, which a just-closed issue may
   * never do (a withdrawn backlog item has no milestone, so sprint-mode Done
   * won't list it); routing deletes through the same wait burned the retries
   * and left the closed card lingering for seconds. */
  onDeleted: () => void;
}

export function IssueEditPanel({ storyNumber, assignees, templates, onClose, onSaved, onDeleted }: Props) {
  const [loading, setLoading] = useState(storyNumber !== null);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<IssueTypeChoice>("story");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(templates?.story ?? "");
  const [priority, setPriority] = useState<"" | "high" | "mid" | "low">("");
  const [points, setPoints] = useState<"" | "1" | "2" | "3" | "5" | "8">("");
  const [assignee, setAssignee] = useState("");
  const [column, setColumn] = useState<"backlog" | "todo">("backlog");
  const [error, setError] = useState<string | null>(null);
  /** Whether the description still holds an untouched template. Switching
   * type swaps the template only while that's true — once someone has
   * written something, changing Story to Bug must not throw it away. */
  const pristineRef = useRef(true);

  useEffect(() => {
    if (storyNumber === null) return;
    getStory(storyNumber)
      .then((detail) => {
        setTitle(detail.title);
        const prio = detail.labels.find((l) => l.name.startsWith("prio:"))?.name.slice(5) as typeof priority;
        const pts = detail.labels.find((l) => l.name.startsWith("points:"))?.name.slice(7) as typeof points;
        if (prio) setPriority(prio);
        if (pts) setPoints(pts);
        setAssignee(detail.assignees?.[0]?.login ?? "");
        const typeLabel = detail.labels.find((l) => l.name.startsWith("type:"))?.name.slice(5);
        if (typeLabel === "task" || typeLabel === "bug" || typeLabel === "story") setType(typeLabel);
        // Verbatim. The form used to decompose a story into persona/feature/
        // value/criteria and rebuild it on save, which meant anything written
        // outside those fields — on GitHub, by anyone — was silently dropped.
        setBody(detail.body ?? "");
        pristineRef.current = false;
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [storyNumber]);

  const chooseType = (next: IssueTypeChoice) => {
    setType(next);
    if (storyNumber === null && pristineRef.current) setBody(templates?.[next] ?? "");
  };

  const save = async () => {
    if (!title.trim()) {
      setError(t("A title is required."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        type,
        body,
        priority: priority || undefined,
        points: points ? Number(points) : undefined,
        assignee: assignee || undefined,
      };
      if (storyNumber === null) {
        const result = await createStory({ ...payload, column });
        onSaved(result.number);
      } else {
        await updateStory(storyNumber, payload);
        onSaved(storyNumber);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (storyNumber === null) return;
    if (!confirm(`${t("Withdraw (close)")} #${storyNumber}?`)) return;
    setSaving(true);
    try {
      await deleteStory(storyNumber, t("Not planned"));
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal--wide">
        <h2>{storyNumber === null ? t("Create an item") : `${t("Edit")} #${storyNumber}`}</h2>
        {loading ? (
          <p>{t("Loading")}…</p>
        ) : (
          <>
            <fieldset className="type-picker">
              <legend>{t("Type")}</legend>
              <div className="type-picker__options">
                {typeChoices().map((c) => (
                  <label key={c.value} className={type === c.value ? "type-option type-option--active" : "type-option"}>
                    <input
                      type="radio"
                      name="issue-type"
                      value={c.value}
                      checked={type === c.value}
                      onChange={() => chooseType(c.value)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="type-picker__hint">{typeChoices().find((c) => c.value === type)?.hint}</p>
            </fieldset>
            <label>
              {t("Title")}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "story" ? t("As a customer…") : type === "bug" ? t("Search results go blank from page 2") : t("Upgrade to Node 22")
                }
              />
            </label>
            {/* One description for every type, like Jira's create dialog.
                What differs per type is the text it starts from, which comes
                from .agile/templates/<type>.md and is the team's to edit. */}
            <label>
              {t("Description")}
              <textarea
                className="issue-body"
                value={body}
                onChange={(e) => {
                  pristineRef.current = false;
                  setBody(e.target.value);
                }}
                rows={16}
              />
            </label>
            {storyNumber === null && (
              <p className="hint">
                {t("The starting point comes from")} <code>.agile/templates/{type}.md</code>. {t("Your team can edit it.")}
              </p>
            )}
            <div className="story-form-row">
              <label>
                {t("Priority")}
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  <option value="">{t("None")}</option>
                  <option value="high">{t("High")}</option>
                  <option value="mid">{t("Medium")}</option>
                  <option value="low">{t("Low")}</option>
                </select>
              </label>
              <label>
                {t("Points")}
                <select value={points} onChange={(e) => setPoints(e.target.value as typeof points)}>
                  <option value="">{t("None")}</option>
                  {["1", "2", "3", "5", "8"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Assignee")}
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">{t("None")}</option>
                  {assignees.map((login) => (
                    <option key={login} value={login}>
                      {login}
                    </option>
                  ))}
                </select>
              </label>
              {storyNumber === null && (
                <label>
                  {t("Add to")}
                  <select value={column} onChange={(e) => setColumn(e.target.value as typeof column)}>
                    <option value="backlog">{COLUMN_LABELS.backlog}</option>
                    <option value="todo">{COLUMN_LABELS.todo}</option>
                  </select>
                </label>
              )}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="modal__actions">
              {storyNumber !== null && (
                <button className="button--danger" onClick={remove} disabled={saving}>
                  {t("Withdraw")}
                </button>
              )}
              <button onClick={onClose} disabled={saving}>
                {t("Cancel")}
              </button>
              <button className="button--primary" onClick={save} disabled={saving}>
                {t("Save")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
