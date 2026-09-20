import { useState } from "react";
import { Smartphone } from "lucide-react";
import type { Lead } from "@shared/domain";
import { messageOf } from "@/lib/errors";

/**
 * A contact into Google Contacts, which is what a phone's address book syncs
 * with - so the client who rings has a name on the screen.
 *
 * Offered on every contact that has a way to be reached, connected to Google
 * or not: a button that is missing until something is set up is a feature
 * nobody finds. Without the script it says what to connect, in a sentence,
 * rather than being greyed out with no reason given.
 *
 * Pressing it again after an edit updates the same contact instead of making
 * a second: Caulder remembers which one it made.
 */
export function SaveToPhone({ lead }: { lead: Lead }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null);

  if (!lead.phone && !lead.email) return null;

  async function save() {
    setBusy(true);
    setSaid(null);
    try {
      const { made } = await window.caulder.google.saveContact(lead.id);
      setSaid({ text: made ? "Saved to Google Contacts. It will be on your phone in a moment." : "Updated in Google Contacts.", failed: false });
    } catch (cause) {
      setSaid({ text: messageOf(cause), failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="savetophone">
      <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void save()}>
        <Smartphone size={14} aria-hidden />
        Save to my phone
      </button>
      {said && (
        <span className={said.failed ? "field__error" : "card__hint"} role={said.failed ? "alert" : "status"}>
          {said.text}
        </span>
      )}
    </div>
  );
}
