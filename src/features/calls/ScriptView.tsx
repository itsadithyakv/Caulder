import { useState } from "react";
import { Check } from "lucide-react";
import { fillScript, markFillIns, type ScriptContext, type ScriptPart } from "@shared/calls";
import { Markdown } from "@/features/brain/Markdown";

const PART_LABEL: Record<ScriptPart["kind"], string> = {
  opening: "Say first",
  reason: "Why you are calling",
  questions: "Ask",
  pitch: "The pitch",
  objections: "If they say",
  close: "Close",
  voicemail: "If it goes to voicemail",
  other: "",
};

/** Filled in, with the gaps still showing. */
function Said({ text, fill }: { text: string; fill: ScriptContext }) {
  if (text.trim().length === 0) return null;
  return <Markdown source={markFillIns(fillScript(text, fill))} />;
}

/**
 * A script, read out loud.
 *
 * Every part in the order it was written, in type large enough to read while
 * listening. Questions have a box beside them for the answer, which goes into
 * the call's notes; objections are a row to tap, one answer at a time,
 * because the one you need is needed now.
 */
export function ScriptView({
  parts,
  fill,
  answers,
  onAnswer,
}: {
  parts: readonly ScriptPart[];
  fill: ScriptContext;
  answers: Readonly<Record<string, string>>;
  onAnswer: (question: string, answer: string) => void;
}) {
  return (
    <div className="script">
      {parts.map((part, index) => {
        const label = part.heading || PART_LABEL[part.kind];
        const heading = label ? <h3 className="script__label">{label}</h3> : null;

        if (part.kind === "voicemail") {
          return (
            <details key={index} className="script__part script__part--voicemail">
              <summary className="script__label">{label}</summary>
              <Said text={part.text} fill={fill} />
            </details>
          );
        }

        return (
          <section key={index} className={`script__part script__part--${part.kind}`}>
            {heading}
            <Said text={part.text} fill={fill} />
            {part.kind === "questions" && part.questions.length > 0 && (
              <ol className="questions">
                {part.questions.map((raw, at) => {
                  const question = fillScript(raw, fill);
                  const answer = answers[question] ?? "";
                  return (
                    <li key={at} className={`question${answer.trim() ? " question--answered" : ""}`}>
                      <span className="question__mark" aria-hidden>
                        {answer.trim() ? <Check size={13} /> : at + 1}
                      </span>
                      <div className="question__body">
                        <Markdown source={markFillIns(question)} />
                        <input
                          className="input question__answer"
                          value={answer}
                          placeholder="What they said"
                          aria-label={`Answer: ${question}`}
                          maxLength={2000}
                          onChange={(event) => onAnswer(question, event.target.value)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {part.kind === "objections" && <Objections part={part} fill={fill} />}
          </section>
        );
      })}
    </div>
  );
}

function Objections({ part, fill }: { part: ScriptPart; fill: ScriptContext }) {
  const [open, setOpen] = useState<number | null>(null);
  if (part.objections.length === 0) return null;
  const shown = open === null ? null : part.objections[open];

  return (
    <div className="objections">
      <div className="chips" role="group" aria-label="What they said">
        {part.objections.map((objection, index) => (
          <button
            key={index}
            type="button"
            className={`chip${open === index ? " chip--on" : ""}`}
            aria-expanded={open === index}
            onClick={() => setOpen((current) => (current === index ? null : index))}
          >
            {objection.said}
          </button>
        ))}
      </div>
      {shown && (
        <div className="objection anim-spring" role="region" aria-label={`Answer to "${shown.said}"`}>
          <Said text={shown.answer || "No answer written yet."} fill={fill} />
        </div>
      )}
    </div>
  );
}
