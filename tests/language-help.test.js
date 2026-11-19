import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/language-help.js',import.meta.url),'utf8');
function setup(fetch){const c=vm.createContext({window:{},localStorage:{getItem(){return null;},setItem(){}},TextEncoder,AbortController,URLSearchParams,setTimeout,clearTimeout,fetch});vm.runInContext(source,c);return c.window.C6LanguageHelp;}
test('translation chunks obey the provider byte limit without cutting unicode characters',()=>{
 const api=setup(()=>{}),text=('An English sentence with 中文 and curly quotes “like this”. ').repeat(35),chunks=api.splitText(text);
 assert.ok(chunks.length>1);assert.ok(chunks.every(c=>new TextEncoder().encode(c).length<=450));
 assert.equal(chunks.join(' ').replace(/\s/g,''),text.replace(/\s/g,''));
});
test('dictionary fallback includes Chinese and English definitions and coalesces repeated requests',async()=>{
 let calls=0;
 const api=setup(async url=>{calls++;return {ok:true,json:async()=>url.includes('dictionaryapi')?[{meanings:[{partOfSpeech:'noun',definitions:[{definition:'A happy accidental discovery.'}]}]}]:{responseStatus:200,responseData:{translatedText:'意外发现'}}};});
 const [a,b]=await Promise.all([api.lookupDictionary('serendipity'),api.lookupDictionary('serendipity')]);
 assert.equal(calls,2);assert.equal(a.c[0],'意外发现');assert.equal(a.kind,'dictionary');assert.match(a.s[0],/noun/);assert.equal(a,b);
 await api.lookupDictionary('serendipity');assert.equal(calls,2);
});
test('failed translations are retryable and never cached as successful translations',async()=>{
 let calls=0;
 const api=setup(async()=>({ok:true,json:async()=>++calls===1?{responseStatus:403,quotaFinished:true}:{responseStatus:200,responseData:{translatedText:'翻译成功'}}}));
 await assert.rejects(api.translate('Try again.'),/额度/);
 assert.equal(await api.translate('Try again.'),'翻译成功');assert.equal(calls,2);
});
