/** Integrate angular velocity without resetting the rotor when its speed changes. */
export class RotorMotion {
  constructor(time=0){this.angle=0;this.speed=0;this.target=0;this.time=time;}
  advance(time){
    time=Math.max(this.time,time);
    const dt=(time-this.time)/1000,tau=.16,decay=Math.exp(-dt/tau);
    this.angle=((this.angle+this.target*dt+(this.speed-this.target)*tau*(1-decay))%360+360)%360;
    this.speed=this.target+(this.speed-this.target)*decay;this.time=time;
    return this.angle;
  }
  setSpeed(speed,time){this.advance(time);this.target=Number.isFinite(speed)?speed:0;if(!this.target)this.speed=0;return this.angle;}
}
