(async () => {
  if(window.C6Storage)await window.C6Storage.ready;
  'use strict';
  const TYPES = {
    cloze: {label:'选词填空', start:26, end:35, detail:'26–35 · 15 选 10'},
    matching: {label:'长篇阅读匹配', start:36, end:45, detail:'36–45 · 段落匹配'},
    detailed: {label:'仔细阅读', start:46, end:55, detail:'46–55 · 两篇全文'}
  };
  const STORAGE='c6_original_reading_v1';
  let host, options={}, saveWarning=false;
  const initial=()=>({paperId:window.C6_READING_PAPERS[0].id,type:'cloze',records:{}});
  let state;
  try { state={...initial(),...JSON.parse((window.C6Storage?window.C6Storage.read(STORAGE):localStorage.getItem(STORAGE))||'null')}; } catch { state=initial(); }
  if(!TYPES[state.type]) state.type='cloze';
  if(!window.C6_READING_PAPERS.some(p=>p.id===state.paperId))state.paperId=window.C6_READING_PAPERS[0].id;
  const paper=()=>window.C6_READING_PAPERS.find(p=>p.id===state.paperId);
  const numbers=type=>Array.from({length:TYPES[type].end-TYPES[type].start+1},(_,i)=>TYPES[type].start+i);
  function save(){
    const task=window.C6Storage?window.C6Storage.write(STORAGE,state):Promise.resolve().then(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));return true;}catch{return false;}});
    return task.then(ok=>{saveWarning=!ok;if(host?.querySelector('.or-result'))updateResult();return ok;});
  }
  function referenceKey(paperId,type){
    const raw=window.C6_READING_ANSWERS?.papers[paperId]?.[type];
    if(!raw)return null;
    const metadata=window.C6_READING_PAPERS.find(p=>p.id===paperId);
    return parseKey(raw,type,metadata.matchingLastLetter);
  }
  function applyReference(r,paperId,type){
    const key=referenceKey(paperId,type);
    if(key){r.key=key;r.keySource='builtin';r.keyVersion=window.C6_READING_ANSWERS.version;}
    return r;
  }
  function record(){return applyReference(state.records[state.paperId+':'+state.type] ||= {answers:{},note:'',keyRaw:'',key:null,submitted:false},state.paperId,state.type);}
  function restoreReferenceAnswers(snapshot){
    let changed=false;
    for(const p of window.C6_READING_NATIVE)for(const type of Object.keys(TYPES)){
      const r=snapshot.records?.[p.id+':'+type];
      if(!r||!referenceKey(p.id,type)||r.keyVersion===window.C6_READING_ANSWERS.version&&r.keySource==='builtin')continue;
      applyReference(r,p.id,type);changed=true;
      const parts=type==='detailed'?p.detailed:[p[type]];
      parts.forEach((part,i)=>{
        if(!(type==='detailed'?r.submittedParts?.[i]:r.submitted))return;
        for(const q of part.questions){
          const selected=r.answers?.[q.number],id=[p.id,type,i,q.number].join(':');
          if(selected&&selected!==r.key[q.number]){
            snapshot.wrongQuestions ||= {};
            snapshot.wrongQuestions[id] ||= {paperId:p.id,type,part:i,number:q.number,selected,addedAt:Date.now()};
          }
        }
      });
    }
    return changed;
  }
  function parseKey(raw,type,lastLetter){
    const ns=numbers(type), maximum=type==='cloze'?'O':type==='matching'?lastLetter:'D';
    const text=raw.trim().toUpperCase(), result={};
    const labelled=[...text.matchAll(/(\d{2})\s*[.．、:：)\-]?\s*([A-Z])/g)];
    if(labelled.length){
      for(const m of labelled){if(!ns.includes(+m[1]) || result[m[1]])throw Error('题号重复或不属于当前题型');result[m[1]]=m[2];}
    }else{
      const chars=text.replace(/[\s,，;；、]/g,'');
      if(!/^[A-Z]{10}$/.test(chars))throw Error('请录入当前题型的 10 个答案');
      ns.forEach((q,i)=>result[q]=chars[i]);
    }
    if(ns.some(q=>!result[q] || result[q]<'A' || result[q]>maximum))throw Error('请核对答案数量与字母范围');
    if(type==='cloze' && new Set(Object.values(result)).size!==10)throw Error('选词填空的单词不能重复使用');
    return result;
  }
  const native=()=>window.C6_READING_NATIVE.find(p=>p.id===state.paperId);
  let cleanupInk;
  state.part ||= 0;
  function el(tag,cls,content){const x=document.createElement(tag);if(cls)x.className=cls;if(content!==undefined)x.textContent=content;return x;}
  function visibleQuestions(){return state.type==='detailed'?native().detailed[state.part].questions:native()[state.type].questions;}
  function submitted(r){return state.type==='detailed'?Boolean(r.submittedParts?.[state.part]):Boolean(r.submitted);}
  function invalidate(r){r.submitted=false;if(state.type==='detailed'){r.submittedParts ||= {};r.submittedParts[state.part]=false;}}
  function updateResult(){
    const r=record(),qs=visibleQuestions(),count=qs.filter(q=>r.answers[q.number]).length;
    host.querySelector('.or-progress').textContent=`已答 ${count} / ${qs.length} · ${r.keySource==='builtin'?'答案已内置':r.key?'已录入参考答案':'答案待核对'}`;
    for(const row of host.querySelectorAll('.native-question')){const n=row.dataset.question;row.dataset.grade=submitted(r)&&r.key&&r.answers[n]?(r.answers[n]===r.key[n]?'correct':'wrong'):'';const fb=row.querySelector('.native-feedback');fb.textContent=submitted(r)&&r.key?`参考答案：${r.key[n]}`:'';}
    for(const p of host.querySelectorAll('.native-paragraph')){p.dataset.translationReady=String(submitted(r));p.title=submitted(r)?'点击查看段落翻译':'提交本篇后可查看段落翻译';p.tabIndex=submitted(r)?0:-1;}
    host.querySelector('.or-result').textContent=saveWarning?'浏览器暂时无法保存作答，请备份记录。':!submitted(r)?'':r.key?`本篇答对 ${qs.filter(q=>r.answers[q.number]===r.key[q.number]).length} / ${qs.length}`:'作答已提交；可点击段落查看翻译。参考答案尚未核对，暂不判分。';
  }
  function render(){
    if(!host)return;cleanupInk?.();
    const p=paper(),data=native(),r=record();r.ink ||= {};const inkKey=state.type==='detailed'?'p'+state.part:state.type;r.ink[inkKey] ||= {strokes:[]};
    host.innerHTML='<div class="or-heading"><h1>阅读练习</h1><select class="or-paper-select" aria-label="选择试卷"></select></div><div class="or-types" role="group" aria-label="阅读题型"></div><div class="native-subtabs"></div><div class="or-layout"><section class="native-article-card"><div id="pencil-toolbar" class="native-toolbar"></div><div class="native-article-scroll"><div class="native-surface lookup-zone"></div></div></section><section class="native-question-panel"><h2>题目</h2><div class="or-progress"></div><div class="native-questions"></div><button type="button" class="or-submit">保存作答</button><div class="or-result" role="status" aria-live="polite"></div><details class="or-key"><summary>录入参考答案</summary><textarea class="or-key-input" rows="2" aria-label="参考答案"></textarea><button type="button" class="or-save-key">保存答案</button><div class="or-key-status" role="status"></div></details><label>笔记<textarea class="or-note" rows="3" placeholder="写点笔记…"></textarea></label><button type="button" class="or-reset">重做当前篇章</button></section></div>';
    const select=host.querySelector('.or-paper-select');for(const item of window.C6_READING_PAPERS){const opt=el('option','',item.title);opt.value=item.id;opt.selected=item.id===p.id;select.append(opt);}select.onchange=()=>{state.paperId=select.value;save();render();};
    for(const [key,t]of Object.entries(TYPES)){const b=el('button','or-type');b.type='button';b.dataset.type=key;b.setAttribute('aria-pressed',String(key===state.type));b.append(el('strong','',t.label),el('span','',t.detail));b.onclick=()=>{state.type=key;save();render();};host.querySelector('.or-types').append(b);}
    if(state.type==='detailed')for(let i=0;i<2;i++){const b=el('button','native-part',i===0?'篇一 · 46–50':'篇二 · 51–55');b.type='button';b.dataset.part=i;b.setAttribute('aria-pressed',String(i===state.part));b.onclick=()=>{state.part=i;save();render();};host.querySelector('.native-subtabs').append(b);}
    const surface=host.querySelector('.native-surface');
    state.wrongQuestions ||= {};
    const wrongBook=el('button','native-wrongbook',`错题本 (${Object.keys(state.wrongQuestions).length})`);wrongBook.type='button';wrongBook.onclick=showWrongBook;host.querySelector('.or-heading').append(wrongBook);
    host.querySelector('.native-question-panel').classList.add('lookup-zone');
    const content=state.type==='detailed'?data.detailed[state.part]:data[state.type];
    if(state.type==='cloze'){
      const bank=el('div','native-wordbank');for(const opt of content.options)bank.append(el('span','',`${opt.letter}. ${opt.text}`));surface.append(bank);
    }
    for(const [i,para]of content.paragraphs.entries()){
      const paragraph=el('p','native-paragraph');paragraph.dataset.paragraph=i;
      if(state.type==='matching'){paragraph.append(el('strong','native-para-letter',para.letter+' '),document.createTextNode(para.text));}
      else if(state.type==='cloze'){
        const segments=para.split(/(\[\d{2}\])/g);for(const part of segments){if(/^\[\d{2}\]$/.test(part)){const b=el('button','native-blank',part);b.type='button';b.onclick=()=>host.querySelector(`[data-question="${part.slice(1,-1)}"]`).scrollIntoView({behavior:'smooth',block:'center'});paragraph.append(b);}else paragraph.append(document.createTextNode(part));}
      }else paragraph.textContent=para;
      const source=typeof para==='string'?para:para.text;
      let clickTimer;
      paragraph.onclick=e=>{if(!submitted(r)||e.target.closest('button')||window.getSelection?.().toString().trim()||e.detail>1)return;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{if(paragraph.isConnected&&submitted(r))window.C6LanguageHelp.openParagraph(source);},300);};
      paragraph.ondblclick=()=>clearTimeout(clickTimer);
      paragraph.onkeydown=e=>{if(submitted(r)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.C6LanguageHelp.openParagraph(source);}};
      surface.append(paragraph);
    }
    const qbox=host.querySelector('.native-questions');
    for(const q of visibleQuestions()){
      const card=el('fieldset','native-question');card.dataset.question=q.number;card.append(el('legend','',`${q.number}. ${q.stem}`));
      if(state.type==='detailed'){
        for(const opt of q.options){const label=el('label','native-option'),radio=el('input');radio.type='radio';radio.name=`native-q${q.number}`;radio.value=opt.letter;radio.checked=r.answers[q.number]===opt.letter;radio.onchange=()=>{r.answers[q.number]=opt.letter;invalidate(r);save();updateResult();};label.append(radio,el('span','',`${opt.letter}. ${opt.text}`));card.append(label);}
      }else{
        const choice=el('select','native-choice');choice.setAttribute('aria-label',`第 ${q.number} 题答案`);const empty=el('option','','选择答案');empty.value='';choice.append(empty);
        const opts=state.type==='cloze'?content.options:content.paragraphs.map(x=>({letter:x.letter,text:`段落 ${x.letter}`}));
        for(const opt of opts){const item=el('option','',state.type==='cloze'?`${opt.letter}. ${opt.text}`:opt.text);item.value=opt.letter;choice.append(item);}choice.value=r.answers[q.number]||'';choice.onchange=()=>{r.answers[q.number]=choice.value;invalidate(r);save();updateResult();};card.append(choice);
      }
      card.append(el('div','native-feedback'));
      const savedKey=[p.id,state.type,state.type==='detailed'?state.part:0,q.number].join(':');
      const collect=el('button','native-collect',state.wrongQuestions[savedKey]?'已收藏错题':'加入错题本');collect.type='button';collect.disabled=Boolean(state.wrongQuestions[savedKey]);
      collect.onclick=async()=>{
        collect.disabled=true;collect.textContent="正在保存…";
        state.wrongQuestions[savedKey]={paperId:p.id,type:state.type,part:state.part,number:q.number,selected:r.answers[q.number]||'',addedAt:Date.now()};
        if(!await save()){delete state.wrongQuestions[savedKey];collect.disabled=false;collect.textContent='重试收藏';updateResult();return;}
        collect.textContent='已收藏错题';collect.disabled=true;wrongBook.textContent=`错题本 (${Object.keys(state.wrongQuestions).length})`;
      };
      card.append(collect);qbox.append(card);
    }
    host.querySelector('.or-submit').textContent='提交本篇';
    host.querySelector('.or-submit').onclick=async()=>{
      const btn=host.querySelector('.or-submit');btn.disabled=true;btn.textContent='正在保存…';
      const previousWrong={...state.wrongQuestions},previousSubmitted=r.submitted,previousParts={...r.submittedParts};
      r.submitted=true;if(state.type==='detailed'){r.submittedParts ||= {};r.submittedParts[state.part]=true;}
      if(r.key){for(const q of visibleQuestions()){if(r.answers[q.number]&&r.answers[q.number]!==r.key[q.number]){const id=[p.id,state.type,state.type==='detailed'?state.part:0,q.number].join(':');state.wrongQuestions[id]={paperId:p.id,type:state.type,part:state.part,number:q.number,selected:r.answers[q.number],addedAt:Date.now()};}}}
      const ok=await save();btn.disabled=false;btn.textContent='提交本篇';
      if(!ok){state.wrongQuestions=previousWrong;r.submitted=previousSubmitted;r.submittedParts=previousParts;updateResult();return;}
      updateResult();
      if(ok){render();if(visibleQuestions().some(q=>r.answers[q.number]))options.onActivity?.(`阅读：${p.title} · ${TYPES[state.type].label}`);}
    };
    if(r.keySource==='builtin')host.querySelector('.or-key').remove();
    const key=host.querySelector('.or-key-input');if(key){key.value=r.keyRaw;key.placeholder=`录入 ${TYPES[state.type].start}–${TYPES[state.type].end} 参考答案`;
    host.querySelector('.or-save-key').onclick=async()=>{try{r.key=parseKey(key.value,state.type,p.matchingLastLetter);r.keyRaw=key.value;const ok=await save();host.querySelector('.or-key-status').textContent=ok?'已保存你录入的参考答案':'保存失败，请重试';updateResult();}catch(e){host.querySelector('.or-key-status').textContent=e.message;}};}
    const note=host.querySelector('.or-note');note.value=r.note;note.oninput=()=>{r.note=note.value;save();};
    host.querySelector('.or-reset').onclick=()=>{for(const q of visibleQuestions())delete r.answers[q.number];invalidate(r);save();render();};
    updateResult();cleanupInk=window.C6ReadingInk.attach({surface,toolbar:host.querySelector('.native-toolbar'),record:r.ink[inkKey],onSave:save});
  }
  function showWrongBook(){
    const dialog=el('dialog','paragraph-dialog'),heading=el('div','paragraph-dialog-head');heading.append(el('h2','','阅读错题本'));const close=el('button','','×');close.type='button';close.onclick=()=>dialog.close();heading.append(close);dialog.append(heading);
    const rows=Object.values(state.wrongQuestions||{}).sort((a,b)=>b.addedAt-a.addedAt);
    if(!rows.length)dialog.append(el('p','','尚未收藏错题'));
    for(const item of rows){const p=window.C6_READING_NATIVE.find(p=>p.id===item.paperId);if(!p)continue;const content=item.type==='detailed'?p.detailed[item.part]:p[item.type];const q=content.questions.find(q=>q.number===item.number);if(!q)continue;const button=el('button','wrongbook-row',`${p.title} · ${TYPES[item.type].label}\n${q.number}. ${q.stem}`);button.type='button';button.onclick=()=>{state.paperId=item.paperId;state.type=item.type;state.part=item.part;save();dialog.close();render();host.querySelector(`[data-question="${item.number}"]`)?.scrollIntoView({block:'center'});};dialog.append(button);}
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  if(restoreReferenceAnswers(state))save();
  window.C6OriginalReading={mount(root,settings={}){options=settings;if(host===root)return;host=root;render();},parseKey,numbers,referenceKey,restoreReferenceAnswers};
})();
