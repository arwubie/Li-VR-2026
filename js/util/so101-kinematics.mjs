// The original SO101 link transforms; shared by rendering and numerical sampling.
export const JOINTS = [
      { name: 'shoulder_pan' , parent: 'robotBaseFrame', xyz: [ 0.0388353,  0          ,  0.0624   ], rpy: [ 3.14159, 0        , -3.14159], lo: -1.91986 , hi: 1.91986, link: 'shoulder_link'            },
      { name: 'shoulder_lift', parent: 'shoulder_pan'  , xyz: [-0.0303992, -0.0182778  , -0.0542   ], rpy: [-1.5708 ,-1.5708   ,  0      ], lo: -1.74533 , hi: 1.74533, link: 'upper_arm_link'           },
      { name: 'elbow_flex'   , parent: 'shoulder_lift' , xyz: [-0.11257  , -0.028      ,  0        ], rpy: [ 0      , 0        ,  1.5708 ], lo: -1.69    , hi: 1.69   , link: 'lower_arm_link'           },
      { name: 'wrist_flex'   , parent: 'elbow_flex'    , xyz: [-0.1349   ,  0.0052     ,  0        ], rpy: [ 0      , 0        , -1.5708 ], lo: -1.65806 , hi: 1.65806, link: 'wrist_link'               },
      { name: 'wrist_roll'   , parent: 'wrist_flex'    , xyz: [ 0        , -0.0611     ,  0.0181   ], rpy: [ 1.5708 , 0.0486795,  3.14159], lo: -2.74385 , hi: 2.84121, link: 'gripper_link'             },
      { name: 'gripper'      , parent: 'wrist_roll'    , xyz: [ 0.0202   ,  0.0188     , -0.0234   ], rpy: [ 1.5708 , 0        ,  0      ], lo: -0.174533, hi: 1.74533, link: 'moving_jaw_so101_v1_link' },
      { name: 'gripper_frame', parent: 'wrist_roll'    , xyz: [-0.0079   , -0.000218121, -0.0981274], rpy: [ 0      , 3.14159  ,  0      ], fixed: true,                link: 'gripper_frame_link'       },
   ];

// Position in robotBaseFrame, with the same T * Rz * Ry * Rx order as the scene.
// The fixed gripper_frame origin is the tool reference, not the moving jaw tip.
export function toolPosition(angles){
 let p=JOINTS[6].xyz.slice();
 for(let i=4;i>=0;i--){
  const j=JOINTS[i],q=Math.max(j.lo,Math.min(j.hi,angles[i]||0));
  const x=j.rpy[0],y=j.rpy[1]+([1,4].includes(i)?q:0),z=j.rpy[2]+([0,2,3].includes(i)?q:0);
  const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  const a=[p[0],cx*p[1]-sx*p[2],sx*p[1]+cx*p[2]];
  const b=[cy*a[0]+sy*a[2],a[1],-sy*a[0]+cy*a[2]];
  p=[j.xyz[0]+cz*b[0]-sz*b[1],j.xyz[1]+sz*b[0]+cz*b[1],j.xyz[2]+b[2]];
 }
 return p;
}

export function createReachSampler({total=30000,voxel=.01,maxDisplay=1800}={}){
 let index=0,seed=0x5012026,points=null;
 const cells=new Map();
 const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 return {step(budget=500){
  for(let count=0;count<budget&&index<total;count++,index++){
   const angles=JOINTS.slice(0,5).map(j=>j.lo+random()*(j.hi-j.lo));
   const p=toolPosition(angles),key=p.map(v=>Math.floor(v/voxel)).join(',');
   const margin=Math.min(...angles.map((q,i)=>2*Math.min(q-JOINTS[i].lo,JOINTS[i].hi-q)/(JOINTS[i].hi-JOINTS[i].lo)));
   const old=cells.get(key);
   if(!old||margin>old.margin)cells.set(key,{p,margin,key});
  }
  if(index===total&&!points){
   const all=[...cells.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
   const n=Math.min(maxDisplay,all.length);points=Array.from({length:n},(_,i)=>all[Math.floor(i*all.length/n)]);
  }
  return {progress:index/total,points,cells:cells.size,total};
 }};
}
