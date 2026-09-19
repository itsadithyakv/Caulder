/**
 * Backup and export, as the renderer sees them.
 *
 * Declared here rather than beside the code that produces them, because both
 * cross the bridge and neither side should import the other's internals.
 */

/**
 * Where an update stands. "off" in development and under the tests; "current"
 * when the newest release is the one running; "ready" when one has downloaded
 * and waits for a restart.
 */
export type UpdateState = {
  status: "off" | "idle" | "checking" | "current" | "downloading" | "ready" | "failed";
  current: string;
  /** The newer version, while it downloads and once it is ready. */
  version: string | null;
  percent: number | null;
  error: string | null;
};

export type BackupFile = {
  /** The chosen folder it was also copied to, and what went wrong there if anything did. */
  mirrored?: { folder: string; error: string | null };
  name: string;
  path: string;
  /** Bytes, so a copy that looks implausibly small is visible as one. */
  size: number;
  takenAt: string;
};

export type ExportEverything = {
  folder: string;
  files: string[];
  rows: number;
};
