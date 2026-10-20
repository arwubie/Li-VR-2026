// A final depth pass keeps spatial controls visible through scene geometry.
// The controls still depth-test against each other, preserving 3D keycaps/text.
export function drawForeground(gl, draw) {
   const depthMask=gl.getParameter(gl.DEPTH_WRITEMASK);
   const clearDepth=gl.getParameter(gl.DEPTH_CLEAR_VALUE);
   const depthFunc=gl.getParameter(gl.DEPTH_FUNC);
   const depthTest=gl.isEnabled(gl.DEPTH_TEST);
   const scissor=gl.isEnabled(gl.SCISSOR_TEST);
   try {
      // Clear both eyes' depth, including when the preceding draw used scissoring.
      gl.disable(gl.SCISSOR_TEST);
      gl.depthMask(true);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      draw();
   } finally {
      gl.depthMask(depthMask);
      gl.clearDepth(clearDepth);
      gl.depthFunc(depthFunc);
      if(depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
      if(scissor) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
   }
}
