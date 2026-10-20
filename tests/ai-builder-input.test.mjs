import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {expandCity,EXAMPLES} from '../js/util/ai-city.mjs';

test('reset cancels the old request, clears the input and ignores late results while a new request runs', async()=>{
   const listeners=new Map(),texts=new Map(),sent=[],messages=[],requests=[];
   const previous=new Map(['window','clay','server','inputEvents','fetch'].map(k=>[k,globalThis[k]]));
   const originalNow=Date.now;
   let now=1000000,id=0,tick,syncedSnapshot=null,deliverMessages=true;
   Date.now=()=>now;
   class Node {
      children=[];
      getGlobalMatrix(){return this;}
      add(shape){const n=new Node();n.shape=shape;this.children.push(n);return n;}
      remove(n){this.children=this.children.filter(v=>v!==n);}
      foreground(value){this.isForeground=value;return this;}
      move(){return this;} scale(){return this;} color(){return this;}
      dull(){return this;} opacity(){return this;} identity(){return this;} turnY(){return this;}
   }
   globalThis.window={currentName:'ai-builder',crypto:{randomUUID:()=>`request-${++id}`},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
   globalThis.clay={defineTextMesh:(k,v)=>texts.set(k,v)};
   globalThis.inputEvents={};
   globalThis.server={init(){},send:(name,m)=>{sent.push(m);messages.push(m);},sync:(name,fn)=>{if(syncedSnapshot){window[name]=syncedSnapshot;syncedSnapshot=null;}const batch=messages.splice(0);if(deliverMessages)fn(batch);}};
   // Intentionally ignore abort in this fake transport to exercise a late response race.
   globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({body:JSON.parse(options.body),signal:options.signal,resolve}));
   let source=fs.readFileSync(new URL('../js/scenes/ai-builder.js',import.meta.url),'utf8');
   source=source.replace(/import \* as cg from .*?;/,'const cg={add:(a,b)=>a.map((v,i)=>v+b[i]),mix:(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t)};');
   source=source.replace(/import \{ ControllerBeam, joyStickState \} from .*?;/,'const joyStickState={left:{x:0,y:0},right:{x:0,y:0}}; class ControllerBeam { hitPoint(matrix){return matrix===window.hitTarget?[0,0,0]:null;} update(){} }');
   source=source.replace(/"(\.\.\/util\/[^"\n]+)"/g,(_,relative)=>JSON.stringify(new URL(relative,new URL('../js/scenes/ai-builder.js',import.meta.url)).href));
   let scene;
   const harnessDir=fs.mkdtempSync(path.join(os.tmpdir(),'city-input-test-'));
   const key=key=>listeners.get('keydown')({key,preventDefault(){}});
   const type=text=>[...text].forEach(key);
   const settle=()=>new Promise(resolve=>setImmediate(resolve));
   const reply=(request,kind)=>{
      const {actions,objects}=expandCity({message:kind,objects:[EXAMPLES.find(b=>b.kind===kind)]});
      request.resolve({ok:true,json:async()=>({requestId:request.body.requestId,worldVersion:request.body.worldVersion,objectCount:1,message:kind,actions,objects})});
   };
   try {
      const harnessFile=path.join(harnessDir,'scene.mjs');
      fs.writeFileSync(harnessFile,source);
      scene=await import(pathToFileURL(harnessFile).href);
      const model=new Node();model.animate=fn=>tick=fn;model.time=0;
      await scene.init(model);
      assert.equal(texts.get('aiBuilderInput'),'> _');
      const pressSpatial=value=>{
         const mesh=[...texts].find(([name,text])=>name.startsWith('aiBuilderKey')&&text===value)[0];
         const find=node=>node.children.some(child=>child.shape===mesh)?node:node.children.map(find).find(Boolean);
         window.hitTarget=find(model).children.find(n=>n.shape==='square');inputEvents.onPress('left');
      };
      pressSpatial('WALK');assert.equal(window.getBuilderView().walking,true);
      const foregroundRoots=model.children[0].children.filter(node=>node.isForeground);
      assert.equal(foregroundRoots.length,2); // panel and controller beams
      assert.ok(foregroundRoots.some(node=>node.children.some(child=>child.shape==='cube,rounded')));
      pressSpatial('FWD');assert.equal(window.getBuilderView().z,35);
      pressSpatial('RIGHT');assert.equal(window.getBuilderView().x,9);
      pressSpatial('TURN R');assert.equal(window.getBuilderView().yaw,-Math.PI/6);
      window.setBuilderView(8,1.6,36);tick();key('ArrowUp');now+=100;tick();
      assert.equal(window.getBuilderView().z,35.75);
      listeners.get('keyup')({key:'ArrowUp'});now+=100;tick();
      assert.equal(window.getBuilderView().z,35.75);
      pressSpatial('HOME');assert.equal(window.getBuilderView().walking,false);
      assert.ok(foregroundRoots.every(node=>node.isForeground===false));
      assert.equal(texts.get('aiBuilderInput'),'> _');
      assert.ok([...texts.values()].includes('5 FLOORS'));
      assert.ok([...texts.values()].includes('TREE X2'));
      type('one tree');key('Enter');
      assert.equal(requests[0].body.instruction,'ONE TREE');assert.equal(requests[0].body.preset,false);
      window.clearBuilderWorld();
      assert.equal(requests[0].signal.aborted,true);
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,0);
      assert.equal(texts.get('aiBuilderInput'),'> _');
      type('one bench');key('Enter');assert.equal(requests.length,2);
      reply(requests[0],'tree');await settle();
      assert.equal(sent.filter(m=>m.op==='applyPlan').length,0);
      type('keep this draft');key('Enter');
      assert.equal(requests.length,2);assert.match(texts.get('aiBuilderInput'),/KEEP THIS DRAFT/);
      reply(requests[1],'bench');await settle();
      assert.equal(sent.filter(m=>m.op==='applyPlan').length,1);
      now+=10000;tick();
      assert.equal(window.aiBuilderCityWorld.lastMessage,'bench');
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,4);
      assert.equal(texts.get('aiBuilderDetail'),' ');
      assert.equal(texts.has('aiBuilderLog0'),false);
      assert.ok([...texts.values()].includes('SEND'));
      window.isXR=()=>true;tick();
      assert.ok([...texts.values()].includes('SEND'));
      window.isXR=()=>false;tick();
      assert.ok([...texts.values()].includes('SEND'));
      window.clearBuilderWorld();tick();
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,0);
      const demoMesh=[...texts].find(([name,value])=>value==='DEMO')[0];
      const findKey=node=>node.children.some(child=>child.shape===demoMesh)?node:node.children.map(findKey).find(Boolean);
      window.hitTarget=findKey(model).children.find(n=>n.shape==='square');
      type('my own draft');inputEvents.onPress('left');
      assert.equal(requests[2].body.preset,true);
      assert.match(requests[2].body.instruction,/Minecraft/);
      window.clearBuilderWorld();
      const resolvePlan=(request,expanded,targetId=null)=>request.resolve({ok:true,json:async()=>({...expanded,requestId:request.body.requestId,worldVersion:request.body.worldVersion,targetId})});
      const build=window.askBuilder('two trees');
      const trees=expandCity({objects:[{...EXAMPLES[2],position:[-8,0]},{...EXAMPLES[2],position:[8,0]}]});
      resolvePlan(requests[3],trees);await build;now+=10000;tick();
      const untouched=window.aiBuilderCityWorld.blocks['o1:p0'];
      const unchangedTree=window.aiBuilderCityWorld.objects[1];
      window.selectBuilderObject('o0');
      const edit=window.askBuilder('make this tree taller');
      assert.equal(requests[4].body.target.id,'o0');
      const changed=expandCity({objects:[{...requests[4].body.target,height:9}]},{ids:['o0']});
      resolvePlan(requests[4],changed,'o0');await edit;now+=10000;tick();
      assert.equal(window.aiBuilderCityWorld.objects[0].height,9);
      assert.equal(window.aiBuilderCityWorld.blocks['o1:p0'],untouched);
      assert.equal(window.aiBuilderCityWorld.objects[1],unchangedTree);
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,6);
      assert.equal(scene.reloadOnFocus,false);
      // A delayed storage snapshot must not erase the current world while thinking.
      const version=window.aiBuilderCityWorld.version;
      const suspended=window.askBuilder('one bench');
      assert.match(texts.get('aiBuilderInput'),/ONE BENCH/);
      syncedSnapshot={version:version-1,blocks:{},objects:[],lastMessage:''};tick();
      assert.equal(window.aiBuilderCityWorld.version,version);
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,6);
      // A freshly imported scene cancels the old module, not just its own cleanup variable.
      const oldTick=tick;
      scene=await import(pathToFileURL(harnessFile).href+'?reload');
      const newModel=new Node();newModel.time=0;newModel.animate=fn=>tick=fn;
      await scene.init(newModel);
      assert.equal(requests[5].signal.aborted,true);
      reply(requests[5],'bench');assert.equal(await suspended,null);oldTick();
      const failed=window.askBuilder('fail this request');
      requests[6].resolve({ok:false,json:async()=>({error:'simulated provider failure'})});
      const savedError=console.error;console.error=()=>{};
      try{assert.equal(await failed,null);}finally{console.error=savedError;}
      const failedWorld=window.aiBuilderCityWorld.blocks;
      const late=expandCity({objects:[EXAMPLES[4]]});
      messages.push({op:'applyPlan',requestId:requests[6].body.requestId,baseVersion:version,...late});
      now+=1000;tick();assert.equal(window.aiBuilderCityWorld.blocks,failedWorld);
      assert.equal(texts.get('aiBuilderStatus'),'STATUS: ERROR');
      // A successful result starts locally even when synchronization never echoes it.
      deliverMessages=false;
      const noEcho=window.askBuilder('one bench');resolvePlan(requests[7],late);await noEcho;
      now+=1000;tick();assert.equal(window.aiBuilderCityWorld.lastMessage,late.message);
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,4);
      deliverMessages=true;
      const duplicate=window.askBuilder('two trees');resolvePlan(requests[8],trees);await duplicate;
      const broadcast=sent.find(m=>m.requestId===requests[8].body.requestId);
      messages.push(broadcast,broadcast);
      now+=1;tick();assert.equal(texts.get('aiBuilderStatus'),'STATUS: BUILDING');
      const partialCount=Object.keys(window.aiBuilderCityWorld.blocks).length;
      syncedSnapshot={version:window.aiBuilderCityWorld.version-1,blocks:{},objects:[]};
      now+=1;tick();assert.ok(Object.keys(window.aiBuilderCityWorld.blocks).length>=partialCount);
      now+=3000;tick();assert.equal(texts.get('aiBuilderStatus'),'STATUS: DONE');
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,6);
      // A socket assignment outside sync must not bypass the rollback guard.
      const stable=window.aiBuilderCityWorld;
      window.aiBuilderCityWorld={version:0,blocks:{},objects:[]};tick();
      assert.equal(window.aiBuilderCityWorld,stable);
      // A late participant advertises its older revision and receives a complete snapshot.
      messages.push({op:'hello',version:0,commitId:''});tick();
      const snapshot=sent.filter(m=>m.op==='snapshot').at(-1);
      assert.equal(Object.keys(snapshot.world.blocks).length,6);
      const remote={version:stable.version+1,commitId:'p:remote',blocks:{},objects:[],lastMessage:'remote clear'};
      messages.push({op:'snapshot',world:remote});tick();
      assert.equal(window.aiBuilderCityWorld.version,remote.version);
      assert.equal(Object.keys(window.aiBuilderCityWorld.blocks).length,0);

   } finally {
      scene?.deinit();Date.now=originalNow;
      fs.rmSync(harnessDir,{recursive:true,force:true});
      for(const [k,v] of previous) v===undefined?delete globalThis[k]:globalThis[k]=v;
   }
});
