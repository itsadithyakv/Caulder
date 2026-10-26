import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { serviceOf, type AskState } from "@shared/ask";
import type { BrainPage } from "@shared/brain";
import { diffLines } from "@shared/diff";
import { leadInput } from "@shared/domain";
import { draftedBy, unmarked, type BriefState, type Draft, type Noticed, type NoticedDraft, type ProposalSent } from "@shared/propose";
import { sayParts } from "@shared/relevant";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { numberText } from "@/lib/format";
import { sideBySide } from "./PageHistory";

/**
 * What the AI proposes, and the owner keeps (PLAN.md, part ten, phase 39).
 *
 * The company in brief is what goes with every question, so it is shown
 * here as it stands. An AI that is connected can draft it from what is
 * already written, tidy a page, and say what the contacts' history shows -
 * and each of those is a draft on the screen until it is kept. Keeping goes
 * through the page's own save and the contact's own update: the AI writes
 * nothing.
 */

/** The page the brief is kept on, by its title: services/relevant.ts reads it by the same name. */
const BRIEF_PAGE = "Company in brief";

/** Today, as the day is written on what is kept. */
const dayNow = () => new Date().toLocaleDateString("en-CA");

/** What went to make a draft, said with it. */
function Sent({ sent }: { sent: ProposalSent }) {
  return (
    <p className="card__hint proposal__sent">
      Sent to {sent.service} ({sent.model}): {sayParts(sent.parts, 10)} - {numberText(sent.characters)} characters, numbers masked.{" "}
      {numberText(sent.usage.input)} tokens in, {numberText(sent.usage.output)} out. Nothing is kept until you keep it.
    </p>
  );
}

function useAi(): AskState | null {
  const [state, setState] = useState<AskState | null>(null);
  useEffect(() => {
    window.caulder.ask.state().then(setState, () => undefined);
  }, []);
  return state;
}

export function BriefCard({
  companyId,
  version,
  onOpenPage,
  onChanged,
}: {
  companyId: string;
  /** Bumped when anything in the brain changes, so the brief is read again. */
  version: number;
  onOpenPage: (pageId: string) => void;
  /** A page or a contact was written: lists elsewhere may be stale. */
  onChanged: () => void;
}) {
  const ai = useAi();
  const [brief, setBrief] = useState<BriefState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [noticed, setNoticed] = useState<NoticedDraft | null>(null);
  const [busy, setBusy] = useState<null | "brief" | "noticed" | "keep">(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const read = useCallback(() => {
    window.caulder.ask.brief(companyId).then(setBrief, (cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);
  useEffect(read, [read, version]);

  const name = serviceOf(ai?.service)?.label ?? "the AI";

  async function run<T>(what: "brief" | "noticed" | "keep", work: () => Promise<T>): Promise<T | null> {
    setBusy(what);
    setError(null);
    setSaid(null);
    try {
      return await work();
    } catch (cause) {
      setError(messageOf(cause));
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** The brief's page with this on it: the page there is, or one started for it in Company. */
  async function write(body: string): Promise<BrainPage> {
    const page = brief?.pageId ? await window.caulder.brain.page(brief.pageId) : await window.caulder.brain.create(companyId, "company", "page");
    return window.caulder.brain.save(page.id, { title: BRIEF_PAGE, body, fields: page.fields, secrets: {}, baseRevision: page.revision });
  }

  async function keepDraft() {
    if (!draft) return;
    const kept = await run("keep", () => write(`${text.trim()}\n\n${draftedBy(draft.sent.service, dayNow())}`));
    if (!kept) return;
    setDraft(null);
    setSaid(`Kept on the page “${BRIEF_PAGE}”. It goes with every question from now on.`);
    read();
    onChanged();
  }

  async function keepNoticed(fact: Noticed) {
    const done = await run("keep", async () => {
      // Through the schema with everything the contact already has, so only the note changes.
      const lead = await window.caulder.leads.find(fact.leadId);
      if (!lead) throw new Error(`${fact.about} is not a contact any more.`);
      const line = `${fact.fact} (from their history, ${dayNow()})`;
      const parsed = leadInput.safeParse({ ...lead, notes: [lead.notes, line].filter(Boolean).join("\n") });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That will not go on the contact.");
      await window.caulder.leads.update(lead.id, parsed.data);
      return true;
    });
    if (!done) return;
    setNoticed((current) => (current ? { ...current, facts: current.facts.filter((each) => each !== fact) } : current));
    setSaid(`Kept on ${fact.about}, under Keep in mind.`);
    onChanged();
  }

  if (!brief) return <ErrorLine>{error}</ErrorLine>;

  return (
    <Card title="The company in brief" icon={<Sparkles size={15} aria-hidden />}>
      <p className="card__hint">
        Sent with every question to an AI.{" "}
        {brief.written ? "" : "Drafted from the profile until you write it."}
      </p>

      {!draft && <pre className="proposal__text">{brief.text}</pre>}

      {draft && (
        <div className="proposal__draft">
          <label className="field">
            <span className="field__label">A draft from {draft.sent.service}. Change anything that is not true.</span>
            <textarea
              className="textarea"
              rows={Math.min(14, Math.max(6, text.split("\n").length + 1))}
              value={text}
              aria-label="The drafted brief"
              disabled={busy !== null}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <Sent sent={draft.sent} />
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={() => void keepDraft()} disabled={busy !== null || text.trim() === ""}>
              Keep it
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy !== null}>
              Throw it away
            </button>
          </div>
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>
      {said && (
        <p className="card__hint" role="status">
          {said}
        </p>
      )}

      {!draft && (
        <div className="actions">
          {brief.pageId ? (
            <button type="button" className="btn btn--sm" onClick={() => brief.pageId && onOpenPage(brief.pageId)}>
              Open the page
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy !== null}
              onClick={() =>
                void run("keep", () => write(brief.text)).then((page) => {
                  if (!page) return;
                  onChanged();
                  onOpenPage(page.id);
                })
              }
            >
              Write it by hand
            </button>
          )}
          {ai?.connected ? (
            <>
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy !== null}
                onClick={() =>
                  void run("brief", () => window.caulder.ask.proposeBrief(companyId)).then((made) => {
                    if (!made) return;
                    setDraft(made);
                    setText(made.text);
                  })
                }
              >
                {busy === "brief" ? `${name} is drafting…` : `Draft it with ${name}`}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy !== null}
                onClick={() => void run("noticed", () => window.caulder.ask.proposeNoticed(companyId)).then((made) => made && setNoticed(made))}
              >
                {busy === "noticed" ? `${name} is reading the history…` : "What does the history show?"}
              </button>
            </>
          ) : null}
        </div>
      )}

      {noticed && (
        <section className="proposal__noticed" aria-label="What the history shows">
          <h3 className="proposal__heading">What the history shows</h3>
          {noticed.facts.length === 0 ? (
            <p className="card__hint">Nothing more that is not already noted on the contact.</p>
          ) : (
            <ul className="proposal__facts">
              {noticed.facts.map((fact) => (
                <li key={`${fact.leadId}:${fact.fact}`} className="proposal__fact">
                  <p className="proposal__factText">
                    <strong>{fact.about}.</strong> {fact.fact}
                  </p>
                  {fact.from.length > 0 && (
                    <ul className="proposal__from">
                      {fact.from.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  <div className="actions">
                    <button type="button" className="btn btn--sm" onClick={() => void keepNoticed(fact)} disabled={busy !== null}>
                      Keep on {fact.about}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => setNoticed({ ...noticed, facts: noticed.facts.filter((each) => each !== fact) })}
                    >
                      Leave it
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Sent sent={noticed.sent} />
        </section>
      )}
    </Card>
  );
}

/**
 * A page, tidied by the AI, beside the page as it is: kept whole or thrown
 * away whole. Only this page was sent to make it.
 */
export function Tidied({
  page,
  draft,
  busy,
  onKeep,
  onDiscard,
}: {
  page: BrainPage;
  draft: Draft;
  busy: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  // Without the line that says who drafted it: that is Caulder's note on the page, and was not sent.
  const rows = useMemo(() => sideBySide(diffLines(unmarked(page.body), draft.text)), [page.body, draft.text]);
  const changed = rows.some((row) => row.left?.kind === "removed" || row.right?.kind === "added");

  return (
    <section className="card proposal" aria-label="The page, tidied">
      <div className="section-head">
        <h2 className="card__title">Tidied by {draft.sent.service}</h2>
        <span className="card__hint">{changed ? "As it is on the left, tidied on the right." : "It came back the same."}</span>
      </div>
      {changed && (
        <div className="diff" role="table" aria-label="What tidying would change">
          <div className="diff__row diff__row--head" role="row">
            <span role="columnheader">As it is</span>
            <span role="columnheader">Tidied</span>
          </div>
          {rows.map((row, index) => (
            <div key={index} className="diff__row" role="row">
              <span role="cell" className={`diff__cell${row.left?.kind === "removed" ? " diff__cell--removed" : ""}`}>
                {row.left?.kind === "removed" && <span className="visually-hidden">Removed: </span>}
                {row.left?.text ?? ""}
              </span>
              <span role="cell" className={`diff__cell${row.right?.kind === "added" ? " diff__cell--added" : ""}`}>
                {row.right?.kind === "added" && <span className="visually-hidden">Added: </span>}
                {row.right?.text ?? ""}
              </span>
            </div>
          ))}
        </div>
      )}
      <Sent sent={draft.sent} />
      <div className="actions">
        {changed && (
          <button type="button" className="btn btn--primary" onClick={onKeep} disabled={busy}>
            Keep the tidied page
          </button>
        )}
        <button type="button" className="btn" onClick={onDiscard} disabled={busy}>
          {changed ? "Throw it away" : "Close"}
        </button>
      </div>
      <p className="card__hint">Kept, the page as it is now stays in its History, and can be put back.</p>
    </section>
  );
}
