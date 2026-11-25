export const idealWireX=y=>360+.0065*(y-240)**2;

export function rippledWirePoints(){
  return Array.from({length:121},(_,i)=>{
    const y=180+i,fade=Math.min(1,i/12,(120-i)/12);
    const jitter=fade*(.67*Math.sin(i*2*Math.PI/6.8)+.24*Math.sin(i*2*Math.PI/13.7));
    return {x:Math.round((idealWireX(y)+jitter)*12)/12,y};
  });
}

// Centerline estimated from the reported blue wire at 125% system scaling.
// Rotate the crop so the same vertical pixel scan can check both fixtures.
export function reportedSparseWirePoints(){
  return [
    [339.6311,180],[342.9508,184.0164],[344.7541,186.4754],[346.6803,189.3443],
    [349.1393,193.6885],[349.7951,194.5902],[350.7377,196.7213],[351.1885,197.377],
    [352.3361,200.4098],[354.0574,203.8525],[355.9426,208.7705],[357.418,214.0164],
    [358.1148,215.7377],[358.5656,217.377],[358.9754,221.7213],[359.7541,224.5082],
    [360,232.623],[359.7541,241.9672],[358.8934,248.3607],[357.9508,251.2295],
    [356.9262,255.3279],[354.7541,261.5574],[353.1967,265.1639],[351.8852,269.0164],
    [351.2705,270.2459],[351.0246,271.0656],[347.377,278.3607],[345.9836,280.6557],
    [343.9344,283.4426],[337.459,293.1967],[336.5164,294.2623],[335.123,296.3115],
    [334.0984,297.377],[332.0902,300]
  ].map(([x,y])=>({x,y}));
}

export function traceXAtY(points,y){
  const index=points.findIndex(point=>point.y>=y);
  const a=points[index-1],b=points[index];
  return a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y);
}
