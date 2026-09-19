import { useCallback, useEffect, useRef, useState } from "react";
import type { Lead, LeadListRow, LeadQuery, LeadSort, Relationship, SortDirection } from "@shared/domain";
import { messageOf } from "@/lib/errors";

/**
 * Loads the lead list for the current filters.
 *
 * The query runs in the main process rather than filtering an in-memory array,
 * so search and sort stay correct once the list is thousands of rows and the
 * table is paged. Against a local SQLite file the round trip is cheap.
 */

export type Filters = {
  search: string;
  /** undefined means every stage; null means leads with no stage. */
  stageId: string | undefined | null;
  /** undefined means everybody. */
  relationship: Relationship | undefined;
  sort: LeadSort;
  direction: SortDirection;
};

export const EMPTY_FILTERS: Filters = {
  search: "",
  stageId: undefined,
  relationship: undefined,
  sort: "recent",
  direction: "desc",
};

export function useLeads(companyId: string | null, filters: Filters) {
  const [leads, setLeads] = useState<LeadListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against an out-of-order response overwriting a newer one: typing
  // quickly fires several queries and they need not come back in order.
  const latest = useRef(0);

  const reload = useCallback(() => {
    if (!companyId) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const ticket = ++latest.current;
    setLoading(true);

    const query: LeadQuery = {
      companyId,
      sort: filters.sort,
      direction: filters.direction,
    };
    if (filters.search.trim()) query.search = filters.search;
    if (filters.stageId !== undefined) query.stageId = filters.stageId;
    if (filters.relationship) query.relationship = filters.relationship;

    window.caulder.leads
      .list(query)
      .then((rows) => {
        if (ticket !== latest.current) return;
        setLeads(rows);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (ticket !== latest.current) return;
        setError(messageOf(cause));
        setLoading(false);
      });
  }, [companyId, filters.search, filters.stageId, filters.relationship, filters.sort, filters.direction]);

  useEffect(reload, [reload]);

  /**
   * Patches one row in place after an edit, avoiding a full refetch.
   *
   * An edit returns a Lead, which carries no next step - that comes from the
   * lead's tasks, which an edit cannot change. So the row's existing next step
   * is kept rather than being overwritten with nothing, which would blank the
   * column for whichever lead you had just looked at.
   */
  const patch = useCallback((lead: Lead) => {
    setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...lead } : row)));
  }, []);

  const remove = useCallback((id: string) => {
    setLeads((rows) => rows.filter((row) => row.id !== id));
  }, []);

  return { leads, loading, error, reload, patch, remove };
}
