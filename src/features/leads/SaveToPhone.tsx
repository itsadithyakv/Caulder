import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import type { Lead } from "@shared/domain";
import { messageOf } from "@/lib/errors";

/**
 * A contact into Google Contacts, which is what a phone's address book syncs
 * with - so the client who rings has a name on the screen.
 *
 * Offered once Google is connected, on a contact that has a way to be
 * reached. Before then it was a button that could only say what to connect;
 * that offer is made once, in Finish setting up on Today, not on every
 * contact's page.
 *
 * Pressing it again after an edit updates the same contact instead of making
 * a second: Caulder remembers which one it made.
 */
export function SaveToPhone({ lead }: { lead: Lead }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let live = true;
    window.caulder.google.state(lead.companyId).then((state) => live && setConnected(state.connected), () => undefined);
    return () => {
      live = false;
    };
  }, [lead.companyId]);

  if (!connected || (!lead.phone && !lead.email)) return null;

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
