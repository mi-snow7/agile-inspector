import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";

/**
 * Click the text, it becomes an input; leave it, it saves. The panel used to
 * be read-only with an Edit button that opened a modal over it, which meant
 * changing one word was: open the card, open the panel, open the modal, edit,
 * save, close. Notion and Jira both let you type where the text already is.
 *
 * Rules, so that "leaving saves it" isn't a trap:
 *  - nothing is sent when the value didn't change
 *  - Escape restores the original and gives up focus without saving
 *  - a failed save puts the original text back, so the screen never claims a
 *    change that the server rejected
 *
 * While focused the field owns its value — the board reconciles in the
 * background every few seconds, and a fetch landing mid-sentence must not
 * overwrite what someone is typing.
 */
export function InlineText({
  value,
  onCommit,
  multiline,
  singleLine,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  /** Rejecting (throwing) restores the previous text. */
  onCommit: (next: string) => Promise<void>;
  multiline?: boolean;
  /** Wraps and grows like a paragraph, but holds one line's worth of value:
   * Enter commits instead of inserting a break, and pasted breaks collapse to
   * spaces. A title is a sentence that can be too long for one line — editing
   * it in a single-line input turned it into a horizontal scroll. */
  singleLine?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const escapedRef = useRef(false);
  const grows = multiline || singleLine;

  // Grow to fit rather than scroll. Measured from scrollHeight because a
  // textarea has no intrinsic content height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!editing || !singleLine || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft, singleLine]);

  // Adopt incoming values only when this field is neither being edited nor
  // waiting on its own save. Mid-edit it's the background-refresh clobber
  // this component exists to prevent; mid-save it put the *previous* text
  // back on screen for as long as the request took, so committing a change
  // looked like it had been rejected and then re-applied.
  useEffect(() => {
    if (!editing && !saving) setDraft(value);
  }, [value, editing, saving]);

  const start = () => {
    escapedRef.current = false;
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    if (escapedRef.current) {
      setDraft(value);
      return;
    }
    // A title is one line of meaning however many lines it takes to show.
    const next = singleLine ? draft.replace(/\s*\n\s*/g, " ").trim() : draft;
    if (next !== draft) setDraft(next);
    if (next === value) return;
    setSaving(true);
    try {
      await onCommit(next);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    // `draft`, not `value`: while a save is in flight the two differ, and
    // showing the old one is what made a committed edit flash back.
    return (
      <button
        type="button"
        className={`inline-edit inline-edit--idle ${className ?? ""}`}
        onClick={start}
        aria-label={`${t("Edit")}: ${ariaLabel}`}
        disabled={saving}
      >
        {draft.trim() ? (
          <span className="inline-edit__text">{draft}</span>
        ) : (
          <span className="inline-edit__placeholder">{placeholder ?? t("Empty")}</span>
        )}
      </button>
    );
  }

  const shared = {
    ref: ref as never,
    rows: singleLine ? 1 : 10,
    className: `inline-edit inline-edit--active ${className ?? ""}`,
    value: draft,
    autoFocus: true,
    "aria-label": ariaLabel,
    onBlur: commit,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      // While an IME is composing, Enter confirms the conversion and Escape
      // abandons it — neither is aimed at this field. Acting on them ended
      // the edit halfway through a Japanese word.
      if ((e.nativeEvent as KeyboardEvent).isComposing) return;
      if (e.key === "Escape") {
        escapedRef.current = true;
        // The panel closes on Escape too. Without this, cancelling an edit
        // also threw away the panel you were editing in.
        e.stopPropagation();
        (e.target as HTMLElement).blur();
        return;
      }
      // A field holding one line commits on Enter; where Enter is a real
      // newline it takes the modifier instead.
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
  };

  return grows ? <textarea {...shared} /> : <input {...shared} />;
}

/**
 * The same idea for the fields that are a fixed set of values. A select
 * commits on change rather than on blur: picking an option is already a
 * deliberate act, so there's nothing to confirm by leaving.
 */
export function InlineSelect({
  value,
  options,
  onCommit,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onCommit: (next: string) => Promise<void>;
  ariaLabel: string;
}) {
  const [pending, setPending] = useState<string | null>(null);

  // Show the choice immediately and put it back if the write fails, which is
  // what the board already does for a dragged card. Waiting for the round
  // trip left the picker showing the old value for as long as the request
  // took, so choosing looked like it hadn't registered.
  const shown = pending ?? value;

  // Any fresh value from the server ends the optimistic period — it either
  // agrees (done) or someone else changed it meanwhile (their value wins).
  useEffect(() => {
    setPending(null);
  }, [value]);

  return (
    <select
      className="inline-select"
      value={shown}
      aria-label={ariaLabel}
      onChange={async (e) => {
        const next = e.target.value;
        if (next === shown) return;
        setPending(next);
        try {
          await onCommit(next);
        } catch {
          setPending(null);
        }
        // On success the optimistic value stands until the refreshed board
        // arrives, which is what stops it flickering back through the old one.
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
