import {feedbackLevel} from './visuals.js?v=2.2';
export function bellLevel(power){return feedbackLevel(power,2);}
export class BellAudio{
  constructor(onState=()=>{}){this.context=null;this.master=null;this.voices=[];this.bells=[];this.settings={sound:true,volume:.35};this.onState=onState;this.nextStrike=0;this.timer=null;}
  async unlock(){
    try{if(!this.context){const Context=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Context){this.onState('unavailable');return;}this.context=new Context();this.master=this.context.createGain();this.master.gain.value=.35;const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;this.master.connect(limiter);limiter.connect(this.context.destination);this.context.onstatechange=()=>this.onState(this.context.state);}
      if(this.context.state==='suspended')await this.context.resume();this.onState(this.context.state);this.tick();
    }catch{this.onState('blocked');}
  }
  sync(components,readings,settings){
    this.settings=settings;this.bells=components.filter(c=>c.type==='bell'&&Math.abs(readings[c.id]?.power??0)>1e-9).map(c=>({id:c.id,level:bellLevel(Math.abs(readings[c.id].power))}));
    const allowed=new Set(settings.sound?this.bells.map(b=>b.id):[]);
    for(const v of this.voices)if(!allowed.has(v.id))this.stopVoice(v);
    if(this.context&&this.master)this.master.gain.setTargetAtTime(settings.sound?settings.volume:0,this.context.currentTime,.025);
    if(settings.sound&&this.bells.length&&!this.timer){this.timer=setInterval(()=>this.tick(),90);this.tick();}
    if((!settings.sound||!this.bells.length)&&this.timer){clearInterval(this.timer);this.timer=null;this.nextStrike=0;}
  }
  tick(){
    const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.settings.sound||!this.bells.length||document.hidden)return;
    if(ctx.currentTime<this.nextStrike)return;this.nextStrike=ctx.currentTime+.65;
    for(const bell of this.bells)this.strike(bell);
  }
  strike(bell){
    const ctx=this.context,t=ctx.currentTime,amplitude=.18*Math.sqrt(bell.level)/Math.sqrt(this.bells.length);
    for(const [ratio,weight] of [[1,.62],[1.48,.26],[2.13,.12]]){
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=1260*ratio;
      gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.00002,amplitude*weight),t+.007);gain.gain.exponentialRampToValueAtTime(.00001,t+.52);
      osc.connect(gain);gain.connect(this.master);const voice={id:bell.id,osc,gain,stopped:false};this.voices.push(voice);
      osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices=this.voices.filter(v=>v!==voice);};osc.start(t);osc.stop(t+.55);
    }
  }
  stopVoice(v){if(v.stopped||!this.context)return;v.stopped=true;const t=this.context.currentTime;try{v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(.00001,t,.01);v.osc.stop(t+.035);}catch{}}
  silence(){for(const v of this.voices)this.stopVoice(v);this.nextStrike=0;}
  dispose(){if(this.timer)clearInterval(this.timer);this.timer=null;this.silence();if(this.context){this.context.onstatechange=null;this.context.close();}this.context=null;this.master=null;this.voices=[];}
}
