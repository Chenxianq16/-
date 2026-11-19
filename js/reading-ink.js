(() => {
  let tool='browse',previousTool='pen',pencilOnly=true;
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
      const names={browse:'浏览',pen:'细笔',marker:'荧光笔',eraser:'橡皮'};
      toolbar.querySelector('.ink-previous').textContent='切回'+names[previousTool];
    }
    function setTool(next){if(next!==tool){previousTool=tool;tool=next;}sync();}
    function switchBack(){setTool(previousTool);}
    toolbar.innerHTML='<div class="ink-tools" role="group" aria-label="书写工具"><button type="button" data-tool="browse">浏览</button><button type="button" data-tool="pen">细笔</button><button type="button" data-tool="marker">荧光笔</button><button type="button" data-tool="eraser">橡皮</button><button type="button" class="ink-previous" title="双击阅读空白处或按 Q 切换"></button><button type="button" class="ink-undo">撤销</button><button type="button" class="ink-clear">清空</button></div><label class="ink-pencil"><input type="checkbox" class="ink-pencil-only" /> 仅 Pencil</label>';
    const checkbox=toolbar.querySelector('.ink-pencil-only');checkbox.checked=pencilOnly;checkbox.onchange=()=>{pencilOnly=checkbox.checked;sync();};
    for(const b of toolbar.querySelectorAll('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
    toolbar.querySelector('.ink-previous').onclick=switchBack;
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
    const finish=()=>{if(drawing||erasing){if(drawing&&drawing.points.every(p=>Math.hypot((p.x-drawing.points[0].x)*surface.clientWidth,(p.y-drawing.points[0].y)*surface.clientHeight)<3)){record.strokes=record.strokes.filter(s=>s!==drawing);undo.pop();}drawing=null;erasing=false;onSave();}};
    canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
    const touch=e=>{if(tool!=='browse'&&(!pencilOnly||[...e.touches].some(t=>t.touchType==='stylus')))e.preventDefault();};
    canvas.addEventListener('touchmove',touch,{passive:false});
    function overText(x,y){
      const old=canvas.style.pointerEvents;canvas.style.pointerEvents='none';
      let range;
      try{if(document.caretRangeFromPoint)range=document.caretRangeFromPoint(x,y);else{const p=document.caretPositionFromPoint?.(x,y);if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset);}}}finally{canvas.style.pointerEvents=old;}
      const node=range?.startContainer;if(!node||node.nodeType!==3||!surface.contains(node))return false;
      for(const offset of [range.startOffset,range.startOffset-1]){if(offset<0||offset>=node.length||!/[a-zA-Z'-]/.test(node.textContent[offset]))continue;const r=document.createRange();r.setStart(node,offset);r.setEnd(node,offset+1);const b=r.getBoundingClientRect();if(x>=b.left-2&&x<=b.right+2&&y>=b.top-2&&y<=b.bottom+2)return true;}
      return false;
    }
    let tap=null,lastTap=null,ignoreDoubleUntil=0,multi=null;
    const down=e=>{if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;tap={id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now()};};
    const move=e=>{if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10)tap=null;};
    const up=e=>{if(!tap||tap.id!==e.pointerId)return;const t=tap;tap=null;if(multi||Date.now()-t.time>300||overText(e.clientX,e.clientY))return;if(lastTap&&Date.now()-lastTap.time<350&&Math.hypot(t.x-lastTap.x,t.y-lastTap.y)<25){switchBack();ignoreDoubleUntil=Date.now()+600;lastTap=null;}else lastTap={...t,time:Date.now()};};
    const double=e=>{if(overText(e.clientX,e.clientY))return;if(Date.now()<ignoreDoubleUntil){e.preventDefault();e.stopPropagation();return;}e.preventDefault();e.stopPropagation();switchBack();};
    const multiStart=e=>{if(e.touches.length===2){multi={time:Date.now(),points:[...e.touches].map(t=>({id:t.identifier,x:t.clientX,y:t.clientY}))};tap=null;lastTap=null;}else if(e.touches.length>2)multi=null;};
    const multiMove=e=>{if(multi&&[...e.touches].some(t=>{const p=multi.points.find(p=>p.id===t.identifier);return !p||Math.hypot(t.clientX-p.x,t.clientY-p.y)>12;}))multi=null;};
    const multiEnd=e=>{if(multi&&e.touches.length<2){if(Date.now()-multi.time<300){switchBack();ignoreDoubleUntil=Date.now()+600;}multi=null;tap=null;lastTap=null;}};
    surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',up);surface.addEventListener('dblclick',double);
    surface.addEventListener('touchstart',multiStart,{passive:true});surface.addEventListener('touchmove',multiMove,{passive:true});surface.addEventListener('touchend',multiEnd,{passive:true});
    const keyboard=e=>{if(!surface.getBoundingClientRect().width || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const next={'1':'browse','2':'pen','3':'marker','4':'eraser','e':'eraser'}[e.key.toLowerCase()];if(next)setTool(next);if(e.key.toLowerCase()==='q'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();switchBack();}if(e.key.toLowerCase()==='z'&&!e.altKey){e.preventDefault();back();}};
    window.addEventListener('keydown',keyboard);
    const observer=new ResizeObserver(paint);observer.observe(surface);sync();paint();
    return()=>{finish();observer.disconnect();window.removeEventListener('keydown',keyboard);surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerup',up);surface.removeEventListener('dblclick',double);surface.removeEventListener('touchstart',multiStart);surface.removeEventListener('touchmove',multiMove);surface.removeEventListener('touchend',multiEnd);};
  }};
})();
