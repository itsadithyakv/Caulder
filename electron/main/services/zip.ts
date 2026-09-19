import { closeSync, openSync, rmSync, writeSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

/**
 * A zip file, written as it goes (PLAN.md, phase 13).
 *
 * The data room is a folder of pages and the company's own files handed to
 * somebody else, and a zip is the one container every computer opens without
 * installing anything. Written here rather than taken from a library for the
 * reason the Markdown parser is: the whole of what is needed is a local
 * header, the bytes, and a directory at the end - a hundred lines, against a
 * dependency.
 *
 * Each file is compressed on its own and written straight to disk, so a data
 * room of pitch decks never sits in memory whole; only the directory does.
 * Names are UTF-8 (bit 11), so a document called "Pañcāṅga.pdf" keeps its
 * name. No ZIP64: a data room past 4 GB is refused with a sentence, not
 * written broken.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date: two seconds' resolution, nothing before 1980. */
function dosStamp(when: Date): { time: number; day: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

type Entry = {
  name: Buffer;
  crc: number;
  compressed: number;
  size: number;
  method: number;
  offset: number;
  time: number;
  day: number;
};

const LIMIT = 0xffffffff;
const UTF8 = 0x0800;
const TOO_BIG = "That is more than a zip file can hold without extensions (4 GB). Leave some documents out.";

export class ZipWriter {
  private readonly fd: number;
  private offset = 0;
  private readonly entries: Entry[] = [];
  private readonly names = new Set<string>();
  private closed = false;

  constructor(private readonly path: string) {
    this.fd = openSync(path, "w");
  }

  /**
   * Adds one file. A name already used gets " (2)" before its extension, so
   * two documents called "Certificate.pdf" both arrive.
   */
  add(name: string, data: Uint8Array, when: Date = new Date()): string {
    if (this.closed) throw new Error("The zip is already finished.");
    const unique = this.unique(name.replace(/\\/g, "/").replace(/^\/+/, ""));
    const deflated = deflateRawSync(data, { level: 6 });
    // Files that are already compressed - a PDF, a photo - are stored as they are.
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    if (data.length >= LIMIT || this.offset + body.length >= LIMIT) throw new Error(TOO_BIG);

    const nameBytes = Buffer.from(unique, "utf8");
    const { time, day } = dosStamp(when);
    const entry: Entry = {
      name: nameBytes,
      crc: crc32(data),
      compressed: body.length,
      size: data.length,
      method: stored ? 0 : 8,
      offset: this.offset,
      time,
      day,
    };

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8, 6);
    header.writeUInt16LE(entry.method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(day, 12);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressed, 18);
    header.writeUInt32LE(entry.size, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);

    this.write(header);
    this.write(nameBytes);
    this.write(body);
    this.entries.push(entry);
    return unique;
  }

  /** Writes the directory and closes the file. Returns its size in bytes. */
  finish(): number {
    if (this.closed) throw new Error("The zip is already finished.");
    if (this.entries.length > 0xffff) throw new Error("That is more files than a zip file can list. Leave some out.");
    const start = this.offset;
    for (const entry of this.entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(UTF8, 8);
      header.writeUInt16LE(entry.method, 10);
      header.writeUInt16LE(entry.time, 12);
      header.writeUInt16LE(entry.day, 14);
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(entry.compressed, 20);
      header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.length, 28);
      // Extra field, comment, disk number, internal and external attributes: all nothing.
      header.writeUInt32LE(entry.offset, 42);
      this.write(header);
      this.write(entry.name);
    }
    const size = this.offset - start;
    if (this.offset >= LIMIT) throw new Error(TOO_BIG);

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    this.write(end);

    closeSync(this.fd);
    this.closed = true;
    return this.offset;
  }

  /** Something went wrong part way: close the file and remove what was written. */
  abandon(): void {
    if (!this.closed) {
      this.closed = true;
      closeSync(this.fd);
    }
    rmSync(this.path, { force: true });
  }

  private write(bytes: Uint8Array): void {
    let at = 0;
    while (at < bytes.length) at += writeSync(this.fd, bytes, at, bytes.length - at);
    this.offset += bytes.length;
  }

  private unique(name: string): string {
    let candidate = name || "Untitled";
    let n = 2;
    while (this.names.has(candidate.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      const slash = name.lastIndexOf("/");
      candidate = dot > slash + 1 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
      n += 1;
    }
    this.names.add(candidate.toLowerCase());
    return candidate;
  }
}
