import {JOINTS} from './so101-kinematics.mjs';
// Full pose registers: deterministic Lamport ordering also resolves simultaneous edits.
export const LIMITS=JOINTS.slice(0,6).map(j=>[j.lo,j.hi]);
export const NAMES=['Base pan','Shoulder lift','Elbow flex','Wrist flex','Wrist roll','Gripper'];
export const clamp=(q,i)=>Math.max(LIMITS[i][0],Math.min(LIMITS[i][1],q));
export const motion=t=>[.3*Math.cos(t*1.2),.3*Math.sin(t*1.3),.3*Math.cos(t*1.4),.3*Math.sin(t*1.5),.3*Math.cos(t*1.6),.2*Math.sin(t*1.7)].map(clamp);
export const initialPose=()=>({revision:0,author:'',playing:true,at:0,angles:[0,0,0,0,0,0],selected:-1});
export const validPose=s=>s && Number.isSafeInteger(s.revision)&&s.revision>=0&&typeof s.author==='string'&&(s.breakId===undefined||typeof s.breakId==='string'&&s.breakId.length<=256)&&typeof s.playing==='boolean'&&Number.isFinite(s.at)&&Array.isArray(s.angles)&&s.angles.length===6&&s.angles.every(Number.isFinite)&&Number.isInteger(s.selected)&&s.selected>=-1&&s.selected<6;
export const comparePose=(a,b)=>a.revision-b.revision || (a.author>b.author?1:a.author<b.author?-1:0);
export const mergePose=(a,b)=>validPose(b)&&comparePose(b,a)>0?{...b,angles:b.angles.map(clamp)}:a;
export function poseAngles(s,now){
 if(!s.playing)return s.angles.map(clamp);
 const target=motion((now-s.at)/1000),blend=Math.max(0,Math.min(1,(now-s.at)/500));
 return target.map((q,i)=>clamp(s.angles[i]*(1-blend)+q*blend,i));
}
export function editPose(state,author,op,index,value,now=Date.now()){
 const angles=poseAngles(state,now);
 if(op==='joint') {if(!Number.isInteger(index)||index<0||index>5||!Number.isFinite(value))return state;angles[index]=clamp(value,index);}
 return {revision:state.revision+1,author,playing:op==='play',at:now,breakId:op==='zero'?`${state.revision+1}:${author}`:(state.breakId||''),angles:op==='zero'?[0,0,0,0,0,0]:angles,selected:op==='joint'?index:-1};
}
export function limitInfo(q,i){
 const [lo,hi]=LIMITS[i],lower=q-lo,upper=hi-q,margin=Math.max(0,Math.min(lower,upper))*180/Math.PI;
 const side=lower<=upper?'LOWER':'UPPER';
 return {margin,text:margin<1e-6?`${side} LIMIT`:margin<=5?`NEAR ${side}`:'OK',color:margin<1e-6?'#ff8d87':margin<=5?'#ffd36b':'#80e4cd'};
}
