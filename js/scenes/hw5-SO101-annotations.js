import * as cg from '../render/core/cg.js';
import { stl } from '../render/core/stl.js';

// DIGITAL DOUBLE OF AN SO101 EDUCATIONAL ROBOT ARM

import {JOINTS,toolPosition,createReachSampler} from '../util/so101-kinematics.mjs';
import { ControllerBeam } from '../render/core/controllerInput.js';
import {initialPose,mergePose,poseAngles,editPose,NAMES,limitInfo} from '../util/so101-state.mjs';
import {createPosePanel,panelControl,PANEL_W,PANEL_H} from '../util/so101-panel.mjs';
import {initialAnalysis,mergeAnalysis,editAnalysis,sampleTool,recorderId,SAMPLE_MS,pointId,compareStamp} from '../util/so101-analysis.mjs';
import {heatMesh,trailMesh} from '../util/so101-meshes.mjs';
let cachedReach=null;
const ANALYSIS='so101AnnotatedAnalysis';
export const reloadOnFocus=false;
let cleanup;
const SHARED='so101AnnotatedPose';

export const init = async model => {
   cleanup?.();
   let disposed=false;
   const header=document.getElementById?.('header-details'),headerWasOpen=header?.open;
   if(header)header.open=false;
   const printed = [1,.82,.12], motor = [.1,.1,.1];     // COLOR PALETTE FOR THE ROBOT PARTS

   // THE MESH OF EACH LINK IS THE NAME OF A FILE IN media/stl/SO101. EACH LINK'S xyz AND rpy ARE RELATIVE TO THAT LINK'S FRAME.

   const links = {
      base_link: [
         { stl: 'base_motor_holder_so101_v1'       , xyz: [-0.00636471, -0.0000994414, -0.0024], rpy: [1.5708, 0, 1.5708], color: printed },
         { stl: 'base_so101_v2'                    , xyz: [-0.00636471, 0, -0.0024], rpy: [1.5708, 0, 1.5708], color: printed },
         { stl: 'sts3215_03a_v1'                   , xyz: [0.0263353, 0, 0.0437], rpy: [0, 0, 0], color: motor },
         { stl: 'waveshare_mounting_plate_so101_v2', xyz: [-0.0309827, -0.000199441, 0.0474], rpy: [1.5708, 0, 1.5708], color: printed },
      ],
      shoulder_link: [
         { stl: 'sts3215_03a_v1'            , xyz: [-0.0303992, 0.000422241, -0.0417], rpy: [1.5708, 1.5708, 0], color: motor },
         { stl: 'motor_holder_so101_base_v1', xyz: [-0.0675992, -0.000177759, 0.0158499], rpy: [1.5708, -1.5708, 0], color: printed },
         { stl: 'rotation_pitch_so101_v1'   , xyz: [0.0122008, 0.0000222413, 0.0464], rpy: [-1.5708, 0, 0], color: printed },
      ],
      upper_arm_link: [
         { stl: 'sts3215_03a_v1'    , xyz: [-0.11257, -0.0155, 0.0187], rpy: [-3.14159, 0, -1.5708], color: motor },
         { stl: 'upper_arm_s0101_v1', xyz: [-0.065085, 0.012, 0.0182], rpy: [3.14159, 0, 0], color: printed },
      ],
      lower_arm_link: [
         { stl: 'under_arm_so101_v1'         , xyz: [-0.0648499, -0.032, 0.0182], rpy: [3.14159, 0, 0], color: printed },
         { stl: 'motor_holder_so101_wrist_v1', xyz: [-0.0648499, -0.032, 0.018], rpy: [-3.14159, 0, 0], color: printed },
         { stl: 'sts3215_03a_v1'             , xyz: [-0.1224, 0.0052, 0.0187], rpy: [-3.14159, 0, -3.14159], color: motor },
      ],
      wrist_link: [
         { stl: 'sts3215_03a_no_horn_v1'   , xyz: [0, -0.0424, 0.0306], rpy: [1.5708, 1.5708, 0], color: motor },
         { stl: 'wrist_roll_pitch_so101_v2', xyz: [0, -0.028, 0.0181], rpy: [-1.5708, -1.5708, 0], color: printed },
      ],
      gripper_link: [
         { stl: 'sts3215_03a_v1'              , xyz: [0.0077, 0.0001, -0.0234], rpy: [-1.5708, 0, 0], color: motor },
         { stl: 'wrist_roll_follower_so101_v1', xyz: [0, -0.000218214, 0.000949706], rpy: [-3.14159, 0, 0], color: printed },
      ],
      gripper_frame_link: [],
      moving_jaw_so101_v1_link: [
         { stl: 'moving_jaw_so101_v1', xyz: [0, 0, 0.0189], rpy: [0, 0, 0], color: printed },
      ],
   };

   const joints = JOINTS;

   for (const meshList of Object.values(links))         // START LOADING THE ROBOT PARTS
      for (let mesh of meshList)
            stl('SO101/' + mesh.stl);

   let robotBaseFrame = model.add().move(-.1,1.5,0).turnX(-Math.PI/2);

   let node = {};                                        // CREATE THE KINEMATIC JOINT HIERARCHY
   node['robotBaseFrame'] = robotBaseFrame;
   for (let j of joints)
      node[j.name] = node[j.parent].add();

   server.init(SHARED,initialPose());
   let lastPublish=0;
   let state=mergePose(initialPose(),window[SHARED]);
   const author=window.crypto.randomUUID();
   server.init(ANALYSIS,initialAnalysis());
   let analysis=mergeAnalysis(initialAnalysis(),window[ANALYSIS]);
   const presence=new Map(),joinedAt=Date.now();
   let lastAnalysisPublish=0,lastSampleAt=0,previousSample=null,sequence=0,lastRecorder=null,lastBreak='',lastClear=analysis.clear,trailSignature='',reachProgress=cachedReach?1:0;
   const sampler=cachedReach?null:createReachSampler();
   const heatName='so101ReachHeatmapV1',trailName='so101ToolTrailV1';
   clay.defineMesh(heatName,new Float32Array());clay.defineMesh(trailName,new Float32Array());
   // Draw visualizations after all robot links, so translucent points cannot hide later links via depth writes.
   const visualRoot=model.add();
   const heat=visualRoot.add(heatName).color(1,1,1).dull(1);
   const trail=visualRoot.add(trailName).color(1,1,1).dull(1);
   const toolMarker=visualRoot.add('sphere').color(.3,.8,1).dull(1);
   if(cachedReach)clay.defineMesh(heatName,heatMesh(cachedReach,clay.vertexArray));
   const publishAnalysis=(includeHistory=true)=>{window[ANALYSIS]=analysis;server.send(ANALYSIS,{op:'analysis',author,state:includeHistory?analysis:{...analysis,points:[]}});};
   const featureEdit=(op,value)=>{
      analysis=editAnalysis(analysis,author,op,value);publishAnalysis(false);
      if(op==='clear')previousSample=null;
   };
   const panel=createPosePanel(model);
   const beams={left:new ControllerBeam(model,'left'),right:new ControllerBeam(model,'right')};
   const labels=joints.slice(0,6).map(()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=108;
      const face=model.add('square').color(1,1,1).dull(1);face.setTxtr(canvas,true);
      return {canvas,ctx:canvas.getContext('2d'),face,marker:model.add('sphere').dull(1),line:model.add('tubeZ').color(.5,.8,.9),last:''};
   });
   const send=(op,index,value)=>{
      state=editPose(state,author,op,index,value);window[SHARED]=state;
      server.send(SHARED,{op:'pose',state});
   };
   // Intersect rays in the panel's own frame; works for desktop and VR.
   const panelPoint=ray=>{
      if(!ray)return null;const inv=cg.mInverse(panel.face.getGlobalMatrix());
      const a=cg.mTransform(inv,ray.origin),b=cg.mTransform(inv,cg.add(ray.origin,ray.direction));
      const d=cg.subtract(b,a);if(Math.abs(d[2])<1e-8)return null;
      const t=-a[2]/d[2];if(t<0)return null;
      const p=cg.add(a,cg.scale(d,t));return {x:(p[0]+1)*PANEL_W/2,y:(1-p[1])*PANEL_H/2};
   };
   const mouseRay=e=>{
      if(!clay.views?.[0])return null;const rect=window.canvas.getBoundingClientRect();
      const x=2*(e.clientX-rect.left)/rect.width-1,y=1-2*(e.clientY-rect.top)/rect.height;
      const v=clay.views[0],inv=cg.mInverse(cg.mMultiply(v.projectionMatrix,v.viewMatrix));
      const at=z=>{const p=cg.mTransform(inv,[x,y,z,1]);return cg.mTransform(clay.inverseRootMatrix,p.slice(0,3).map(n=>n/p[3]));};
      const a=at(-1),b=at(1);return {origin:a,direction:cg.subtract(b,a)};
   };
   const handRay=hand=>{const m=cg.mMultiply(cg.mInverse(worldCoords),beams[hand].beamMatrix());return {origin:m.slice(12,15),direction:m.slice(8,11).map(v=>-v)};};
   let drag=null,lastSend=0;
   const adjust=(point,force=false)=>{
      if(!drag||!point)return;
      if(!force&&Date.now()-lastSend<40)return;lastSend=Date.now();
      const y=drag.op==='opacity'?960:244+drag.index*98;
      const hit=panelControl(point.x,y);
      // Clamp even when the pointer leaves the panel horizontally.
      const bounded=panelControl(Math.max(35,Math.min(965,point.x)),y);
      if(hit||bounded){if(drag.op==='opacity')featureEdit('opacity',(hit||bounded).value);else send('joint',drag.index,(hit||bounded).value);}
   };
   const press=(source,point)=>{
      if(drag||!point)return;const hit=panelControl(point.x,point.y);if(!hit)return;
      if(hit.op==='joint'||hit.op==='opacity'){drag={source,op:hit.op,index:hit.index};adjust(point,true);}
      else if(['heat','trail','clear'].includes(hit.op))featureEdit(hit.op);
      else send(hit.op==='toggle'?(state.playing?'pause':'play'):'zero');
   };
   const release=(source,point)=>{if(drag?.source===source){adjust(point,true);drag=null;}};
   const down=e=>{if(e.button===0){press('mouse',panelPoint(mouseRay(e)));if(drag)e.preventDefault();}};
   const move=e=>{if(drag?.source==='mouse')adjust(panelPoint(mouseRay(e)));};
   const up=e=>release('mouse',panelPoint(mouseRay(e)));
   const blur=()=>{drag=null;};
   const callbacks={onPress:h=>press(h,panelPoint(handRay(h))),onDrag:h=>{if(drag?.source===h)adjust(panelPoint(handRay(h)));},onRelease:h=>release(h,panelPoint(handRay(h))),onClick:()=>{}};
   const previous={};for(const k in callbacks){previous[k]=inputEvents[k];inputEvents[k]=callbacks[k];}
   const oldMode=window.interactMode;window.interactMode=1;
   window.canvas.addEventListener('mousedown',down);window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);window.addEventListener('blur',blur);
   cleanup=()=>{
      if(disposed)return;disposed=true;drag=null;panel.destroy();
      if(header)header.open=headerWasOpen;
      delete clay.formMesh()[heatName];delete clay.formMesh()[trailName];
      for(const label of labels){if(window._canvas_txtr)delete window._canvas_txtr[label.face._txtr];if(window.txtrChannel)window.txtrChannel=window.txtrChannel.filter(v=>v!==label.face._txtr);}
      window.canvas.removeEventListener('mousedown',down);window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);window.removeEventListener('blur',blur);
      for(const k in callbacks)if(inputEvents[k]===callbacks[k])inputEvents[k]=previous[k];window.interactMode=oldMode;
   };

   model.animate(() => {
      if(disposed)return;
      for(let mesh of links['base_link']) {             // CREATE THE ROBOT BASE
         let partName = 'SO101/' + mesh.stl;
         if (clay.formMesh(partName) && ! mesh.part)
            mesh.part = node['robotBaseFrame'].add(partName).move(mesh.xyz)
                                                            .turnZ(mesh.rpy[2])
                                                            .turnY(mesh.rpy[1])
                                                            .turnX(mesh.rpy[0])
                                                            .color(mesh.color);
      }

      for(let j of joints)                              // CREATE THE ALL THE OTHER ROBOT PARTS
      for(let mesh of links[j.link]) {
         let partName = 'SO101/' + mesh.stl;
         if (clay.formMesh(partName) && ! mesh.part)
            mesh.part = node[j.name].add(partName).move(mesh.xyz)
                                                  .turnZ(mesh.rpy[2])
                                                  .turnY(mesh.rpy[1])
                                                  .turnX(mesh.rpy[0])
                                                  .color(mesh.color);
      }

//    let m = [0,0,0,0,0,0];
      // Merge both snapshots and construct-style messages; stale snapshots cannot rewind edits.
      state=mergePose(state,window[SHARED]);
      // Retry the latest register, including when another client was not in this scene yet.
      if(Date.now()-lastPublish>1000){lastPublish=Date.now();server.send(SHARED,{op:'pose',state});}
      server.sync(SHARED,messages=>{
         state=mergePose(state,window[SHARED]);
         for(const key in messages)if(messages[key]?.op==='pose')state=mergePose(state,messages[key].state);
         window[SHARED]=state;
      });
      state=mergePose(state,window[SHARED]);window[SHARED]=state;
      const now=Date.now();
      let m=poseAngles(state,now);
      analysis=mergeAnalysis(analysis,window[ANALYSIS],now);
      presence.set(author,now);
      if(now-lastAnalysisPublish>=1000){lastAnalysisPublish=now;publishAnalysis();}
      server.sync(ANALYSIS,messages=>{
         analysis=mergeAnalysis(analysis,window[ANALYSIS],now);
         for(const key in messages){
            const message=messages[key];
            if(!message||typeof message.author!=='string'||message.author.length>128)continue;
            if(message.op==='analysis'){
               presence.set(message.author,now);
               analysis=mergeAnalysis(analysis,message.state,now);
            }
            if(message.op==='sample'&&message.point?.writer===message.author)
               analysis=mergeAnalysis(analysis,{settings:analysis.settings,clear:message.clear,points:[message.point]},now);
         }
         window[ANALYSIS]=analysis;
      });
      analysis=mergeAnalysis(analysis,window[ANALYSIS],now);
      // Participants in this scene elect one recorder; global master may be in another scene.
      for(const [id,seen] of presence)if(now-seen>=3500)presence.delete(id);
      const recorder=recorderId(presence,now),tool=toolPosition(m);
      if(recorder!==lastRecorder||state.breakId!==lastBreak||compareStamp(lastClear,analysis.clear)!==0){previousSample=null;lastRecorder=recorder;lastBreak=state.breakId;lastClear=analysis.clear;}
      if(recorder===author&&now-joinedAt>=1200&&now-lastSampleAt>=SAMPLE_MS){
         lastSampleAt=now;
         const point=sampleTool(previousSample,tool,now,author,sequence++);
         previousSample=point;
         analysis=mergeAnalysis(analysis,{settings:analysis.settings,clear:analysis.clear,points:[point]},now);
         server.send(ANALYSIS,{op:'sample',author,clear:analysis.clear,point});
      }
      window[ANALYSIS]=analysis;
      const signature=analysis.points.map(pointId).join('|');
      if(signature!==trailSignature){trailSignature=signature;clay.defineMesh(trailName,trailMesh(analysis.points,clay.vertexArray));}
      if(!cachedReach&&analysis.settings.heat){
         const result=sampler.step(500);reachProgress=result.progress;
         if(result.points){cachedReach=result.points;clay.defineMesh(heatName,heatMesh(cachedReach,clay.vertexArray));}
      }
      visualRoot.setMatrix(robotBaseFrame.getMatrix());
      // The existing shader premultiplies RGB by alpha before SRC_ALPHA blending.
      // Compensate this mesh's material so the chosen opacity does not also darken its colors.
      const alpha=analysis.settings.opacity,gain=1/(alpha*alpha);
      heat.identity().scale(analysis.settings.heat?1:0).color(gain,gain,gain).opacity(alpha);
      trail.identity().scale(analysis.settings.trail?1:0);
      toolMarker.identity().move(tool).scale(.005);
      const latest=analysis.points.at(-1),speed=latest&&now-latest.t<300?latest.v:0;
      panel.draw(state,m,{settings:analysis.settings,progress:reachProgress,speed,tool});
      beams.left.update();beams.right.update();

      let i = 0;                                        // ANIMATE THE ROBOT
      for (let j of joints) {  
         let z = j.rpy[2], y = j.rpy[1], x = j.rpy[0];
         switch (i) {
         case 0: case 2: case 3: z += m[i]; break;
         case 1: case 4: case 5: y += m[i]; break;
         }
         node[j.name].identity().move(j.xyz).turnZ(z).turnY(y).turnX(x);
         i++;
      }
      const rootInv=cg.mInverse(model.getGlobalMatrix());
      const camera=clay.views?.[0]?cg.mTransform(rootInv,cg.mTransform(clay.inverseRootMatrix,cg.mInverse(clay.views[0].viewMatrix).slice(12,15))):[0,1.6,2];
      labels.forEach((label,i)=>{
         const p=cg.mTransform(rootInv,node[joints[i].name].getGlobalMatrix().slice(12,15));
         // Six separate callouts in a vertical column, each connected to its actual joint.
         const q=[-.70,1.84-i*.135,.12],info=limitInfo(m[i],i);
         const title=`J${i+1} ${NAMES[i]}  ${(m[i]*180/Math.PI).toFixed(1)}°`;
         const content=title+info.text+info.margin.toFixed(1)+state.selected;
         if(content!==label.last){label.last=content;const ctx=label.ctx;ctx.fillStyle=state.selected===i?'#244557':'#101e29';ctx.fillRect(0,0,640,108);ctx.font='29px system-ui';ctx.fillStyle=info.color;ctx.fillText(title,18,40);ctx.font='23px system-ui';ctx.fillText(`${info.text} · ${info.margin.toFixed(1)}° to limit`,18,82);const slot=window._canvas_txtr?.[label.face._txtr];if(slot)slot.counter=1;}
         label.marker.identity().move(p).scale(state.selected===i?.009:.004).color(...(info.margin<=5?[1,.45,.25]:state.selected===i?[.3,1,.8]:[.5,.8,.9]));
         label.face.identity().move(q).aimZ(cg.subtract(camera,q)).scale(.235,.040,1);
         const end=cg.add(q,[.235,0,0]),delta=cg.subtract(end,p);
         label.line.identity().move(cg.mix(p,end,.5)).aimZ(delta).scale(.001,.001,cg.norm(delta)/2);
      });
   });
}

export const deinit=()=>{cleanup?.();cleanup=null;};
