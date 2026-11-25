export const idealWireX=y=>360+.0065*(y-240)**2;

export function rippledWirePoints(){
  return Array.from({length:121},(_,i)=>{
    const y=180+i,fade=Math.min(1,i/12,(120-i)/12);
    const jitter=fade*(.67*Math.sin(i*2*Math.PI/6.8)+.24*Math.sin(i*2*Math.PI/13.7));
    return {x:Math.round((idealWireX(y)+jitter)*12)/12,y};
  });
}
