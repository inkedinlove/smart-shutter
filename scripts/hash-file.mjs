import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: node scripts/hash-file.mjs path/to/firmware.bin");
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), inputPath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`File not found: ${resolvedPath}`);
  process.exit(1);
}

const fileStats = fs.statSync(resolvedPath);

if (!fileStats.isFile()) {
  console.error(`Path is not a file: ${resolvedPath}`);
  process.exit(1);
}

const hash = createHash("sha256");
const stream = fs.createReadStream(resolvedPath);

stream.on("data", (chunk) => {
  hash.update(chunk);
});

stream.on("error", (error) => {
  console.error(`Unable to read file: ${error.message}`);
  process.exit(1);
});

stream.on("end", () => {
  process.stdout.write(`sha256=${hash.digest("hex")}\n`);
  process.stdout.write(`sizeBytes=${fileStats.size}\n`);
});
