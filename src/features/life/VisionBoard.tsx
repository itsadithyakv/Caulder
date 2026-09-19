import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Mountain, MoreHorizontal, Pencil, Sparkles, Trash2, Type } from "lucide-react";
import { TASK_AREAS, TASK_AREA_LABEL, type TaskArea } from "@shared/domain";
import type { GoalRow } from "@shared/life";
import type { VisionInput, VisionPicture, VisionTile } from "@shared/vision";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { MenuButton } from "@/components/MenuButton";
import { messageOf } from "@/lib/errors";
import { pictureIn, shrinkPicture } from "@/lib/picture";

/**
 * The vision board (PLAN.md, phase 17): pictures and words for what the year
 * is for, on top of Life. A picture comes from a file, a drop or a paste, is
 * made smaller here, and asks for its words before it goes on; a tile can be
 * tied to one of your goals or an area. Dragging reorders; so does each
 * tile's menu, for the keyboard.
 */

type Draft = {
  /** The tile being changed, or none for a new one. */
  id: string | null;
  picture: VisionPicture | null;
  preview: string | null;
  words: string;
  area: TaskArea | "";
  goalId: string;
};

const EMPTY: Draft = { id: null, picture: null, preview: null, words: "", area: "", goalId: "" };

export function VisionBoard({
  companyId,
  version,
  onOpenGoal,
}: {
  companyId: string;
  version: number;
  onOpenGoal: (pageId: string) => void;
}) {
  const [tiles, setTiles] = useState<VisionTile[] | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([window.caulder.vision.list(companyId), window.caulder.life.goals(companyId)]).then(
      ([board, mine]) => {
        if (!live) return;
        setTiles(board);
        setGoals(mine);
      },
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  async function run(work: () => Promise<VisionTile[]>) {
    setBusy(true);
    setError(null);
    try {
      setTiles(await work());
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const takePicture = useCallback(async (picked: Blob | null) => {
    if (!picked) return;
    setError(null);
    try {
      const { picture, preview } = await shrinkPicture(picked);
      setDraft({ ...EMPTY, picture, preview });
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  // A picture pasted anywhere on Life, while nothing that takes text has the cursor.
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const picked = pictureIn(event.clipboardData?.files);
      if (!picked) return;
      event.preventDefault();
      void takePicture(picked);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [takePicture]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const input: VisionInput = { words: draft.words, area: draft.area || null, goalId: draft.goalId || null };
    const done = await run(() =>
      draft.id ? window.caulder.vision.update(draft.id, input) : window.caulder.vision.add(companyId, input, draft.picture),
    );
    if (done) setDraft(null);
  }

  function edit(tile: VisionTile) {
    setDraft({ id: tile.id, picture: null, preview: tile.picture, words: tile.words ?? "", area: tile.area ?? "", goalId: tile.goal?.id ?? "" });
  }

  const holdsFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  function dropOnBoard(event: DragEvent) {
    setDropping(false);
    if (!holdsFiles(event)) return;
    event.preventDefault();
    void takePicture(pictureIn(event.dataTransfer.files));
  }

  function dropOnTile(event: DragEvent, index: number) {
    if (holdsFiles(event) || !dragging) return;
    event.preventDefault();
    event.stopPropagation();
    const id = dragging;
    setDragging(null);
    setOver(null);
    void run(() => window.caulder.vision.move(id, index));
  }

  if (!tiles) return <ErrorLine>{error}</ErrorLine>;

  return (
    <Card
      icon={<Sparkles size={15} aria-hidden />}
      title="Vision board"
      className={`vision${dropping ? " vision--dropping" : ""}`}
      actions={
        <div className="actions">
          <button type="button" className="btn btn--sm" onClick={() => file.current?.click()} disabled={busy}>
            <ImagePlus size={14} aria-hidden />
            Add a picture
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft({ ...EMPTY })} disabled={busy}>
            <Type size={14} aria-hidden />
            Add words
          </button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Choose a picture"
            onChange={(event) => {
              void takePicture(pictureIn(event.target.files));
              event.target.value = "";
            }}
          />
        </div>
      }
    >
      <div
        className="vision__field"
        onDragOver={(event) => {
          if (!holdsFiles(event)) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={dropOnBoard}
      >
        <ErrorLine>{error}</ErrorLine>

        {draft && (
          <form className="vision__form anim-spring" onSubmit={(event) => void save(event)} aria-label={draft.id ? "Change the tile" : "A new tile"}>
            {draft.preview && <img className="vision__preview" src={draft.preview} alt="" />}
            <div className="vision__formFields">
              <label className="field">
                <span className="field__label">{draft.picture || draft.preview ? "Words under it" : "Words"}</span>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={160}
                  value={draft.words}
                  onChange={(event) => setDraft({ ...draft, words: event.target.value })}
                  placeholder={draft.picture || draft.preview ? "What it stands for, if it needs saying" : "Graduate. Ship it. Run the 10k."}
                  autoFocus
                />
              </label>
              <div className="vision__formRow">
                <label className="field">
                  <span className="field__label">Area</span>
                  <select className="input" value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value as TaskArea | "" })}>
                    <option value="">None</option>
                    {TASK_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {TASK_AREA_LABEL[area]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Goal</span>
                  <select className="input" value={draft.goalId} onChange={(event) => setDraft({ ...draft, goalId: event.target.value })}>
                    <option value="">None</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="actions">
                <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
                  {draft.id ? "Save" : "Put it on the board"}
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {tiles.length === 0 && !draft ? (
          <button type="button" className="vision__empty" onClick={() => file.current?.click()}>
            <ImagePlus size={22} aria-hidden />
            <span className="vision__emptyTitle">What is this year for?</span>
            <span className="card__hint">Drop a picture here, paste one, or choose one - a place, a finish line, a degree. Words work too.</span>
          </button>
        ) : (
          <ul className="vision__tiles" aria-label="Vision board">
            {tiles.map((tile, index) => (
              <li
                key={tile.id}
                className={[
                  "vision__tile",
                  tile.picture ? "vision__tile--picture" : "vision__tile--words",
                  tile.area ? `vision__tile--${tile.area}` : null,
                  dragging === tile.id ? "vision__tile--dragging" : null,
                  over === index && dragging !== tile.id ? "vision__tile--over" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable={!busy}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", tile.id);
                  setDragging(tile.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(index);
                }}
                onDrop={(event) => dropOnTile(event, index)}
              >
                {tile.picture && <img className="vision__img" src={tile.picture} alt={tile.words ?? "A picture on your board"} draggable={false} />}
                {tile.words && <p className="vision__words">{tile.words}</p>}
                {(tile.goal || tile.area) && (
                  <div className="vision__tags">
                    {tile.goal && (
                      <button type="button" className="vision__goal" onClick={() => onOpenGoal(tile.goal?.id ?? "")}>
                        <Mountain size={12} aria-hidden />
                        {tile.goal.title}
                      </button>
                    )}
                    {tile.area && <span className={`area area--${tile.area}`}>{TASK_AREA_LABEL[tile.area]}</span>}
                  </div>
                )}
                <div className="vision__menu">
                  <MenuButton
                    iconOnly
                    icon={<MoreHorizontal size={15} aria-hidden />}
                    label={`Tile: ${tile.words ?? "a picture"}`}
                    className="btn btn--sm btn--ghost vision__menuBtn"
                    align="right"
                    disabled={busy}
                    items={[
                      { label: "Change", icon: <Pencil size={14} aria-hidden />, onSelect: () => edit(tile) },
                      ...(index > 0
                        ? [{ label: "Move earlier", icon: <ArrowLeft size={14} aria-hidden />, onSelect: () => void run(() => window.caulder.vision.move(tile.id, index - 1)) }]
                        : []),
                      ...(index < tiles.length - 1
                        ? [{ label: "Move later", icon: <ArrowRight size={14} aria-hidden />, onSelect: () => void run(() => window.caulder.vision.move(tile.id, index + 1)) }]
                        : []),
                      { label: "Take it off", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => void run(() => window.caulder.vision.remove(tile.id)) },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {dropping && <p className="vision__dropHint" aria-hidden>Let go to put it on the board</p>}
      </div>
    </Card>
  );
}
