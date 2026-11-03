import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "assets/styles.css"), "utf8");

test("wrong dictation input is crossed out and the correct word stays visible", () => {
  assert.match(
    appSource,
    /diff-token diff-wrong"><span class="diff-actual">.*?diff-expected/
  );
  assert.match(
    cssSource,
    /\.diff-wrong \.diff-actual\s*\{\s*text-decoration:\s*line-through;/
  );
  assert.doesNotMatch(
    cssSource,
    /\.diff-wrong \.diff-expected\s*\{[^}]*text-decoration:\s*line-through;/
  );
});
