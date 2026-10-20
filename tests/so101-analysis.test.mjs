import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JOINTS,toolPosition,createReachSampler} from '../js/util/so101-kinematics.mjs';
import {initialAnalysis,editAnalysis,mergeAnalysis,sampleTool,trailSegments,recorderId,speedColor,TRAIL_MAX} from '../js/util/so101-analysis.mjs';
import {heatMesh,trailMesh} from '../js/util/so101-meshes.mjs';
const vertex=(p,n,t,uv,c)=>[...p,...n,0,0,...c,1,0,0,0,0];
test('numerical tool position agrees with the actual scene matrix chain at zero, limits and random poses',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'so101-fk-'));
 try{
  const file=path.join(dir,'cg.mjs');fs.copyFileSync(new URL('../js/render/core/cg.js',import.meta.url),file);
  const cg=await import(pathToFileURL(file));
  let seed=177;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const poses=[[0,0,0,0,0,0],JOINTS.slice(0,6).map(j=>j.lo),JOINTS.slice(0,6).map(j=>j.hi),...Array.from({length:100},()=>JOINTS.slice(0,6).map(j=>j.lo+random()*(j.hi-j.lo)))];
  for(const q of poses){
   let m=cg.mIdentity();
   for(const [i,j]of JOINTS.entries()){
    if(i===5)continue; // moving jaw is a sibling of the fixed tool frame
    let [x,y,z]=j.rpy;if([0,2,3].includes(i))z+=q[i];if([1,4].includes(i))y+=q[i];
    for(const transform of [cg.mTranslate(j.xyz),cg.mRotateZ(z),cg.mRotateY(y),cg.mRotateX(x)])m=cg.mMultiply(m,transform);
   }
   const expected=m.slice(12,15),actual=toolPosition(q);
   assert.ok(Math.hypot(...actual.map((v,i)=>v-expected[i]))<1e-12);
   assert.deepEqual(toolPosition([...q.slice(0,5),JOINTS[5].hi]),toolPosition([...q.slice(0,5),JOINTS[5].lo]));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('reach sampling is reproducible across frame chunk sizes, bounded and classified by actual joint margin',()=>{
 const a=createReachSampler(),b=createReachSampler();let ra,rb;
 do{ra=a.step(437);}while(!ra.points);do{rb=b.step(2000);}while(!rb.points);
 assert.deepEqual(ra,rb);assert.equal(ra.progress,1);assert.ok(ra.cells>1800);assert.equal(ra.points.length,1800);
 assert.ok(ra.points.every(p=>p.margin>=0&&p.margin<=1&&p.p.every(Number.isFinite)));
 assert.ok(ra.points.some(p=>p.margin>=.2));assert.ok(ra.points.some(p=>p.margin<.2));
 const mesh=heatMesh(ra.points,vertex);assert.equal(mesh.length,1800*8*3*16);assert.ok(mesh.every(Number.isFinite));
});
test('tool speed is measured in cm/s, rest reads zero, and discontinuities never create connecting geometry',()=>{
 let a=sampleTool(null,[0,0,0],1000,'desktop',0);
 let b=sampleTool(a,[.01,0,0],1050,'desktop',1);assert.ok(b.v>0&&b.v<=20);
 let c=sampleTool(b,[.01,0,0],1100,'desktop',2);assert.equal(c.v,0);
 assert.equal(trailSegments([a,b,c]).length,1);
 let reset=sampleTool(c,[1,0,0],1150,'desktop',3,true);assert.equal(reset.start,true);assert.equal(reset.v,0);
 assert.equal(trailSegments([a,b,c,reset]).length,1);
 const delayed=sampleTool(b,[.2,.2,0],2000,'desktop',2);assert.equal(delayed.start,true);
 assert.equal(trailSegments([b,delayed]).length,0);
 const takeover=sampleTool(b,[.2,0,0],1100,'vr',0);assert.equal(takeover.start,true);
 assert.equal(trailSegments([b,takeover]).length,0);
 const mesh=trailMesh([a,b,c,reset],vertex);assert.equal(mesh.length,8*3*16);assert.ok(mesh.every(Number.isFinite));
 assert.deepEqual(speedColor(300),speedColor(30));assert.deepEqual(speedColor(-10),speedColor(0));
});
test('concurrent controls, clear and late snapshots converge without resurrecting earlier paths',()=>{
 const now=20000,base=initialAnalysis();
 const a=editAnalysis(base,'desktop','heat',null,now),b=editAnalysis(base,'vr','opacity',.5,now);
 assert.deepEqual(mergeAnalysis(a,b,now),mergeAnalysis(b,a,now));
 const points=Array.from({length:400},(_,i)=>sampleTool(null,[i/1000,0,0],now-10000+i*20,'desktop',i));
 const full=mergeAnalysis(base,{...base,points},now);assert.equal(full.points.length,TRAIL_MAX);
 const cleared=editAnalysis(full,'vr','clear',null,now);
 assert.deepEqual(mergeAnalysis(cleared,full,now).points,[]);
 assert.deepEqual(mergeAnalysis(full,cleared,now),cleared);
 const latest=sampleTool(null,[.1,0,0],now+50,'desktop',400);
 const resumed=mergeAnalysis(cleared,{...cleared,points:[latest]},now+50);
 assert.equal(resumed.points.length,1);assert.deepEqual(mergeAnalysis(resumed,cleared,now+50),resumed);
 assert.equal(mergeAnalysis(resumed,null,now+16000).points.length,0);
 const dirty={...cleared,points:[{...latest,p:[NaN,0,0]}]};assert.equal(mergeAnalysis(cleared,dirty,now+50).points.length,0);
 const late=mergeAnalysis(initialAnalysis(),resumed,now+50);assert.deepEqual(late,resumed);
});
test('recorder election excludes stale and disconnected participants',()=>{
 const presence=new Map([['a',1000],['b',2000]]);
 assert.equal(recorderId(presence,2000),'a');assert.equal(recorderId(presence,4600),'b');assert.equal(recorderId(presence,6000),null);
});
