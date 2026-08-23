import { useEffect, useState } from "react";
import { t } from "../i18n";
import { createTask, deleteTask, getTask, updateTask, type BoardItem, type SubtaskItem } from "../api";
import { COLUMN_LABELS } from "../columns";

interface Props {
  story: BoardItem;
  task?: SubtaskItem | null; // omitted/null = create mode
  assignees: string[];
  onClose: () => void;
  onSaved: (number: number) => void;
  /** Withdrawal path — see IssueEditPanel: the saved path waits for the
   * issue to appear in the next fetch, which a just-closed one may not. */
  onDeleted: () => void;
}

export function TaskEditPanel({ story, task, assignees, onClose, onSaved, onDeleted }: Props) {
  const isEdit = task != null;
  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [column, setColumn] = useState<"todo" | "doing" | "review">("todo");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    getTask(story.number, task.number)
      .then((loaded) => {
        setTitle(loaded.title);
        setDetail(loaded.detail ?? "");
        setAssignee(loaded.assignees?.[0]?.login ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [story.number, task]);

  const save = async () => {
    if (!title.trim()) {
      setError(t("A title is required."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && task) {
        await updateTask(story.number, task.number, { title, detail, assignee: assignee || undefined });
        onSaved(task.number);
      } else {
        const result = await createTask(story.number, { title, detail, column, assignee: assignee || undefined });
        onSaved(result.number);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!confirm(`${t("Withdraw (close)")} #${task.number}?`)) return;
    setSaving(true);
    try {
      await deleteTask(story.number, task.number);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>
          {isEdit ? `${t("Edit")} #${task!.number}` : `${t("Add a sub-task to")} #${story.number} ${story.title}`}
        </h2>
        {loading ? (
          <p>{t("Loading")}…</p>
        ) : (
          <>
            <label>
              {t("Title")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("Implement the history API")} autoFocus />
            </label>
            {/* A sub-task is a title and a description. The description used
                to be reachable only on GitHub, which meant leaving the board
                to write the one thing that says what the work actually is. */}
            <label>
              {t("Details")}
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={6}
                placeholder={t("What to do, what done means, any links")}
              />
            </label>
            {!isEdit && (
              <label>
                {t("Add to")}
                <select value={column} onChange={(e) => setColumn(e.target.value as typeof column)}>
                  <option value="todo">{COLUMN_LABELS.todo}</option>
                  <option value="doing">{COLUMN_LABELS.doing}</option>
                  <option value="review">{COLUMN_LABELS.review}</option>
                </select>
              </label>
            )}
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
            {isEdit && (
              <p className="hint">
                {t("Labels, milestones and the rest are edited on")}
                <a href={task!.url} target="_blank" rel="noreferrer">
                  {t("the item page on GitHub")}
                </a>
                .
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="modal__actions">
              {isEdit && (
                <button className="button--danger" onClick={remove} disabled={saving}>
                  {t("Withdraw")}
                </button>
              )}
              <button onClick={onClose} disabled={saving}>
                {t("Cancel")}
              </button>
              <button className="button--primary" onClick={save} disabled={saving}>
                {isEdit ? t("Save") : t("Add")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
