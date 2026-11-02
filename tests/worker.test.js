import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.js";

test("worker answers CORS preflight", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/analyze", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:8080" }
    }),
    { ALLOWED_ORIGIN: "http://127.0.0.1:8080" }
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:8080");
});

test("worker rejects invalid payload before calling OpenAI", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:8080"
      },
      body: JSON.stringify({ type: "unknown" })
    }),
    {
      ALLOWED_ORIGIN: "http://127.0.0.1:8080",
      OPENAI_API_KEY: "test",
      OPENAI_MODEL: "test"
    }
  );
  assert.equal(response.status, 400);
});

test("worker rejects an empty review-article word list", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:8080"
      },
      body: JSON.stringify({ type: "article", words: [] })
    }),
    {
      ALLOWED_ORIGIN: "http://127.0.0.1:8080",
      OPENAI_API_KEY: "test",
      OPENAI_MODEL: "test"
    }
  );
  assert.equal(response.status, 400);
});
