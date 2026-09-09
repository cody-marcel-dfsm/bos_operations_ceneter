import { deflateRawSync, inflateRawSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const localFileSignature = 0x04034b50;
const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const utf8Flag = 0x0800;
const deflateMethod = 8;
const fixedDosTime = 0;
const fixedDosDate = 0x0021;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function assertSafeArchivePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe ZIP entry path: ${path}`);
  }
}

async function collectFiles(directory, current = directory) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(directory, path));
    } else if (entry.isFile()) {
      const archivePath = relative(directory, path).split(sep).join("/");
      assertSafeArchivePath(archivePath);
      const metadata = await stat(path);
      files.push({
        path: archivePath,
        content: await readFile(path),
        mode: metadata.mode & 0o111 ? 0o755 : 0o644
      });
    } else {
      throw new Error(`ZIP source must contain only regular files: ${path}`);
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function createDeterministicZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const seen = new Set();

  for (const entry of [...entries].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    assertSafeArchivePath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate ZIP entry: ${entry.path}`);
    seen.add(entry.path);

    const name = Buffer.from(entry.path, "utf8");
    const content = Buffer.from(entry.content);
    const mode = entry.mode & 0o111 ? 0o755 : 0o644;
    const compressed = deflateRawSync(content, { level: 9 });
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(localFileSignature, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(utf8Flag, 6);
    localHeader.writeUInt16LE(deflateMethod, 8);
    localHeader.writeUInt16LE(fixedDosTime, 10);
    localHeader.writeUInt16LE(fixedDosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(centralDirectorySignature, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(utf8Flag, 8);
    centralHeader.writeUInt16LE(deflateMethod, 10);
    centralHeader.writeUInt16LE(fixedDosTime, 12);
    centralHeader.writeUInt16LE(fixedDosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100000 | mode) * 0x10000, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(endOfCentralDirectorySignature, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(seen.size, 8);
  end.writeUInt16LE(seen.size, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function createDeterministicZipFromDirectory(directory) {
  return createDeterministicZip(await collectFiles(directory));
}

export function readZipEntries(archive) {
  const localEntries = new Map();
  let offset = 0;
  while (offset + 4 <= archive.length) {
    const signature = archive.readUInt32LE(offset);
    if (signature === centralDirectorySignature || signature === endOfCentralDirectorySignature) {
      break;
    }
    if (signature !== localFileSignature || offset + 30 > archive.length) {
      throw new Error(`Invalid ZIP local header at byte ${offset}`);
    }
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const checksum = archive.readUInt32LE(offset + 14);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    if (flags !== utf8Flag || method !== deflateMethod) {
      throw new Error(`Unsupported ZIP entry flags or method at byte ${offset}`);
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error("Truncated ZIP entry");
    const path = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    assertSafeArchivePath(path);
    if (localEntries.has(path)) throw new Error(`Duplicate ZIP entry: ${path}`);
    const content = inflateRawSync(archive.subarray(dataStart, dataEnd));
    if (content.length !== uncompressedSize || crc32(content) !== checksum) {
      throw new Error(`Corrupt ZIP entry: ${path}`);
    }
    localEntries.set(path, {
      content,
      checksum,
      compressedSize,
      uncompressedSize,
      offset
    });
    offset = dataEnd;
  }

  const entries = new Map();
  while (
    offset + 4 <= archive.length &&
    archive.readUInt32LE(offset) === centralDirectorySignature
  ) {
    if (offset + 46 > archive.length) {
      throw new Error("Truncated ZIP central directory");
    }
    const madeBy = archive.readUInt16LE(offset + 4);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const checksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > archive.length) throw new Error("Truncated ZIP central entry");
    const path = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    assertSafeArchivePath(path);
    const local = localEntries.get(path);
    if (
      !local ||
      entries.has(path) ||
      madeBy !== 0x0314 ||
      flags !== utf8Flag ||
      method !== deflateMethod ||
      checksum !== local.checksum ||
      compressedSize !== local.compressedSize ||
      uncompressedSize !== local.uncompressedSize ||
      localOffset !== local.offset
    ) {
      throw new Error(`ZIP central directory mismatch: ${path}`);
    }
    entries.set(path, {
      content: local.content,
      mode: (externalAttributes >>> 16) & 0o777
    });
    offset = nextOffset;
  }
  if (entries.size !== localEntries.size) {
    throw new Error("ZIP central directory does not cover every local entry");
  }
  return entries;
}
