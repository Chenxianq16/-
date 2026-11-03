import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(
  fs.readFileSync(path.join(root, "assets/data/index.json"), "utf8")
);
const remoteRoot =
  "https://media.githubusercontent.com/media/getfine333-ux/cet6-listening-study/main";
const chunkCount = 8;
const force = process.argv.includes("--force");

async function fetchWithTimeout(url, options = {}, timeoutMs = 60_000) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

async function fetchRange(url, start, end, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: { Range: `bytes=${start}-${end}` }
      });
      if (response.status !== 206) {
        throw new Error(`range returned HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

async function responseSize(url) {
  const response = await fetchWithTimeout(url, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`HEAD ${url} returned ${response.status}`);
  }
  const size = Number(response.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`No content length for ${url}`);
  }
  return size;
}

async function downloadExamAudio(entry) {
  const exam = JSON.parse(
    fs.readFileSync(
      path.join(root, "assets/data", entry.dataPath),
      "utf8"
    )
  );
  const remoteUrl = `${remoteRoot}/${exam.meta.sourceAudioPath}`;
  const localPath = path.join(root, exam.meta.audio);
  if (
    !force &&
    fs.existsSync(localPath) &&
    fs.statSync(localPath).size > 1_000_000
  ) {
    console.log(`skip ${entry.id} (already downloaded)`);
    return;
  }

  const size = await responseSize(remoteUrl);
  const chunkSize = Math.ceil(size / chunkCount);
  const chunks = new Array(chunkCount);
  console.log(`download ${entry.id} (${(size / 1024 / 1024).toFixed(1)} MiB)`);

  await Promise.all(
    Array.from({ length: chunkCount }, async (_, index) => {
      const start = index * chunkSize;
      const end = Math.min(size - 1, start + chunkSize - 1);
      const response = await fetchRange(remoteUrl, start, end);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length !== end - start + 1) {
        throw new Error(`${entry.id} chunk ${index + 1} has an invalid length`);
      }
      chunks[index] = buffer;
    })
  );

  const merged = Buffer.concat(chunks);
  if (merged.length !== size) {
    throw new Error(`${entry.id} merged length does not match HTTP size`);
  }
  const isMp3 =
    merged.subarray(0, 3).toString() === "ID3" ||
    (merged[0] === 0xff && (merged[1] & 0xe0) === 0xe0);
  const isM4a = merged.subarray(4, 8).toString() === "ftyp";
  const expectedExtension = path.extname(localPath).toLowerCase();
  if (
    (expectedExtension === ".mp3" && !isMp3) ||
    (expectedExtension === ".m4a" && !isM4a)
  ) {
    throw new Error(
      `${entry.id} content does not match expected extension ${expectedExtension}`
    );
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, merged);
  console.log(`saved ${entry.id} -> ${exam.meta.audio}`);
}

for (const entry of index.exams) {
  await downloadExamAudio(entry);
}

console.log("Audio download complete.");
