// Coordinates are city units (one unit = one meter in WALK). The tracked head
// remains untouched: moving the scene preserves normal headset/room tracking.
export const homeView = () => ({walking:false,x:8,y:1.6,z:36,yaw:0});
export function setView(view,x,y,z,yaw=view.yaw) {
   if(![x,y,z,yaw].every(Number.isFinite)) throw new Error('View coordinates must be finite numbers.');
   return {...view,walking:true,x:Math.max(-40,Math.min(40,x)),y:Math.max(.5,Math.min(35,y)),z:Math.max(-40,Math.min(40,z)),yaw};
}
export function moveView(view,side,forward,seconds=1) {
   if(!view.walking) return view;
   const length=Math.max(1,Math.hypot(side,forward));
   const distance=2.5*Math.max(0,Math.min(seconds,.1));
   return setView(view,view.x+(Math.cos(view.yaw)*side-Math.sin(view.yaw)*forward)*distance/length,
      view.y,view.z+(-Math.sin(view.yaw)*side-Math.cos(view.yaw)*forward)*distance/length);
}
