import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPose,editPose,mergePose,poseAngles,LIMITS,limitInfo} from '../js/util/so101-state.mjs';
import {panelControl} from '../js/util/so101-panel.mjs';
test('two clients converge for concurrent pose edits regardless of delivery and stale snapshots',()=>{
 const base=initialPose(),a=editPose(base,'desktop','joint',0,1,1000),b=editPose(base,'vr','joint',1,.5,1000);
 assert.deepEqual(mergePose(a,b),mergePose(b,a));assert.deepEqual(mergePose(b,base),b);
 const next=editPose(mergePose(a,b),'desktop','joint',2,999,1100);
 assert.equal(next.angles[2],LIMITS[2][1]);assert.equal(next.playing,false);
 assert.deepEqual(mergePose(b,next),next);assert.equal(mergePose(next,{...next,revision:9,angles:[NaN]}),next);
});
test('pause freezes all joints, zero stops, and playback uses shared wall time',()=>{
 const play=editPose(initialPose(),'a','play',null,null,1000);
 assert.deepEqual(poseAngles(play,1250),poseAngles(structuredClone(play),1250));
 const pause=editPose(play,'b','pause',null,null,1250);
 assert.deepEqual(poseAngles(pause,1300),poseAngles(pause,99999));
 assert.deepEqual(editPose(pause,'a','zero',null,null,1400).angles,[0,0,0,0,0,0]);
 for(let i=0;i<6;i++){
  assert.match(limitInfo(LIMITS[i][0],i).text,/LOWER LIMIT/);
  assert.match(limitInfo(LIMITS[i][1]-.01,i).text,/NEAR UPPER/);
  assert.equal(panelControl(70,244+i*98).value,LIMITS[i][0]);
  assert.equal(panelControl(930,244+i*98).value,LIMITS[i][1]);
 }
});
