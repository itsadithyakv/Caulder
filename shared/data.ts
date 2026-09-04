/**
 * Backup and export, as the renderer sees them.
 *
 * Declared here rather than beside the code that produces them, because both
 * cross the bridge and neither side should import the other's internals.
 */

export type BackupFile = {
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
