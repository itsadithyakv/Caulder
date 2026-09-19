/**
 * The deal a contact is summed up by: the open one touched last, or, with none
 * open, the last one touched. SQL, so a list can join it per row.
 *
 * On its own so that both contacts and deals can use it without either
 * importing the other while it loads.
 */
export const MAIN_DEAL = (lead: string): string => `
  (SELECT d.id FROM deals d
     LEFT JOIN pipeline_stages ds ON ds.id = d.stage_id
    WHERE d.lead_id = ${lead}
    ORDER BY (COALESCE(ds.kind, 'open') = 'open') DESC, d.updated_at DESC, d.created_at DESC
    LIMIT 1)`;
