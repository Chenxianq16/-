import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const context=vm.createContext({window:{addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(fs.readFileSync(new URL('../assets/data/reading-papers.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../assets/data/reading-native.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../assets/data/reading-answers.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../js/reading-original.js',import.meta.url),'utf8'),context);
const api=context.window.C6OriginalReading;

test('all uploaded reading questions have built-in keys that refer to actual available options',()=>{
  let total=0;
  for(const p of context.window.C6_READING_NATIVE)for(const type of ['cloze','matching','detailed']){
    const key=api.referenceKey(p.id,type);
    assert.equal(Object.keys(key).length,10);
    const questions=type==='detailed'?p.detailed.flatMap(x=>x.questions):p[type].questions;
    for(const q of questions){
      const choices=type==='cloze'?p.cloze.options:type==='matching'?p.matching.paragraphs:q.options;
      assert.ok(choices.some(x=>x.letter===key[q.number]),`${p.id} ${q.number}`);total++;
    }
  }
  assert.equal(total,150);
  assert.equal(api.referenceKey('2024-12-set3','cloze')[32],'G');
  assert.equal(api.referenceKey('2025-06-set2','cloze')[34],'O');
  assert.equal(api.referenceKey('2025-06-set1','detailed')[52],'D');
});

test('existing submissions gain verified keys and missing mistakes without changing answers, ink, notes or manual collections',()=>{
  const saved={paperId:'2025-06-set1',type:'detailed',records:{
    '2025-06-set1:detailed':{answers:{46:'A',47:'A',51:'A'},note:'retain note',ink:{p0:{strokes:[{points:[1,2]}]}},key:{46:'A'},keyRaw:'old manual key',submitted:true,submittedParts:{0:true}},
    '2024-12-set3:cloze':{answers:{26:'A',32:'G'},submitted:true},
    '2025-06-set2:matching':{answers:{36:'A'},submitted:false}
  },wrongQuestions:{'2025-06-set1:detailed:0:47':{addedAt:123,selected:'B'}}};
  const original=JSON.stringify(saved.records['2025-06-set1:detailed']);
  assert.equal(api.restoreReferenceAnswers(saved),true);
  const before=JSON.parse(original),after=saved.records['2025-06-set1:detailed'];
  for(const field of ['answers','note','ink','keyRaw','submitted','submittedParts'])assert.deepEqual(after[field],before[field]);
  assert.equal(after.key[46],'C');
  assert.equal(after.keySource,'builtin');
  assert.deepEqual(Object.keys(saved.wrongQuestions).sort(),['2024-12-set3:cloze:0:26','2025-06-set1:detailed:0:46','2025-06-set1:detailed:0:47']);
  assert.equal(saved.wrongQuestions['2025-06-set1:detailed:0:47'].addedAt,123);
  const snapshot=JSON.stringify(saved);
  assert.equal(api.restoreReferenceAnswers(saved),false);
  assert.equal(JSON.stringify(saved),snapshot);
});
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
