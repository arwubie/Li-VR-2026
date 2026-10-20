import test from 'node:test';
import assert from 'node:assert/strict';
import {drawForeground} from '../js/render/core/foreground.mjs';

function context() {
   const gl={DEPTH_WRITEMASK:1,DEPTH_CLEAR_VALUE:2,DEPTH_FUNC:3,DEPTH_TEST:4,SCISSOR_TEST:5,DEPTH_BUFFER_BIT:6,LEQUAL:7};
   const state=new Map([[1,false],[2,.8],[3,8]]),enabled=new Set([5]),events=[];
   gl.getParameter=key=>state.get(key);gl.isEnabled=key=>enabled.has(key);
   gl.enable=key=>enabled.add(key);gl.disable=key=>enabled.delete(key);
   gl.depthMask=value=>state.set(1,value);gl.clearDepth=value=>state.set(2,value);gl.depthFunc=value=>state.set(3,value);
   // Both eyes initially contain a nearby wall at depth .1.
   const depth=[.1,.1],color=['wall','wall'];
   gl.clear=bits=>{
      assert.equal(bits,gl.DEPTH_BUFFER_BIT);assert.equal(enabled.has(5),false);
      assert.equal(state.get(1),true);depth.fill(state.get(2));events.push('clear');
   };
   gl.pixel=(eye,z,name)=>{
      assert.equal(enabled.has(4),true);assert.equal(enabled.has(5),false);
      if(z<=depth[eye]){color[eye]=name;if(state.get(1))depth[eye]=z;}
   };
   return {gl,state,enabled,events,depth,color};
}

test('spatial foreground replaces wall depth for both eyes while retaining key/text depth',()=>{
   const c=context();
   drawForeground(c.gl,()=>{
      assert.deepEqual(c.events,['clear']);
      for(let eye=0;eye<2;eye++) {
         c.gl.pixel(eye,.7,'key');c.gl.pixel(eye,.6,'label');c.gl.pixel(eye,.8,'keyboard backing');
      }
   });
   assert.deepEqual(c.color,['label','label']);
   assert.deepEqual([...c.state],[[1,false],[2,.8],[3,8]]);
   assert.deepEqual([...c.enabled],[5]);
});

test('foreground restores GL state even when drawing fails',()=>{
   const c=context();
   assert.throws(()=>drawForeground(c.gl,()=>{throw new Error('draw failed');}),/draw failed/);
   assert.deepEqual([...c.state],[[1,false],[2,.8],[3,8]]);
   assert.deepEqual([...c.enabled],[5]);
});
