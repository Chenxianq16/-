(() => {
  let tool='browse',pencilOnly=true;
  window.C6ReadingInk={attach({surface,toolbar,record,onSave}){
    record.strokes ||= [];
    const canvas=document.createElement('canvas');canvas.className='native-ink';canvas.id='reading-ink-canvas';canvas.setAttribute('aria-label','阅读手写圈画层');surface.append(canvas);
    const ctx=canvas.getContext('2d'),undo=[];let drawing=null,erasing=false;
    function remember(){undo.push(JSON.parse(JSON.stringify(record.strokes)));if(undo.length>40)undo.shift();}
    function paint(){
      const w=surface.clientWidth,h=surface.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
      if(canvas.width!==Math.ceil(w*dpr)||canvas.height!==Math.ceil(h*dpr)){canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      for(const stroke of record.strokes){
        ctx.strokeStyle=stroke.tool==='marker'?'rgba(235,201,81,.4)':'#536f88';ctx.lineCap='round';ctx.lineJoin='round';
        ctx.beginPath();stroke.points.forEach((p,i)=>{const x=p.x*w,y=p.y*h;if(!i)ctx.moveTo(x,y);else{ctx.lineWidth=stroke.tool==='marker'?15:1.1+(p.pressure||.5)*1.8;ctx.lineTo(x,y);}});ctx.stroke();
      }
    }
    function sync(){
      for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));
      canvas.style.pointerEvents=tool==='browse'?'none':'auto';canvas.style.touchAction=pencilOnly?'pan-y':'none';
    }
    toolbar.innerHTML='<div class="ink-tools" role="group" aria-label="书写工具"><button type="button" data-tool="browse">浏览</button><button type="button" data-tool="pen">细笔</button><button type="button" data-tool="marker">荧光笔</button><button type="button" data-tool="eraser">橡皮</button><button type="button" class="ink-undo">撤销</button><button type="button" class="ink-clear">清空</button></div><label class="ink-pencil"><input type="checkbox" class="ink-pencil-only" /> 仅 Pencil</label>';
    const checkbox=toolbar.querySelector('.ink-pencil-only');checkbox.checked=pencilOnly;checkbox.onchange=()=>{pencilOnly=checkbox.checked;sync();};
    for(const b of toolbar.querySelectorAll('[data-tool]'))b.onclick=()=>{tool=b.dataset.tool;sync();};
    function back(){if(undo.length){record.strokes=undo.pop();paint();onSave();}}
    toolbar.querySelector('.ink-undo').onclick=back;
    toolbar.querySelector('.ink-clear').onclick=()=>{remember();record.strokes=[];paint();onSave();};
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,pressure:e.pressure||.5};};
    function erase(p){const w=surface.clientWidth,h=surface.scrollHeight;record.strokes=record.strokes.filter(s=>!s.points.some(q=>Math.hypot((q.x-p.x)*w,(q.y-p.y)*h)<17));paint();}
    canvas.onpointerdown=e=>{
      if(tool==='browse'||(pencilOnly && e.pointerType==='touch'))return;
      e.preventDefault();remember();canvas.setPointerCapture(e.pointerId);const p=point(e);
      if(tool==='eraser'){erasing=true;erase(p);}else{drawing={tool,points:[p]};record.strokes.push(drawing);paint();}
    };
    canvas.onpointermove=e=>{if(!drawing&&!erasing)return;e.preventDefault();if(erasing)erase(point(e));else{for(const x of e.getCoalescedEvents?.()||[e])drawing.points.push(point(x));paint();}};
    const finish=()=>{if(drawing||erasing){drawing=null;erasing=false;onSave();}};
    canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
    const touch=e=>{if(tool!=='browse'&&(!pencilOnly||[...e.touches].some(t=>t.touchType==='stylus')))e.preventDefault();};
    canvas.addEventListener('touchmove',touch,{passive:false});
    const keyboard=e=>{if(!surface.getBoundingClientRect().width || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const next={'1':'browse','2':'pen','3':'marker','4':'eraser'}[e.key];if(next){tool=next;sync();}if(e.key.toLowerCase()==='z'&&!e.altKey){e.preventDefault();back();}};
    window.addEventListener('keydown',keyboard);
    const observer=new ResizeObserver(paint);observer.observe(surface);sync();paint();
    return()=>{finish();observer.disconnect();window.removeEventListener('keydown',keyboard);};
  }};
})();
