import test from 'node:test';
import assert from 'node:assert/strict';
import {homeView,setView,moveView} from '../js/util/ai-builder-view.mjs';
test('walk starts on a road; forward and strafe follow rotated view without diagonal acceleration',()=>{
   const home=homeView();assert.equal(moveView(home,0,1,.1),home);
   const walk=setView(home,8,1.6,36,0);
   assert.equal(moveView(walk,0,1,.1).z,35.75);
   assert.equal(moveView(walk,1,0,.1).x,8.25);
   const rotated=moveView({...walk,yaw:Math.PI/2},0,1,.1);
   assert.equal(rotated.x,7.75);assert.equal(rotated.z,36);
   const diagonal=moveView(walk,1,1,.1);
   assert.ok(Math.abs(Math.hypot(diagonal.x-8,diagonal.z-36)-.25)<1e-8);
});
test('coordinates and long frames are bounded; invalid coordinates cannot poison render matrices',()=>{
   const v=setView(homeView(),100,100,-100);assert.deepEqual([v.x,v.y,v.z],[40,35,-40]);
   assert.throws(()=>setView(v,NaN,2,3),/finite/);
   assert.equal(moveView(setView(v,0,1.6,0),0,1,30).z,-.25);
   assert.equal(moveView(setView(v,0,1.6,0),0,1,-1).z,0);
});
