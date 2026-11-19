(() => {
  const keys=['cet6_coach_v3','c6_original_reading_v1','c6_language_cache_v1'];
  const values=new Map(),queues=new Map();
  const legacy=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  let database;
  const opened=new Promise(resolve=>{
    if(!window.indexedDB){resolve(null);return;}
    let settled=false;
    const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);database=db;resolve(db);};
    const timer=setTimeout(()=>finish(null),5000);
    try{
      const request=indexedDB.open('c6-study-data',1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'key'});};
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();finish(request.result);};
      request.onerror=()=>finish(null);
    }catch{finish(null);}
  });
  function get(db,key){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Storage read timeout')),7000);try{const tx=db.transaction('snapshots','readonly'),r=tx.objectStore('snapshots').get(key);r.onsuccess=()=>{clearTimeout(timer);resolve(r.result?.value??null);};r.onerror=()=>{clearTimeout(timer);reject(r.error);};tx.onabort=()=>{clearTimeout(timer);reject(tx.error);};}catch(e){clearTimeout(timer);reject(e);}});}
  function put(db,key,value){return new Promise((resolve,reject)=>{
    let tx;const timer=setTimeout(()=>{try{tx?.abort();}catch{}reject(Error('Storage timeout'));},7000);
    try{tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({key,value,updatedAt:Date.now()});tx.oncomplete=()=>{clearTimeout(timer);resolve();};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error||Error('Storage unavailable'));};}catch(e){clearTimeout(timer);reject(e);}
  });}
  function discardLegacy(key){try{localStorage.removeItem(key);}catch{}}
  const ready=opened.then(async db=>{
    await Promise.all(keys.map(async key=>{
      const old=legacy(key);if(old!==null)values.set(key,old);
      if(!db)return;
      try{
        const stored=await get(db,key);
        if(stored!==null){values.set(key,stored);discardLegacy(key);}
        else if(old!==null){JSON.parse(old);await put(db,key,old);discardLegacy(key);}
      }catch{/* Keep the readable legacy copy until a database commit succeeds. */}
    }));
  });
  function read(key){return values.has(key)?values.get(key):legacy(key);}
  function write(key,value){
    let snapshot;try{snapshot=typeof value==='string'?value:JSON.stringify(value);}catch{return Promise.resolve(false);}
    values.set(key,snapshot);
    const task=(queues.get(key)||ready).catch(()=>{}).then(async()=>{
      if(database){try{await put(database,key,snapshot);discardLegacy(key);return true;}catch{}}
      try{localStorage.setItem(key,snapshot);return true;}catch{return false;}
    });
    queues.set(key,task);return task;
  }
  window.C6Storage={ready,read,write};
})();
