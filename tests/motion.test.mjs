import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RotorMotion} from '../dist/motion.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('changing the speed preserves the current angle and starts from the previous velocity',()=>{
  const rotor=new RotorMotion();rotor.setSpeed(90,0);rotor.advance(1000);
  const angle=rotor.angle,speed=rotor.speed;rotor.setSpeed(400,1000);
  close(rotor.angle,angle);close(rotor.speed,speed);
  rotor.advance(1010);assert.ok(rotor.angle>angle);assert.ok(rotor.angle-angle<2);assert.ok(rotor.speed>speed&&rotor.speed<400);
});
test('repeated parameter changes do not reset the rotation phase',()=>{
  const rotor=new RotorMotion();rotor.setSpeed(100,0);rotor.advance(500);
  let last=rotor.angle;
  for(let i=1;i<=25;i++){const time=500+i*8;rotor.setSpeed(i%2?150:200,time);assert.ok(rotor.angle>=last);assert.ok(rotor.angle-last<2);last=rotor.angle;}
  assert.ok(rotor.angle>40);
});
test('power loss stops at the current angle and resuming does not jump to zero',()=>{
  const rotor=new RotorMotion();rotor.setSpeed(180,0);rotor.setSpeed(0,1000);
  const angle=rotor.angle;rotor.advance(10000);close(rotor.angle,angle);rotor.setSpeed(180,10000);close(rotor.angle,angle);
  rotor.advance(10016);assert.ok(rotor.angle>angle&&rotor.angle-angle<1);
});
test('reversing direction is continuous and an older frame timestamp cannot rewind the rotor',()=>{
  const rotor=new RotorMotion();rotor.setSpeed(100,0);rotor.advance(1000);const angle=rotor.angle;
  rotor.setSpeed(-100,1000);close(rotor.angle,angle);rotor.advance(990);close(rotor.angle,angle);
  rotor.advance(1010);assert.ok(rotor.speed>0);rotor.advance(2000);assert.ok(rotor.speed<0&&rotor.angle<angle);
});
