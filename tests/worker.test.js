import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.js";

test('worker accepts compatible chat prompts and returns the model reply', async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);assert.match(body.messages[0].content,/reply/);return new Response(JSON.stringify({choices:[{message:{content:'{"reply":"批改成功"}'}}]}));};
 try{const response=await worker.fetch(new Request('https://worker.example/api/analyze',{method:'POST',headers:{Origin:'https://chenxianq16.github.io','Content-Type':'application/json'},body:JSON.stringify({type:'chat',systemPrompt:'Review writing.',userPrompt:'My essay.'})}),{ALLOWED_ORIGIN:'https://chenxianq16.github.io',DEEPSEEK_API_KEY:'test'});assert.equal(response.status,200);assert.equal((await response.json()).data.reply,'批改成功');}finally{globalThis.fetch=original;}
});

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

test("worker rejects invalid payload before calling DeepSeek", async () => {
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
      DEEPSEEK_API_KEY: "test"
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
      DEEPSEEK_API_KEY: "test"
    }
  );
  assert.equal(response.status, 400);
});
