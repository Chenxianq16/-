import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function core(fetch){const c=vm.createContext({window:{},fetch,URL,AbortController,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(new URL('../js/study-core.js',import.meta.url),'utf8'),c);return c.window.C6StudyCore;}
test('direct API roots and version roots resolve to the chat endpoint',()=>{
 const c=core();assert.equal(c.endpoint('https://api.deepseek.com'),'https://api.deepseek.com/chat/completions');assert.equal(c.endpoint('https://example.com/v1/'),'https://example.com/v1/chat/completions');assert.equal(c.endpoint('https://api.openai.com'),'https://api.openai.com/v1/chat/completions');assert.equal(c.normalizeWord('  Take It for Granted '),'take it for granted');
});
test('a proxy URL pasted into direct mode sends proxy chat format without exposing the API key',async()=>{
 let request;
 const c=core(async(url,options)=>{request={url,...options};return {ok:true,text:async()=>JSON.stringify({data:{reply:'正常回复'}})};});
 assert.equal(await c.requestAi({mode:'direct',baseUrl:'https://lingosu.online/cet6-listening-ai/api/analyze',apiKey:'private-key'},'Tutor','Please review'),'正常回复');
 assert.equal(JSON.parse(request.body).type,'chat');assert.equal(request.headers.Authorization,undefined);assert.equal(request.body.includes('private-key'),false);
});
test('API response errors preserve useful details while redacting the entered key',async()=>{
 const c=core(async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:{message:'Invalid private-key'}})}));
 await assert.rejects(c.requestAi({baseUrl:'https://example.com/v1',apiKey:'private-key'},'','test'),e=>e.message.includes('401')&&!e.message.includes('private-key'));
});
