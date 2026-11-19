(() => {
  const normalizeWord=value=>String(value||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z'\-\s]/g,'').replace(/\s+/g,' ');
  function endpoint(value){
    let raw=String(value||'https://api.deepseek.com').trim();
    if(!/^[a-z][a-z\d+.-]*:\/\//i.test(raw))raw='https://'+raw;
    const url=new URL(raw);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('API 地址无效');
    const path=url.pathname.replace(/\/+$/,'');
    if(/\/chat\/completions$/.test(path))url.pathname=path;
    else if(!path || path==='/')url.pathname=url.hostname==='api.openai.com'?'/v1/chat/completions':'/chat/completions';
    else if(/\/responses$/.test(path))throw Error('请填写 Chat Completions 兼容接口地址');
    else url.pathname=path+'/chat/completions';
    return url.href;
  }
  async function requestAi(config,system,user,payload=null,test=false){
    const proxyInBase=/\/api\/analyze\/?(?:[?#].*)?$/.test(String(config.baseUrl||'').trim());
    const direct=config.mode!=='worker'&&!proxyInBase;
    const url=direct?endpoint(config.baseUrl):String(proxyInBase?config.baseUrl:config.workerUrl||'').trim();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    if(!url){clearTimeout(timer);throw Error('请填写代理地址');}
    if(direct&&!String(config.apiKey||'').trim()){clearTimeout(timer);throw Error('请填写 API Key');}
    try{
      const response=await fetch(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(direct?{Authorization:'Bearer '+config.apiKey.trim()}:{})},body:JSON.stringify(direct?{model:config.model?.trim()||'deepseek-chat',messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:test?16:1800,stream:false}:test?{type:'word',word:'test'}:{type:'chat',systemPrompt:system,userPrompt:user})});
      const text=await response.text();let data;try{data=JSON.parse(text);}catch{if(response.ok)throw Error('接口返回了网页或非 JSON 内容，请核对 API 地址');data={};}
      if(!response.ok){
        const hint={401:'密钥无效或已失效',402:'账户余额不足',403:'接口拒绝访问',404:'接口路径或模型不存在',429:'请求限流或额度不足'}[response.status]||'请求失败';
        let detail=typeof data.error==='string'?data.error:data.error?.message||data.message||'';
        if(config.apiKey)detail=detail.split(config.apiKey).join('[已隐藏]');
        throw Error(`API ${response.status}：${hint}${detail?'；'+detail.slice(0,240):''}`);
      }
      if(!direct)return data.data?.reply??data.reply??data.data??data;
      const content=data.choices?.[0]?.message?.content;
      if(typeof content!=='string'||!content.trim())throw Error('接口未返回回答，请检查模型名称及接口类型');return content;
    }catch(e){if(e.name==='AbortError')throw Error('API 请求超时，请重试');if(e instanceof TypeError)throw Error('网络或浏览器跨域限制导致连接失败；请检查 API 服务的 CORS 设置，或使用代理接口');throw e;}
    finally{clearTimeout(timer);}
  }
  window.C6StudyCore={normalizeWord,endpoint,requestAi};
})();
