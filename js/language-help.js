(() => {
  const KEY='c6_language_cache_v1',pending=new Map();
  let cache={};try{cache=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
  function remember(key,value){cache[key]={value,time:Date.now()};const keys=Object.keys(cache).sort((a,b)=>cache[a].time-cache[b].time);while(keys.length>250)delete cache[keys.shift()];try{localStorage.setItem(KEY,JSON.stringify(cache));}catch{}}
  async function memo(key,work){if(cache[key])return cache[key].value;if(pending.has(key))return pending.get(key);const task=work().then(v=>{remember(key,v);return v;}).finally(()=>pending.delete(key));pending.set(key,task);return task;}
  async function json(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error(`查询服务暂不可用（${r.status}）`);return await r.json();}catch(e){if(e.name==='AbortError')throw Error('查询超时，请重试');throw e;}finally{clearTimeout(timer);}}
  const bytes=s=>new TextEncoder().encode(s).length;
  function splitText(text,limit=450){
    if(limit<4)throw Error('分段上限过小');const chunks=[];let buffer='';
    for(const token of text.match(/\S+\s*/gu)||[]){
      if(bytes(buffer+token)<=limit){buffer+=token;continue;}
      if(buffer.trim())chunks.push(buffer.trim());buffer='';
      for(const ch of token){if(bytes(buffer+ch)>limit){chunks.push(buffer);buffer='';}buffer+=ch;}
    }
    if(buffer.trim())chunks.push(buffer.trim());return chunks;
  }
  function decode(text){if(typeof document==='undefined')return text;const el=document.createElement('textarea');el.innerHTML=text;return el.value;}
  async function translate(text){
    const source=String(text).trim();if(!source)throw Error('没有可翻译的内容');
    return memo('zh:'+source,async()=>{
      const out=[];
      for(const chunk of splitText(source)){
        const url='https://api.mymemory.translated.net/get?'+new URLSearchParams({q:chunk,langpair:'en|zh-CN'});
        const data=await json(url);
        if(data.quotaFinished || Number(data.responseStatus)!==200)throw Error(data.quotaFinished?'翻译服务今日额度已用完，请稍后再试':'翻译服务暂不可用，请重试');
        const translated=data.responseData?.translatedText;if(!translated)throw Error('未获取到翻译，请重试');out.push(decode(translated));
      }
      return out.join('');
    });
  }
  async function lookupDictionary(raw){
    const word=String(raw).trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z'\-\s]/g,'').replace(/\s+/g,' ');if(word.length<2)throw Error('请选择英文单词');
    return memo('word:'+word,async()=>{
      const [dict,zh]=await Promise.allSettled([word.includes(' ')?Promise.resolve([]):json('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word)),translate(word)]);
      if(zh.status==='rejected')throw zh.reason;
      const definitions=dict.status==='fulfilled'&&Array.isArray(dict.value)?dict.value.flatMap(e=>(e.meanings||[]).flatMap(m=>(m.definitions||[]).slice(0,2).map(d=>`${m.partOfSpeech}: ${d.definition}`))).slice(0,5):[];
      return {w:word,i:zh.value,s:definitions,c:[zh.value],l:'',kind:'dictionary',source:definitions.length?'Free Dictionary / MyMemory':'MyMemory 中译',e:[]};
    });
  }
  let dialog,paragraphToken=0;
  function closeParagraph(){paragraphToken++;dialog?.close();}
  function openParagraph(source){
    if(!dialog){
      dialog=document.createElement('dialog');dialog.className='paragraph-dialog';dialog.innerHTML='<div class="paragraph-dialog-head"><h2>段落翻译</h2><button type="button" class="paragraph-close" aria-label="关闭翻译">×</button></div><div class="paragraph-zh" role="status" aria-live="polite"></div><button type="button" class="paragraph-retry" hidden>重试</button><details><summary>原文</summary><p class="paragraph-source"></p></details><small>MyMemory · 机器翻译，仅供理解参考</small>';
      document.body.append(dialog);dialog.querySelector('.paragraph-close').onclick=closeParagraph;dialog.addEventListener('cancel',()=>{paragraphToken++;});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeParagraph();}});
    }
    const token=++paragraphToken,output=dialog.querySelector('.paragraph-zh'),retry=dialog.querySelector('.paragraph-retry');output.textContent='正在翻译…';retry.hidden=true;dialog.querySelector('.paragraph-source').textContent=source;retry.onclick=()=>openParagraph(source);if(!dialog.open)dialog.showModal();
    translate(source).then(t=>{if(token===paragraphToken)output.textContent=t;}).catch(e=>{if(token===paragraphToken){output.textContent=e.message||'翻译失败，请重试';retry.hidden=false;}});
  }
  window.C6LanguageHelp={translate,lookupDictionary,splitText,openParagraph};
})();
