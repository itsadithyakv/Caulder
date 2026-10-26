import { useEffect, useState } from "react";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import type { Block, LeadListRow } from "@shared/domain";

type ForClient = { leadId: string; billable: boolean };

/**
 * Whom a block's time is for, and whether it is billed by the hour (PLAN.md,
 * part thirteen, phase 57). On a block that exists it is saved as it is
 * changed, apart from the block's own form; on one being made it goes in with
 * it. Billable time is then offered on the contact's page to invoice.
 */
export function BlockClient(props: { block: Block } | { value: ForClient; onChange: (next: ForClient) => void }) {
  const { activeCompany } = useWorkspace();
  const block = "block" in props ? props.block : null;
  const companyId = block?.companyId ?? activeCompany?.id ?? null;
  const [contacts, setContacts] = useState<LeadListRow[]>([]);
  const [saved, setSaved] = useState<ForClient>({ leadId: block?.leadId ?? "", billable: block?.billable ?? false });
  const [error, setError] = useState<string | null>(null);
  const current = "value" in props ? props.value : saved;

  useEffect(() => {
    if (!companyId) return;
    window.caulder.leads
      .list({ companyId, sort: "name", direction: "asc" })
      .then(setContacts, () => setContacts([]));
  }, [companyId]);

  async function change(next: ForClient) {
    const clean = { leadId: next.leadId, billable: Boolean(next.leadId) && next.billable };
    if ("onChange" in props) return props.onChange(clean);
    if (!block) return;
    setError(null);
    setSaved(clean);
    try {
      await window.caulder.hours.setFor(block.id, { leadId: clean.leadId || null, billable: clean.billable });
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  if (block?.invoiceId) return <p className="field__hint">Billed to {block.leadName ?? "a contact"}.</p>;
  if (contacts.length === 0) return null;

  return (
    <div className="field">
      <span className="field__label">For a client</span>
      <div className="blockform__row">
        <Select
          aria-label="For a client"
          value={current.leadId}
          onChange={(value) => void change({ leadId: value, billable: current.billable })}
          options={[{ value: "", label: "Nobody in particular" }, ...contacts.map((contact) => ({ value: contact.id, label: contact.name }))]}
        />
        {current.leadId && (
          <label className="checkline">
            <input
              type="checkbox"
              className="tickbox"
              checked={current.billable}
              onChange={(event) => void change({ leadId: current.leadId, billable: event.target.checked })}
            />
            <span className="checkline__title">Billed by the hour</span>
          </label>
        )}
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}
