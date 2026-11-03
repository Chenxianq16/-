import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = {
  data: new Map(),
  getItem(key) {
    return this.data.get(key) ?? null;
  },
  setItem(key, value) {
    this.data.set(key, value);
  }
};

const { addWrongWord, loadStore } = await import("../js/storage.js");

test("wrong-book entries preserve type and selected reason", () => {
  const store = loadStore();
  addWrongWord(store, "conduct an interview", {
    kind: "phrase",
    reason: "固定搭配不熟悉",
    meaningZh: "进行面试",
    context: "The manager wants to conduct an interview."
  });
  const entry = store.wrongWords["conduct an interview"];
  assert.equal(entry.kind, "phrase");
  assert.equal(entry.reason, "固定搭配不熟悉");
  assert.equal(entry.meaningZh, "进行面试");
});
