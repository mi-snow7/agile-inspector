import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ActionMenu } from "./ActionMenu";
import { InlineText } from "./InlineEdit";
import {
  ApiError,
  createRetroCard,
  deleteRetroCard,
  getRetro,
  updateRetroCard,
  type RetroCard,
  type RetroLane,
  type RetroResponse,
} from "../api";

/**
 * The retrospective screen. Unlike the board, this has no status columns —
 * a retro isn't progress tracking, it's four piles of sticky notes — so the
 * shape it borrows is the backlog's priority buckets, not the swimlanes.
 *
 * Every participant opens this on their own machine and writes their own
 * cards, because KPT depends on everyone writing at once, in silence.
 * Dictating to one scribe lets whoever speaks first anchor the rest.
 */
const buckets = (): { key: RetroLane; label: string; hint: string; className: string }[] => [
  { key: "keep", label: t("Keep — what to carry on"), hint: t("What went well, and how you want to keep working"), className: "kpt--keep" },
  { key: "problem", label: t("Problem — what got in the way"), hint: t("Where it stalled, what was awkward"), className: "kpt--problem" },
  { key: "try", label: t("Try — what to attempt next"), hint: t("An improvement to try next period"), className: "kpt--try" },
];

function Card({
  card,
  lane,
  draggable,
  onOpen,
}: {
  card: RetroCard;
  lane?: RetroLane;
  draggable: boolean;
  /** Tap opens the detail panel, as on the work board. Withdraw moved into
   * that panel's ⋯ menu — the board's cards made the same move. */
  onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `kpt-${card.number}`,
    data: { number: card.number, lane },
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`kpt-card ${isDragging ? "dragging" : ""} ${draggable ? "" : "kpt-card--static"}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || !onOpen) return;
        e.preventDefault();
        onOpen();
      }}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <span className="kpt-card__title">{card.title}</span>
      <div className="kpt-card__meta">
        {card.round && <span className="badge badge--round">{card.round}</span>}
        {card.adopted && <span className="badge badge--kaizen">{t("Started")}</span>}
        {/* The GitHub link moved into the panel's ⋯ menu. It was labelled
            Details, which is now what tapping the card itself opens — a sticky
            should read as a sticky. */}
      </div>
    </div>
  );
}

function Bucket({
  lane,
  label,
  hint,
  className,
  cards,
  onAdd,
  onOpen,
}: {
  lane: RetroLane;
  label: string;
  hint: string;
  className: string;
  cards: RetroCard[];
  onAdd: (title: string) => void;
  onOpen: (card: RetroCard, lane: RetroLane) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `kpt-lane-${lane}`, data: { kind: "kpt", lane } });
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  return (
    <section ref={setNodeRef} className={`kpt-bucket ${className} ${isOver ? "kpt-bucket--over" : ""}`}>
      <h2 className="kpt-bucket__header">
        {label}
        <span className="kpt-bucket__count">{cards.length}</span>
      </h2>
      <div className="kpt-bucket__items">
        {cards.map((card) => (
          <Card key={card.number} card={card} lane={lane} draggable onOpen={() => onOpen(card, lane)} />
        ))}
      </div>
      <div className="kpt-bucket__compose">
        <input
          value={draft}
          placeholder={hint}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // The Enter that confirms an IME conversion is still an Enter
            // keydown. Without this, typing Japanese submitted the card on
            // the confirming keypress — and since the IME then wrote its
            // text into the just-cleared field, the box looked untouched and
            // the next Enter filed the same card again.
            if (e.nativeEvent.isComposing) return;
            submit();
          }}
        />
        <button onClick={submit} disabled={!draft.trim()}>
          {t("Add")}
        </button>
      </div>
    </section>
  );
}

const LANE_TITLE: Record<RetroLane, string> = { keep: "Keep", problem: "Problem", try: "Try" };

/**
 * The same right-hand panel the board has, for a KPT sticky.
 *
 * Its own component rather than a third kind of DetailTarget: a sticky has no
 * status, no estimate, no milestone and no children, so nearly everything the
 * board's panel draws would have to be switched off. What it shares is what
 * matters — the shell, the inline fields and the ⋯ menu, so the two screens
 * behave identically under the hands.
 *
 * The description is the point of it: when the group walks the board card by
 * card, what gets said has somewhere to go besides someone's memory.
 */
function RetroDetailPanel({
  card,
  lane,
  onClose,
  onPatch,
  onDelete,
}: {
  card: RetroCard;
  lane: RetroLane | null;
  onClose: () => void;
  onPatch: (patch: { title?: string; body?: string }) => Promise<void>;
  onDelete: (() => void) | null;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside className="detail-panel" aria-label={`${t("Details")} #${card.number}`}>
      <div className="detail-panel__header">
        {lane && <span className={`badge badge--kpt-${lane}`}>{LANE_TITLE[lane]}</span>}
        <a className="detail-panel__key" href={card.url} target="_blank" rel="noreferrer" title={t("Open on GitHub")}>
          #{card.number}
        </a>
        <span className="detail-panel__spacer" />
        <ActionMenu
          actions={[
            { label: t("Open on GitHub"), icon: "↗", onSelect: () => window.open(card.url, "_blank", "noopener") },
            ...(onDelete ? [{ label: t("Withdraw"), icon: "⊘", onSelect: onDelete, danger: true }] : []),
          ]}
        />
        <button className="detail-panel__close" aria-label={t("Close")} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="detail-panel__scroll">
        <InlineText
          className="detail-panel__title"
          ariaLabel={t("Title")}
          singleLine
          value={card.title}
          onCommit={(title) => onPatch({ title })}
        />
        <dl className="detail-panel__meta">
          {card.round && (
            <>
              <dt>{t("Round")}</dt>
              <dd>
                <span className="badge badge--round">{card.round}</span>
              </dd>
            </>
          )}
          <dt>{t("Written by")}</dt>
          <dd>{card.author ? `@${card.author}` : <span className="detail-panel__empty">{t("Unknown")}</span>}</dd>
        </dl>
        <section>
          <h3 className="detail-panel__section-title">{t("Details")}</h3>
          <InlineText
            className="detail-panel__body"
            ariaLabel={t("Details")}
            multiline
            placeholder={t("Somewhere to note what was said. Click to type.")}
            value={card.body ?? ""}
            onCommit={(body) => onPatch({ body })}
          />
        </section>
      </div>
    </aside>
  );
}

export function RetroView() {
  const [data, setData] = useState<RetroResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  /** Only the number is held, so the panel re-resolves against the current
   * lanes every render — the same trick the board's panel uses, which is what
   * keeps an open panel correct after a drag. */
  const [openCard, setOpenCard] = useState<{ number: number; lane: RetroLane | null } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // No auto-sync here, deliberately — unlike the work board, which
  // revalidates on window focus. KPT depends on everyone writing at once in
  // silence, and the reveal is a *facilitated moment*: when time is up, the
  // representative refreshes their own screen and the group reviews the
  // lanes together. Auto-syncing on focus would leak others' cards onto a
  // participant's screen mid-writing (they tab between the chat pane and
  // this board constantly), re-introducing exactly the anchoring the
  // simultaneous-writing rule exists to prevent. The manual Reload button is
  // the reveal control, not a missing feature.
  const refresh = useCallback(async () => {
    try {
      setData(await getRetro());
      setError(null);
    } catch (err) {
      // Translate the payload marker the same way Board does — comparing the
      // *message* against "not_initialized" never matched (the server's
      // message is prose), so the init guidance below was unreachable.
      if (err instanceof ApiError && err.payload && (err.payload as { error?: string }).error === "not_initialized") {
        setError("not_initialized");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Applies a change to the lanes we're holding. Every mutation here is
   * applied locally first and undone if the write fails — the same contract
   * the work board gives a dragged card. Waiting for the round trip meant a
   * card you dropped snapped back to where it came from and then moved, and
   * a card you wrote appeared a beat after you pressed the button, which in
   * a room full of people writing at once reads as the tool having missed
   * the input. */
  const applyLocally = (edit: (lanes: RetroResponse["lanes"]) => RetroResponse["lanes"]) => {
    setData((prev) => (prev ? { ...prev, lanes: edit(prev.lanes) } : prev));
  };

  /** Writes a field of one card, locally first. */
  const patchCard = async (number: number, patch: { title?: string; body?: string }) => {
    const before = data?.lanes;
    applyLocally((lanes) => {
      const edit = (cs: RetroCard[]) => cs.map((c) => (c.number === number ? { ...c, ...patch } : c));
      return { carried: lanes.carried, keep: edit(lanes.keep), problem: edit(lanes.problem), try: edit(lanes.try) };
    });
    try {
      await updateRetroCard(number, patch);
    } catch (err) {
      if (before) applyLocally(() => before);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const add = async (lane: RetroLane, title: string) => {
    if (!data) return;
    // Negative, so it can't collide with a real issue number before the
    // server hands us one.
    const tempNumber = -Date.now();
    const optimistic: RetroCard = { number: tempNumber, title, round: data.round, author: null, url: "" };
    applyLocally((lanes) => ({ ...lanes, [lane]: [...lanes[lane], optimistic] }));
    try {
      const res = await createRetroCard(lane, title, data.round);
      // Swap in the real identity. Deliberately not a refresh: refetching
      // would pull everyone else's cards onto the screen of someone still
      // writing, which is exactly the anchoring the simultaneous-writing
      // rule exists to prevent (see the note on refresh above).
      applyLocally((lanes) => ({
        ...lanes,
        [lane]: lanes[lane].map((c) => (c.number === tempNumber ? { ...c, number: res.number, url: res.url } : c)),
      }));
    } catch (err) {
      applyLocally((lanes) => ({ ...lanes, [lane]: lanes[lane].filter((c) => c.number !== tempNumber) }));
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (number: number) => {
    const before = data?.lanes;
    applyLocally((lanes) => ({
      ...lanes,
      keep: lanes.keep.filter((c) => c.number !== number),
      problem: lanes.problem.filter((c) => c.number !== number),
      try: lanes.try.filter((c) => c.number !== number),
    }));
    try {
      await deleteRetroCard(number);
    } catch (err) {
      if (before) applyLocally(() => before);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDragStart = (e: DragStartEvent) => {
    const number = e.active.data.current?.number as number | undefined;
    if (number == null || !data) return;
    const all = [...data.lanes.keep, ...data.lanes.problem, ...data.lanes.try];
    setDragTitle(all.find((c) => c.number === number)?.title ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setDragTitle(null);
    const lane = (e.over?.data.current as { kind?: string; lane?: RetroLane } | undefined)?.lane;
    const active = e.active.data.current as { number?: number; lane?: RetroLane } | undefined;
    const number = active?.number;
    // Dropping a card back where it came from changes nothing.
    if (!lane || number == null || lane === active?.lane) return;
    const before = data?.lanes;
    const from = active?.lane;
    applyLocally((lanes) => {
      const card = from ? lanes[from].find((c) => c.number === number) : undefined;
      if (!card) return lanes;
      return {
        ...lanes,
        [from!]: lanes[from!].filter((c) => c.number !== number),
        [lane]: [...lanes[lane], card],
      };
    });
    try {
      await updateRetroCard(number, { lane });
    } catch (err) {
      if (before) applyLocally(() => before);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Resolved from the live lanes, so an edit or a drag updates the open
  // panel in place, and a withdrawn card closes it by disappearing.
  const openTarget = (() => {
    if (!openCard || !data) return null;
    const all = [
      ...data.lanes.keep, ...data.lanes.problem, ...data.lanes.try, ...data.lanes.carried,
    ];
    const card = all.find((c) => c.number === openCard.number);
    return card ? { card, lane: openCard.lane } : null;
  })();

  if (error === "not_initialized") {
    return <div className="board-status">{t("This project is not initialised yet.")}</div>;
  }
  // Same rule as the board: only take over the screen when there's nothing
  // to take over. Replacing a populated KPT board with one line of text
  // unmounted the buckets — including any card a participant was mid-typing
  // into a draft box — and removed the Refresh button, i.e. the only way to
  // recover. Mutation failures land here too (not alert(): a modal per
  // failure, and everyone hits the same dead server at once in a retro).
  if (error && !data) return <div className="board-status board-status--error">{t("Error: ")}{error}</div>;
  if (!data) return <div className="board-status">{t("Loading")}…</div>;

  const { carried } = data.lanes;

  return (
    <div className={openTarget ? "kpt kpt--panel-open" : "kpt"}>
      {error && (
        <div className="board-error-banner" role="alert">
          <span className="board-error-banner__text">{t("Error: ")}{error}</span>
          <button onClick={() => refresh()}>{t("Retry")}</button>
          <button onClick={() => setError(null)}>{t("Close")}</button>
        </div>
      )}
      <div className="kpt__toolbar">
        <span className="kpt__round">{t("Retrospective")} {data.round}</span>
        <span className="kpt__hint">{t("Everyone writes at the same time. Press refresh to see the others\u2019 cards.")}</span>
        <button className="button--primary" onClick={refresh}>
          {t("Refresh")}
        </button>
      </div>

      {/* Opening the retro with what the team already promised and didn't do
          is the only thing that keeps retrospectives from being write-only.
          Read-only here: these are decided, the question is what to do now,
          which is a conversation, not a drag. */}
      <section className="kpt-bucket kpt--carried">
        <h2 className="kpt-bucket__header">
          {t("Unfinished Try from last time")}
          <span className="kpt-bucket__count">{carried.length}</span>
        </h2>
        <div className="kpt-bucket__items kpt-bucket__items--row">
          {carried.length === 0 ? (
            <p className="kpt-bucket__empty">{t("Nothing carried over.")}</p>
          ) : (
            carried.map((card) => (
              <Card key={card.number} card={card} draggable={false} onOpen={() => setOpenCard({ number: card.number, lane: null })} />
            ))
          )}
        </div>
      </section>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="kpt__buckets">
          {buckets().map(({ key, label, hint, className }) => (
            <Bucket
              key={key}
              lane={key}
              label={label}
              hint={hint}
              className={className}
              cards={data.lanes[key]}
              onAdd={(title) => add(key, title)}
              onOpen={(card, lane) => setOpenCard({ number: card.number, lane })}
            />
          ))}
        </div>
        <DragOverlay>{dragTitle && <div className="drag-overlay">{dragTitle}</div>}</DragOverlay>
      </DndContext>

      {openTarget && (
        <RetroDetailPanel
          card={openTarget.card}
          lane={openTarget.lane}
          onClose={() => setOpenCard(null)}
          onPatch={(patch) => patchCard(openTarget.card.number, patch)}
          // A carried card belongs to a past retrospective — it's shown for
          // reference, not for editing away.
          onDelete={openTarget.lane ? () => { setOpenCard(null); remove(openTarget.card.number); } : null}
        />
      )}
    </div>
  );
}
