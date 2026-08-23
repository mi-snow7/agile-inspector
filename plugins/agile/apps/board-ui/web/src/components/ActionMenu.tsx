import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

export interface Action {
  label: string;
  /** A glyph, not an icon asset — see the note in index.css about not
   * shipping an icon set. */
  icon: string;
  onSelect: () => void;
  /** Destructive actions sit under a rule at the bottom, in the danger
   * colour, so they can't be picked by aiming badly. */
  danger?: boolean;
}

/**
 * The "⋯" menu, where Jira keeps everything that isn't editing the issue.
 *
 * The panel used to end in a row of four buttons of equal weight —
 * Withdraw, + Sub-task, Remove from sprint, Open on GitHub — which is a lot of
 * furniture under a panel whose job is to show one issue, and it put a
 * destructive action a mis-click away from a navigational one.
 */
export function ActionMenu({ actions, label = t("More actions") }: { actions: Action[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Capture phase: cards stop propagation on their own pointerdown
    // handlers, so a bubble-phase listener misses those clicks and leaves the
    // menu stuck open.
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The panel closes on Escape too; closing the menu shouldn't take the
      // panel with it.
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const plain = actions.filter((a) => !a.danger);
  const danger = actions.filter((a) => a.danger);

  return (
    <div className="action-menu" ref={ref}>
      <button
        className="action-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="action-menu__popup" role="menu">
          {[plain, danger].map((group, i) =>
            group.length === 0 ? null : (
              <div key={i} className={i === 1 ? "action-menu__group action-menu__group--danger" : "action-menu__group"}>
                {group.map((a) => (
                  <button
                    key={a.label}
                    role="menuitem"
                    className={a.danger ? "action-menu__item action-menu__item--danger" : "action-menu__item"}
                    onClick={() => {
                      setOpen(false);
                      a.onSelect();
                    }}
                  >
                    <span className="action-menu__icon" aria-hidden="true">
                      {a.icon}
                    </span>
                    {a.label}
                  </button>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
