import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/durable-storage.js',import.meta.url),'utf8');
function setup(storage){const c=vm.createContext({window:{},localStorage:storage,setTimeout,clearTimeout});vm.runInContext(source,c);return c.window.C6Storage;}
test('storage retains readable old records if IndexedDB is unavailable',async()=>{
 const data=new Map([['c6_original_reading_v1','{"records":{"old":1}}']]);
 const api=setup({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
 await api.ready;assert.equal(api.read('c6_original_reading_v1'),' {"records":{"old":1}}'.trim());assert.ok(data.has('c6_original_reading_v1'));
});
test('queued saves capture snapshots in order rather than mutable object references',async()=>{
 const data=new Map(),api=setup({getItem:()=>null,setItem:(k,v)=>data.set(k,v)});await api.ready;
 const record={count:1},a=api.write('reading',record);record.count=2;const b=api.write('reading',record);record.count=3;
 assert.equal(await a,true);assert.equal(await b,true);assert.equal(JSON.parse(data.get('reading')).count,2);
});
test('blocked storage reports failure without removing the previous saved record and can retry',async()=>{
 const data=new Map([['reading','{"old":true}']]);let blocked=true;
 const api=setup({getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(blocked)throw Error('quota');data.set(k,v);}});await api.ready;
 assert.equal(await api.write('reading',{new:true}),false);assert.equal(data.get('reading'),'{"old":true}');
 blocked=false;assert.equal(await api.write('reading',{new:true}),true);assert.equal(data.get('reading'),'{"new":true}');
});
