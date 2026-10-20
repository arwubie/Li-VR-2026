// Shared settings, clear generations and bounded tool samples. No camera coordinates.
export const TRAIL_MS=15000,TRAIL_MAX=301,SAMPLE_MS=50;
export const initialAnalysis=()=>({settings:{revision:0,author:'',heat:true,trail:true,opacity:.25},clear:{revision:0,author:''},points:[]});
export const compareStamp=(a,b)=>a.revision-b.revision||(a.author>b.author?1:a.author<b.author?-1:0);
const validStamp=s=>s&&Number.isSafeInteger(s.revision)&&s.revision>=0&&typeof s.author==='string'&&s.author.length<=128;
const sameStamp=(a,b)=>compareStamp(a,b)===0;
const validSettings=s=>validStamp(s)&&typeof s.heat==='boolean'&&typeof s.trail==='boolean'&&Number.isFinite(s.opacity)&&s.opacity>=.05&&s.opacity<=.6;
const validPoint=(p,now)=>p&&typeof p.writer==='string'&&p.writer.length<=128&&Number.isSafeInteger(p.seq)&&p.seq>=0&&Number.isFinite(p.t)&&p.t>=now-TRAIL_MS&&p.t<=now+2000&&Array.isArray(p.p)&&p.p.length===3&&p.p.every(v=>Number.isFinite(v)&&Math.abs(v)<2)&&Number.isFinite(p.v)&&p.v>=0&&typeof p.start==='boolean';
export const pointId=p=>`${p.writer}:${p.seq}`;
export function mergeAnalysis(a,b,now=Date.now()){
 const settings=validSettings(b?.settings)&&compareStamp(b.settings,a.settings)>0?{...b.settings}:a.settings;
 const clear=validStamp(b?.clear)&&compareStamp(b.clear,a.clear)>0?{...b.clear}:a.clear;
 const points=new Map();
 for(const source of [a,b])if(source&&validStamp(source.clear)&&sameStamp(source.clear,clear)&&Array.isArray(source.points)){
  for(const p of source.points.slice(-TRAIL_MAX))if(validPoint(p,now))points.set(pointId(p),p);
 }
 return {settings,clear,points:[...points.values()].sort((x,y)=>x.t-y.t||(x.writer<y.writer?-1:x.writer>y.writer?1:0)||x.seq-y.seq).slice(-TRAIL_MAX)};
}
export function editAnalysis(state,author,op,value,now=Date.now()){
 if(op==='clear')return {...state,clear:{revision:state.clear.revision+1,author},points:[]};
 const settings={...state.settings,revision:state.settings.revision+1,author};
 if(op==='heat')settings.heat=!settings.heat;
 else if(op==='trail')settings.trail=!settings.trail;
 else if(op==='opacity'&&Number.isFinite(value))settings.opacity=Math.max(.05,Math.min(.6,value));
 else return state;
 return mergeAnalysis({...state,settings},null,now);
}
export function sampleTool(previous,p,now,writer,seq,forceBreak=false){
 const dt=previous?(now-previous.t)/1000:0;
 const start=forceBreak||!previous||previous.writer!==writer||dt<=0||dt>.25;
 const distance=previous?Math.hypot(...p.map((v,i)=>v-previous.p[i])):0;
 const raw=start?0:distance/dt*100;
 // Reset immediately at rest; smooth nonzero speeds without moving the path itself.
 const v=start||distance<.00001?0:previous.v*.65+raw*.35;
 return {writer,seq,t:now,p:p.slice(),v,start};
}
export function trailSegments(points){
 const segments=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  if(b.start||a.writer!==b.writer||b.seq!==a.seq+1||b.t-a.t>250||b.t<=a.t||Math.hypot(...a.p.map((v,j)=>v-b.p[j]))<.00001)continue;
  segments.push({a:a.p,b:b.p,speed:b.v});
 }
 return segments;
}
export function speedColor(speed){
 const t=Math.max(0,Math.min(1,speed/30));
 return t<.5?[.15+1.7*t,.45+.9*t,1-1.7*t]:[1,.9-1.3*(t-.5),.15];
}
export function recorderId(presence,now){
 return [...presence].filter(([,t])=>now-t<3500).map(([id])=>id).sort()[0]||null;
}
