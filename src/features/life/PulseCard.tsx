import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { CHECKINS, CHECKIN_LABEL, type Checkin, type Pulse } from "@shared/pulse";
import { Card } from "@/components/Card";
import { Explain } from "@/components/Explain";
import { formatDate } from "@/lib/format";

/**
 * How you have been: what shared/pulse.ts read from your own weeks.
 *
 * One sentence first, then what it is going on. It compares you only with
 * yourself, says nothing until it has a few weeks to go on, and never uses a
 * word like a finding about you - it describes the weeks.
 *
 * The day after a day with nothing on it, it asks what that day was. One
 * press, no typing, and "rested, on purpose" is as good an answer as any:
 * the point is not to account for the day but to learn, over months, what
 * your quiet days tend to be and what comes before them.
 *
 * It can be switched off here in one press. Off, it is one quiet line with
 * the way back on - not gone, because a thing that vanishes cannot be found
 * again, and not nagging, because being asked to be watched is not a kindness.
 */
export function PulseCard({ companyId, version = 0 }: { companyId: string; version?: number }) {
  const [state, setState] = useState<{ on: boolean; pulse: Pulse | null } | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.pulse(companyId).then((next) => live && setState(next), () => undefined);
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (!state) return null;

  const turn = (on: boolean) =>
    void window.caulder.life
      .setPulse(on)
      .then(() => window.caulder.life.pulse(companyId))
      .then(setState, () => undefined);

  if (!state.on || !state.pulse) {
    return (
      <p className="pulse__off">
        Not keeping an eye on how you have been.{" "}
        <button type="button" className="quickadd__keep" onClick={() => turn(true)}>
          Turn it on
        </button>
      </p>
    );
  }

  const { pulse } = state;
  const answer = (day: string, was: Checkin) => void window.caulder.life.quietDay(companyId, day, was).then(setState, () => undefined);

  return (
    <Card icon={<Activity size={15} aria-hidden />} title="How you have been" tone={pulse.level === "low" ? "warn" : undefined}>
      <p className="pulse__says">{pulse.says}</p>

      {pulse.ask && (
        <div className="quickadd__ask" role="group" aria-label="What yesterday was">
          <span className="quickadd__question">Nothing on {formatDate(pulse.ask)}. What was it?</span>
          <span className="quickadd__answers">
            {CHECKINS.map((was) => (
              <button key={was} type="button" className="chip" onClick={() => answer(pulse.ask as string, was)}>
                {CHECKIN_LABEL[was]}
              </button>
            ))}
          </span>
        </div>
      )}

      {pulse.notes.length > 0 && (
        <ul className="pulse__notes">
          {pulse.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {pulse.loves.length > 0 && (
        <>
          <h3 className="pulse__head">What you give time to</h3>
          <ul className="pulse__notes">
            {pulse.loves.map((love) => (
              <li key={love}>{love}</li>
            ))}
          </ul>
        </>
      )}

      <Explain>
        <p>
          Read from what is already here: the hours on your Calendar across every workspace, the tasks you finished,
          the face you gave each day in the journal, your habits, and what you told the line. Compared only with your
          own earlier weeks. It never reads your private lines - they are sealed, and this has no key to them. Nothing
          leaves this computer.{" "}
          <button type="button" className="quickadd__keep" onClick={() => turn(false)}>
            Stop keeping an eye on this
          </button>
        </p>
      </Explain>
    </Card>
  );
}
