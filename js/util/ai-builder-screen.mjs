// A canvas texture on an actual scene plane, shared by desktop and immersive VR.
// No fixed HTML sidebar or DOM overlay is mounted.
export function createBuilderScreen(panelRoot) {
   if (typeof document === 'undefined') return null;
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=768;
   const ctx=canvas.getContext('2d');if(!ctx) return null;
   const face=panelRoot.add('square').move(-.25,2,-.982).scale(1.32,.78,1).color(1,1,1).dull(1);
   face.setTxtr(canvas,true);
   const channel=face._txtr;
   const dirty=()=>{const slot=window._canvas_txtr?.[channel];if(slot)slot.counter=1;};
   const text=(value,x,y,size,color='#ecf4f4',weight=400)=>{
      ctx.font=`${weight} ${size}px system-ui,-apple-system,"PingFang SC",sans-serif`;
      ctx.fillStyle=color;ctx.fillText(value,x,y);
   };
   const wrap=(value,width)=>{
      const lines=[];let line='';
      for(const ch of value){
         if(ch==='\n'){lines.push(line);line='';continue;}
         if(ctx.measureText(line+ch).width>width && line){lines.push(line);line=ch;}else line+=ch;
      }
      lines.push(line);return lines;
   };
   let lastPaint=0,lastContent="";
   return {
      update({draft,status,selected,edit,elapsed,progress,error,view}){
         const content=JSON.stringify([draft,status,selected?.id,edit,error,view]);
         const now=Date.now();
         // Keep keystrokes immediate; construction progress needs no more than ~12 redraws/s.
         if(content===lastContent && now-lastPaint<80) return;
         lastContent=content;lastPaint=now;
         ctx.fillStyle='#111d26';ctx.fillRect(0,0,1280,768);
         ctx.fillStyle='#77dfca';ctx.fillRect(48,44,6,46);
         text('AI BUILDER',76,82,40,'#edf8f5',650);
         const state=status==='AI THINKING'?`WAITING ${elapsed}s`:status==='BUILDING'?`BUILDING ${progress}`:status;
         ctx.textAlign='right';text(state,1224,78,27,status==='ERROR'||status.includes('REJECTED')?'#f4aa9c':'#83e4cd',500);ctx.textAlign='left';
         text(edit&&selected?`EDIT  /  ${selected.kind.toUpperCase()} ${selected.id}`:'NEW SCENE',56,146,26,'#9bb9c6',500);
         ctx.fillStyle='#0a141c';ctx.fillRect(48,174,1184,520);
         ctx.strokeStyle='#365360';ctx.lineWidth=2;ctx.strokeRect(48,174,1184,520);
         ctx.font='38px system-ui,-apple-system,"PingFang SC",sans-serif';
         const lines=wrap(draft,1100),visible=lines.slice(-9);
         visible.forEach((line,i)=>text(line,76,230+i*50,38));
         const last=visible.at(-1)||'';
         ctx.font='38px system-ui,-apple-system,"PingFang SC",sans-serif';
         ctx.fillStyle='#77dfca';ctx.fillRect(77+ctx.measureText(last).width,204+(visible.length-1)*50,3,38);
         text(`${draft.length} / 360`,56,739,23,'#7898a7');
         if(view && !error) text(`WALK  ${view.x.toFixed(1)}, ${view.y.toFixed(1)}, ${view.z.toFixed(1)}`,300,739,23,'#83e4cd');
         if(error){ctx.font='23px system-ui,sans-serif';text(wrap(error,1000)[0]||'',210,739,23,'#f4aa9c');}
         dirty();
      },
      destroy(){
         panelRoot.remove(face);
         if(window._canvas_txtr) delete window._canvas_txtr[channel];
         if(window.txtrChannel) window.txtrChannel=window.txtrChannel.filter(value=>value!==channel);
      }
   };
}
