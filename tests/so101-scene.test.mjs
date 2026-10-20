import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {LIMITS} from '../js/util/so101-state.mjs';
test('SO101 scene renders finite transforms, mouse dragging pauses at limits, and remote poses update labels',async()=>{
 const saved=new Map(['window','document','clay','server','inputEvents','worldCoords'].map(k=>[k,globalThis[k]]));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'so101-scene-'));
 let scene,tick;const listeners=new Map(),sent=[],messages=[],analysisMessages=[],drawn=[];
 const originalNow=Date.now;let now=1000000;Date.now=()=>now;
 try{
 const cgFile=path.join(dir,'cg.mjs');fs.copyFileSync(new URL('../js/render/core/cg.js',import.meta.url),cgFile);
 const cg=await import(pathToFileURL(cgFile));
 class Node{
 constructor(parent=null){this.parent=parent;this.children=[];this.matrix=cg.mIdentity();}
 add(shape){const n=new Node(this);n.shape=shape;this.children.push(n);return n;}
 remove(n){this.children=this.children.filter(c=>c!==n);}
 getGlobalMatrix(){return this.parent?cg.mMultiply(this.parent.getGlobalMatrix(),this.matrix):this.matrix;}
 getMatrix(){return this.matrix;}setMatrix(m){this.matrix=m.slice();return this;}
 identity(){this.matrix=cg.mIdentity();return this;}
 apply(m){this.matrix=cg.mMultiply(this.matrix,m);return this;}
 move(...v){return this.apply(cg.mTranslate(...v));}scale(...v){return this.apply(cg.mScale(...v));}
 turnX(v){return this.apply(cg.mRotateX(v));}turnY(v){return this.apply(cg.mRotateY(v));}turnZ(v){return this.apply(cg.mRotateZ(v));}aimZ(v){return this.apply(cg.mAimZ(v));}
 color(){return this;}dull(){return this;}opacity(){return this;}setTxtr(){this._txtr=Math.random();window._canvas_txtr[this._txtr]={counter:1};return this;}
 }
 const canvas={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000})};
 globalThis.window={canvas,crypto:{randomUUID:()=> 'desktop'},_canvas_txtr:{},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText:s=>drawn.push(s),beginPath(){},arc(){},fill(){}})})};
 const meshes={};
 globalThis.clay={defineMesh:(name,mesh)=>meshes[name]=mesh,vertexArray:(p,n,t,uv,c)=>[...p,...n,0,0,...c,1,0,0,0,0],formMesh:name=>name?(meshes[name]||true):meshes,inverseRootMatrix:cg.mIdentity(),views:[{projectionMatrix:cg.mIdentity(),viewMatrix:cg.mIdentity()}]};
 globalThis.worldCoords=cg.mIdentity();globalThis.inputEvents={};
 globalThis.server={init:(name,value)=>window[name]??=value,send:(name,m)=>sent.push(m),sync:(name,fn)=>fn(name==='so101AnnotatedPose'?messages.splice(0):analysisMessages.splice(0))};
 let source=fs.readFileSync(new URL('../js/scenes/SO101-annotations.js',import.meta.url),'utf8');
 source=source.replace(/import \* as cg from .*?;/,`import * as cg from ${JSON.stringify(pathToFileURL(cgFile).href)};`);
 source=source.replace(/import \{ stl \} from .*?;/,'const stl=()=>{};');
 source=source.replace(/import \{ ControllerBeam \} from .*?;/,'class ControllerBeam {update(){} beamMatrix(){return worldCoords;}}');
 source=source.replace(/'\.\.\/util\/([^']+)'/g,(_,name)=>JSON.stringify(new URL('../js/util/'+name,import.meta.url).href));
 const file=path.join(dir,'scene.mjs');fs.writeFileSync(file,source);scene=await import(pathToFileURL(file));
 const model=new Node();model.animate=fn=>tick=fn;await scene.init(model);tick();
 for(let i=0;i<65;i++)tick();assert.ok(meshes.so101ReachHeatmapV1.length>0);assert.ok(meshes.so101ReachHeatmapV1.every(Number.isFinite));
 assert.ok(drawn.some(s=>s.includes('J6 Gripper')));
 const check=n=>{assert.ok(n.matrix.every(Number.isFinite));n.children.forEach(check);};check(model);
 // Orthographic test ray through the first slider: world (1.15,1.7732, -.45).
 const event={button:0,clientX:1075,clientY:-386.6,preventDefault(){}};
 listeners.get('mousedown')(event);assert.equal(window.so101AnnotatedPose.playing,false);
 listeners.get('mousemove')({...event,clientX:1500});listeners.get('mouseup')({...event,clientX:1500});
 assert.equal(window.so101AnnotatedPose.angles[0],LIMITS[0][1]);assert.ok(sent.some(m=>m.state?.selected===0));
 const remote={...window.so101AnnotatedPose,revision:100,author:'vr',angles:[0,0,0,0,0,LIMITS[5][1]],selected:5};
 messages.push({op:'pose',state:remote});tick();assert.deepEqual(window.so101AnnotatedPose,remote);assert.ok(drawn.some(s=>s.includes('J6 Gripper  100.0°')));check(model);

 // Let the elected recorder produce a path, then receive a remote clear and settings change.
 now+=1300;tick();now+=50;tick();
 assert.ok(window.so101AnnotatedAnalysis.points.length>=2);
 const point=window.so101AnnotatedAnalysis.points.at(-1);
 const base=model.children[0],wristRoll=base.children[0].children[0].children[0].children[0].children[0];
 const expected=cg.mTransform(cg.mInverse(base.getGlobalMatrix()),wristRoll.children[1].getGlobalMatrix().slice(12,15));
 assert.ok(Math.hypot(...point.p.map((v,i)=>v-expected[i]))<1e-12);
 const markerWorld=model.children[1].children[2].getGlobalMatrix().slice(12,15),toolWorld=wristRoll.children[1].getGlobalMatrix().slice(12,15);
 assert.ok(Math.hypot(...markerWorld.map((v,i)=>v-toolWorld[i]))<1e-12);
 const remoteFeatures={settings:{revision:10,author:'vr',heat:false,trail:false,opacity:.5},clear:{revision:10,author:'vr'},points:[]};
 analysisMessages.push({op:'analysis',author:'vr',state:remoteFeatures});tick();
 assert.equal(window.so101AnnotatedAnalysis.settings.heat,false);assert.equal(window.so101AnnotatedAnalysis.points.length,0);
 assert.equal(meshes.so101ToolTrailV1.length,0);
 // Use actual panel transform to exercise all three buttons and the opacity slider.
 const face=model.children.find(n=>n.shape==='square');
 const at=(x,y)=>{const p=cg.mTransform(face.getGlobalMatrix(),[x/1000*2-1,1-y/1200*2,0]);return {button:0,clientX:(p[0]+1)*500,clientY:(1-p[1])*500,preventDefault(){}};};
 listeners.get('mousedown')(at(155,885));assert.equal(window.so101AnnotatedAnalysis.settings.heat,true);
 listeners.get('mousedown')(at(415,885));assert.equal(window.so101AnnotatedAnalysis.settings.trail,true);
 listeners.get('mousedown')(at(70,960));listeners.get('mouseup')(at(930,960));assert.equal(window.so101AnnotatedAnalysis.settings.opacity,.6);
 listeners.get('mousedown')(at(675,885));assert.equal(window.so101AnnotatedAnalysis.points.length,0);
 scene.deinit();assert.equal(listeners.size,0);
 }finally{Date.now=originalNow;scene?.deinit();fs.rmSync(dir,{recursive:true,force:true});for(const [k,v]of saved)v===undefined?delete globalThis[k]:globalThis[k]=v;}
});
