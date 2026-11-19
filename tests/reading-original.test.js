import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const context=vm.createContext({window:{addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(fs.readFileSync(new URL('../assets/data/reading-papers.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../assets/data/reading-native.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../js/reading-original.js',import.meta.url),'utf8'),context);
const api=context.window.C6OriginalReading;
test('native reading has all 150 numbered questions, complete word banks and four options per detailed question',()=>{
  let total=0;
  for(const p of context.window.C6_READING_NATIVE){
    assert.equal(p.cloze.options.length,15);
    assert.equal(new Set(p.cloze.options.map(x=>x.letter)).size,15);
    assert.equal(p.cloze.questions.length,10);
    assert.equal(p.matching.questions.length,10);
    assert.ok(p.matching.paragraphs.length>=13);
    const qs=[...p.cloze.questions,...p.matching.questions,...p.detailed.flatMap(x=>x.questions)];
    assert.deepEqual(Array.from(qs,x=>x.number),Array.from({length:30},(_,i)=>26+i));
    for(const part of p.detailed){
      assert.ok(part.paragraphs.join(' ').length>2000);
      assert.equal(part.questions.length,5);
      for(const q of part.questions){assert.equal(q.options.length,4);assert.equal(q.options.map(x=>x.letter).join(''),'ABCD');assert.ok(q.options.every(x=>x.text.length>15));}
    }
    assert.equal((p.cloze.paragraphs.join(' ').match(/\[\d{2}\]/g)||[]).length,10);
    total+=qs.length;
  }
  assert.equal(total,150);
  assert.equal(new Set(context.window.C6_READING_NATIVE.map(p=>p.id)).size,5);
});
test('original papers match their recorded hashes and keep every relevant page in range',()=>{
  const papers=context.window.C6_READING_PAPERS;
  assert.equal(papers.length,5);
  assert.equal(new Set(papers.map(p=>p.sha256)).size,5);
  for(const p of papers){
    const data=fs.readFileSync(new URL('../'+p.file,import.meta.url));
    assert.equal(data.subarray(0,5).toString(),'%PDF-');
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),p.sha256);
    for(const pages of Object.values(p.pages)){
      assert.ok(pages.length>=2);
      assert.ok(pages.every((page,i)=>page>=1 && page<=p.pageCount && (i===0 || page===pages[i-1]+1)));
    }
  }
});
test('reference key rejects missing, duplicated and out-of-range question numbers',()=>{
  assert.throws(()=>api.parseKey('26.A 27.B','cloze','R'));
  assert.throws(()=>api.parseKey('26.A 26.B 27.C 28.D 29.E 30.F 31.G 32.H 33.I 34.J 35.K','cloze','R'));
  assert.throws(()=>api.parseKey('36.R 37.R 38.R 39.R 40.R 41.R 42.R 43.R 44.R 45.R','matching','M'));
});
test('word bank disallows reused words while paragraph matching and detailed reading allow repeated letters',()=>{
  assert.throws(()=>api.parseKey('AAAAAAAAAA','cloze','R'));
  assert.equal(api.parseKey('ABCDEFGHIJ','cloze','R')[35],'J');
  assert.equal(api.parseKey('RRRRRRRRRR','matching','R')[45],'R');
  assert.equal(api.parseKey('AAAAAAAAAA','detailed','R')[55],'A');
});
