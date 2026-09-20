import { useEffect, useState } from "react";
import { Bike, BookOpen, Dumbbell, Footprints, Languages, Mountain, Music, Palette, Pencil, Waves } from "lucide-react";
import type { BoardTrack, HobbyBoard, HobbyKind } from "@shared/hobbies";
import { Card } from "@/components/Card";

/**
 * A page for each hobby, made for what the hobby is (shared/hobbies.ts).
 *
 * A gym's is its lifts by their best, what was counted, and the scale;
 * running's is how far and how fast; a guitar's is its songs. Nothing is
 * entered here - it is all read from what the quick line was told, the hours
 * on the Calendar, and the pages in the brain that hang off the hobby, which
 * open from here. Until something has been said about a hobby, its page says
 * what to say.
 */

const ICON: Record<HobbyKind, typeof Dumbbell> = {
  gym: Dumbbell, running: Footprints, cycling: Bike, swimming: Waves, music: Music, drawing: Pencil,
  reading: BookOpen, language: Languages, outdoors: Mountain, generic: Palette,
};

export function HobbyBoards({ companyId, version = 0, onOpen }: { companyId: string; version?: number; onOpen: (pageId: string) => void }) {
  const [boards, setBoards] = useState<HobbyBoard[]>([]);

  useEffect(() => {
    let live = true;
    window.caulder.life.boards(companyId).then((next) => live && setBoards(next), () => undefined);
    return () => {
      live = false;
    };
  }, [companyId, version]);

  return (
    <>
      {boards.map((board) => {
        const Icon = ICON[board.kind];
        const empty = board.tiles.length === 0 && board.tracks.length === 0 && board.pages.length === 0;
        return (
          <Card
            key={board.id}
            icon={<Icon size={15} aria-hidden />}
            title={board.title}
            actions={
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => onOpen(board.id)}>
                Open its page
              </button>
            }
          >
            {empty ? (
              <p className="card__hint">Nothing kept about it yet. Tell the line on Today: {board.hint}</p>
            ) : (
              <>
                {board.tiles.length > 0 && (
                  <dl className="hobbytiles">
                    {board.tiles.map((tile) => (
                      <div key={tile.label} className="hobbytile">
                        <dt className="hobbytile__label">{tile.label}</dt>
                        <dd className="hobbytile__value">{tile.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {board.tracks.length > 0 && (
                  <ul className="hobbytracks">
                    {board.tracks.map((track) => (
                      <li key={track.topic} className="hobbytrack">
                        <span className="hobbytrack__topic">{track.topic}</span>
                        <span className="hobbytrack__says">{track.says}</span>
                        <Spark track={track} />
                      </li>
                    ))}
                  </ul>
                )}
                {board.pages.length > 0 && (
                  <p className="hobbypages">
                    <span className="hobbypages__label">In the brain</span>
                    {board.pages.map((page) => (
                      <button key={page.id} type="button" className="chip" onClick={() => onOpen(page.id)}>
                        {page.title}
                      </button>
                    ))}
                  </p>
                )}
              </>
            )}
          </Card>
        );
      })}
    </>
  );
}

/**
 * The line of one thing over the year. Drawn so that up is always better: a
 * pace is turned over, because a faster run is a smaller number and a chart
 * that falls as somebody improves reads as the opposite of what happened.
 */
function Spark({ track }: { track: BoardTrack }) {
  if (track.points.length < 2) return <span className="hobbytrack__spark" aria-hidden />;
  const values = track.points.map((point) => (track.lowerIsBetter ? -point.value : point.value));
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const span = high - low || 1;
  const path = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - low) / span) * 24 - 2}`)
    .join(" ");
  const first = track.points[0];
  const last = track.points[track.points.length - 1];
  return (
    <svg
      className="hobbytrack__spark"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${track.topic}, from ${first?.day ?? ""} to ${last?.day ?? ""}: ${track.says}`}
    >
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
