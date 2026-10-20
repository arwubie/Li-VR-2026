import {LIMITS,NAMES,limitInfo,clamp} from './so101-state.mjs';
export const PANEL_W=1000,PANEL_H=1200;
export function panelControl(x,y){
 if(y>=855&&y<=915)return x>=40&&x<=270?{op:'heat'}:x>=300&&x<=530?{op:'trail'}:x>=560&&x<=790?{op:'clear'}:null;
 if(y>=940&&y<=980&&x>=35&&x<=965)return {op:'opacity',value:.05+.55*Math.max(0,Math.min(1,(x-70)/860))};
 if(y>=82&&y<=140) return x>=40&&x<=270?{op:'toggle'}:x>=300&&x<=530?{op:'zero'}:null;
 for(let i=0;i<6;i++) if(y>=225+i*98&&y<=267+i*98&&x>=35&&x<=965)return {op:'joint',index:i,value:clamp(LIMITS[i][0]+Math.max(0,Math.min(1,(x-70)/860))*(LIMITS[i][1]-LIMITS[i][0]),i)};
 return null;
}
export function createPosePanel(root){
 const canvas=document.createElement('canvas');canvas.width=PANEL_W;canvas.height=PANEL_H;
 const ctx=canvas.getContext('2d');
 const face=root.add('square').move(1.15,1.346,-.45).scale(.60,.72,1).color(1,1,1).dull(1);
 face.setTxtr(canvas,true);
 let last=0;
 const text=(s,x,y,size=23,color='#eaf2fa')=>{ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.fillText(s,x,y);};
 return {face,draw(state,angles,features={}){
 if(Date.now()-last<50)return;last=Date.now();ctx.fillStyle='#101e29';ctx.fillRect(0,0,PANEL_W,PANEL_H);
 text('SO101 / JOINT CONTROL',40,53,32);text(state.playing?'SHARED / PLAYING':'SHARED / PAUSED',600,53,23,'#80e4cd');
 for(const [x,label] of [[40,state.playing?'PAUSE':'PLAY'],[300,'ZERO ALL']]){ctx.fillStyle='#294354';ctx.fillRect(x,82,230,58);text(label,x+30,120,26);}
 text('Drag a slider to pause and adjust · angles relative to zero',40,176,22,'#adc1ce');
 angles.forEach((q,i)=>{
 const y=211+i*98,info=limitInfo(q,i),selected=state.selected===i;
 text(`J${i+1}  ${NAMES[i]}`,40,y,25,selected?'#ffffff':'#c0d4e2');text(`${(q*180/Math.PI).toFixed(1)}°`,365,y,27,info.color);
 text(`${info.text} / ${info.margin.toFixed(1)}° left`,565,y,22,info.color);
 ctx.fillStyle='#3a5264';ctx.fillRect(70,y+29,860,8);
 const x=70+(q-LIMITS[i][0])/(LIMITS[i][1]-LIMITS[i][0])*860;
 ctx.fillStyle=info.color;ctx.fillRect(70,y+29,x-70,8);ctx.beginPath();ctx.arc(x,y+33,12,0,Math.PI*2);ctx.fill();
 text(`${(LIMITS[i][0]*180/Math.PI).toFixed(1)}°`,40,y+69,19,'#9bb0c0');text(`${(LIMITS[i][1]*180/Math.PI).toFixed(1)}°`,855,y+69,19,'#9bb0c0');
 });text('Model joint limits · not collision detection',40,821,21,'#9bb0c0');
 const {settings={heat:true,trail:true,opacity:.25},progress=0,speed=0,tool=[0,0,0]}=features;
 for(const [x,label] of [[40,settings.heat?'HEATMAP ON':'HEATMAP OFF'],[300,settings.trail?'TRAIL ON':'TRAIL OFF'],[560,'CLEAR TRAIL']]){ctx.fillStyle='#294354';ctx.fillRect(x,855,230,60);text(label,x+15,894,24);}
 text(`Heatmap opacity ${(settings.opacity*100).toFixed(0)}%`,40,944,22,'#adc1ce');
 ctx.fillStyle='#3a5264';ctx.fillRect(70,960,860,7);ctx.fillStyle='#80e4cd';ctx.beginPath();ctx.arc(70+(settings.opacity-.05)/.55*860,963,11,0,Math.PI*2);ctx.fill();
 text(progress<1?(settings.heat?`Sampling workspace: ${(progress*100).toFixed(0)}%`:'Heatmap hidden · sampling paused'):'Sampled position workspace · 1 cm cells',40,1010,23);
 text('Green: ≥10% joint-range margin / Orange: near limits',40,1045,21,'#80e4cd');
 text('Blank = unknown · orientation / collisions not checked',40,1075,21,'#adc1ce');
 text(`Tool speed ${speed.toFixed(1)} cm/s · trail 15 s`,40,1116,25);
 for(const [x,color,label] of [[40,'#2673ff','0'],[260,'#ffe626','15'],[480,'#ff4026','30+ cm/s']]){ctx.fillStyle=color;ctx.fillRect(x,1136,45,10);text(label,x+57,1153,21);}
 text(`Tool: gripper_frame · XYZ ${tool.map(v=>(v*100).toFixed(1)).join(' / ')} cm`,40,1190,20,'#adc1ce');
 const slot=window._canvas_txtr?.[face._txtr];if(slot)slot.counter=1;
 },destroy(){root.remove(face);if(window._canvas_txtr)delete window._canvas_txtr[face._txtr];if(window.txtrChannel)window.txtrChannel=window.txtrChannel.filter(v=>v!==face._txtr);}};
}
