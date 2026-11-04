import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "assets/styles.css"), "utf8");

test("dictation textarea requests an English keyboard layout", () => {
  assert.match(htmlSource, /id="reason-dialog"/);
  assert.match(appSource, /id="dictation-input"[\s\S]*?lang="en"/);
  assert.match(appSource, /id="dictation-input"[\s\S]*?dir="ltr"/);
});

test("error reason is requested only from the add flow", () => {
  assert.doesNotMatch(appSource, /data-action="self-tag"/);
  assert.match(appSource, /function queueWrongBookItem/);
  assert.match(appSource, /reasonDialog\.showModal\(\)/);
  assert.match(appSource, /\.\.\.item,\s*reason/);
});

test("grammar and collocations can be added from AI analysis", () => {
  assert.match(appSource, /data-action="add-grammar"/);
  assert.match(appSource, /data-action="add-collocation"/);
});

test("review text highlights wrong-book terms in yellow", () => {
  assert.match(appSource, /highlightWrongBookTerms\(sentence\.text\)/);
  assert.match(cssSource, /\.wrong-word-highlight\s*\{[\s\S]*?background:\s*#ffe66d;/);
  assert.match(
    appSource,
    /state\.route === "practice" && state\.phase === "review"\) \{\s*render\(\)/
  );
});

test("every review word can be looked up and the sentence can play", () => {
  assert.match(appSource, /class="lookup-word" data-action="lookup-word"/);
  assert.match(appSource, /data-action="play-review-sentence"/);
  assert.match(appSource, /type:\s*"word"/);
});
