/**
 * Two founders sharing one brain (PLAN.md, phase 12): through the Google
 * script, or by passing a brain file.
 */

export type ShareState = {
  /** The "This is me" name, which sharing needs: every change carries it. */
  me: string | null;
  /** Whether this Caulder has its own Google connection, which starting to share needs. */
  googleConnected: boolean;
  shared: {
    name: string;
    /** "owner" when the brain lives in this founder's script; "member" when it was joined by invitation. */
    role: "owner" | "member";
    lastSyncedAt: string | null;
    error: string | null;
    /** Pages changed here, and deletions, not sent yet. */
    waiting: number;
  } | null;
};

export type InvitationPreview = { name: string; createdBy: string; pages: number };

/** What bringing in a brain file did. */
export type ImportOutcome = {
  /** New pages. */
  added: number;
  /** Pages the file had a newer version of. */
  updated: number;
  /** Pages this side has a newer version of, left alone. */
  kept: number;
  /** Pages already the same. */
  same: number;
};
