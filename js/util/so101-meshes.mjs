import {speedColor,trailSegments} from './so101-analysis.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const d=Math.hypot(...a);return a.map(v=>v/d);};
// Batched triangles: one draw per visualization, rather than thousands of scene objects.
function builder(vertexArray){
 const vertices=[];
 return {triangle(a,b,c,color){const n=unit(cross(sub(b,a),sub(c,a)));for(const p of [a,b,c])vertices.push(...vertexArray(p,n,null,null,color));},finish(){const mesh=new Float32Array(vertices);mesh.isTriangles=true;return mesh;}};
}
export function heatMesh(points,vertexArray){
 const out=builder(vertexArray),r=.003;
 for(const {p,margin} of points){
  const axes=[[r,0,0],[0,r,0],[0,0,r],[-r,0,0],[0,-r,0],[0,0,-r]].map(a=>a.map((v,i)=>v+p[i]));
  const color=margin>=.2?[.20,.90,.62]:[1,.59,.18];
  for(const [a,b,c] of [[2,0,1],[2,1,3],[2,3,4],[2,4,0],[5,1,0],[5,3,1],[5,4,3],[5,0,4]])out.triangle(axes[a],axes[b],axes[c],color);
 }
 return out.finish();
}
export function trailMesh(points,vertexArray){
 const out=builder(vertexArray),r=.0014;
 for(const {a,b,speed} of trailSegments(points)){
  const d=unit(sub(b,a)),u=unit(cross(d,Math.abs(d[2])<.9?[0,0,1]:[0,1,0])),v=cross(d,u),color=speedColor(speed);
  const ring=p=>Array.from({length:4},(_,i)=>p.map((x,j)=>x+r*(Math.cos(i*Math.PI/2)*u[j]+Math.sin(i*Math.PI/2)*v[j])));
  const aa=ring(a),bb=ring(b);
  for(let i=0;i<4;i++){const j=(i+1)%4;out.triangle(aa[i],aa[j],bb[i],color);out.triangle(aa[j],bb[j],bb[i],color);}
 }
 return out.finish();
}
