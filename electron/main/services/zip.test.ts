import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { ZipWriter, crc32 } from "./zip";

/**
 * The zip writer, read back by a reader written here from the format's own
 * description: the end record, the directory, then each file's local header
 * and bytes. What it proves is that every name, byte and checksum written is
 * the one a standard reader finds.
 */

type Read = { name: string; data: Buffer; method: number; utf8: boolean };

function readZip(file: Buffer): Read[] {
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(-1);
  const count = file.readUInt16LE(end + 10);
  let at = file.readUInt32LE(end + 16);
  const out: Read[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(file.readUInt32LE(at)).toBe(0x02014b50);
    const flags = file.readUInt16LE(at + 8);
    const method = file.readUInt16LE(at + 10);
    const crc = file.readUInt32LE(at + 16);
    const compressed = file.readUInt32LE(at + 20);
    const size = file.readUInt32LE(at + 24);
    const nameLength = file.readUInt16LE(at + 28);
    const extra = file.readUInt16LE(at + 30);
    const comment = file.readUInt16LE(at + 32);
    const offset = file.readUInt32LE(at + 42);
    const name = file.subarray(at + 46, at + 46 + nameLength).toString("utf8");

    expect(file.readUInt32LE(offset)).toBe(0x04034b50);
    const localName = file.readUInt16LE(offset + 26);
    const localExtra = file.readUInt16LE(offset + 28);
    const start = offset + 30 + localName + localExtra;
    const body = file.subarray(start, start + compressed);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    out.push({ name, data, method, utf8: (flags & 0x0800) !== 0 });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

describe("the zip writer", () => {
  it("writes files a reader gets back byte for byte, compressed only when that helps", () => {
    const folder = mkdtempSync(join(tmpdir(), "caulder-zip-"));
    try {
      const path = join(folder, "room.zip");
      const zip = new ZipWriter(path);
      const text = Buffer.from("<h1>Unifloe</h1>\n".repeat(200), "utf8");
      const noise = randomBytes(4096);
      zip.add("index.html", text);
      zip.add("documents/01 Certificates/Pañcāṅga.pdf", noise);
      zip.add("empty.txt", Buffer.alloc(0));
      const bytes = zip.finish();

      const file = readFileSync(path);
      expect(file.length).toBe(bytes);
      const read = readZip(file);
      expect(read.map((entry) => entry.name)).toEqual(["index.html", "documents/01 Certificates/Pañcāṅga.pdf", "empty.txt"]);
      expect(read[0]?.data.equals(text)).toBe(true);
      expect(read[0]?.method).toBe(8);
      expect(read[1]?.data.equals(noise)).toBe(true);
      // Noise does not compress, so it is stored as it is.
      expect(read[1]?.method).toBe(0);
      expect(read.every((entry) => entry.utf8)).toBe(true);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("gives a second file of the same name a number rather than a collision", () => {
    const folder = mkdtempSync(join(tmpdir(), "caulder-zip-"));
    try {
      const path = join(folder, "room.zip");
      const zip = new ZipWriter(path);
      expect(zip.add("docs/Certificate.pdf", Buffer.from("a"))).toBe("docs/Certificate.pdf");
      expect(zip.add("docs/certificate.pdf", Buffer.from("b"))).toBe("docs/certificate (2).pdf");
      expect(zip.add("docs/Certificate.pdf", Buffer.from("c"))).toBe("docs/Certificate (3).pdf");
      zip.finish();
      expect(readZip(readFileSync(path)).map((entry) => entry.data.toString())).toEqual(["a", "b", "c"]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("checksums as the standard does", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});
