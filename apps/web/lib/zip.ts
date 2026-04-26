type ZipEntry = {
  data: Buffer | Uint8Array | string;
  name: string;
};

const CRC32_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  CRC32_TABLE[index] = value >>> 0;
}

function normalizeZipPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "");
}

function toBuffer(data: ZipEntry["data"]): Buffer {
  if (typeof data === "string") {
    return Buffer.from(data, "utf8");
  }

  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function crc32(data: Buffer): number {
  let checksum = 0xffffffff;

  for (const byte of data) {
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }

  return (checksum ^ 0xffffffff) >>> 0;
}

function toDosTime(date: Date): number {
  return (
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  );
}

function toDosDate(date: Date): number {
  const year = Math.max(date.getFullYear(), 1980);

  return (
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  );
}

export function buildZipArchive(entries: ZipEntry[]): Buffer {
  const fileRecords: Buffer[] = [];
  const centralDirectoryRecords: Buffer[] = [];
  const modifiedAt = new Date();
  const dosTime = toDosTime(modifiedAt);
  const dosDate = toDosDate(modifiedAt);
  let offset = 0;

  for (const entry of entries) {
    const normalizedName = normalizeZipPath(entry.name);
    const nameBytes = Buffer.from(normalizedName, "utf8");
    const dataBytes = toBuffer(entry.data);
    const checksum = crc32(dataBytes);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBytes.length, 18);
    localHeader.writeUInt32LE(dataBytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([localHeader, nameBytes, dataBytes]);
    fileRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBytes.length, 20);
    centralHeader.writeUInt32LE(dataBytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    const centralRecord = Buffer.concat([centralHeader, nameBytes]);
    centralDirectoryRecords.push(centralRecord);
    offset += localRecord.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralDirectoryRecords);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...fileRecords,
    centralDirectory,
    endOfCentralDirectory,
  ]);
}
