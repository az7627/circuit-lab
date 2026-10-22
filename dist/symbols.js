import {lampAppearance,heaterAppearance} from './visuals.js?v=2.5';
export function symbol(c, {thumbnail=false,power=0,current=0,motion=true}={}) {
  const reading={power,current};
  const active=!thumbnail && Math.abs(current)>1e-8;
  if(c.type==='junction') return '<path d="M-48 0H48M0-25v50"/><circle r="8" fill="#8c70b2"/>';
  if (c.type === 'battery') return '<path d="M-54 0h46M8 0h46M-8-13v26M8-24v48"/><text class="battery-polarity" x="-28" y="-12">−</text><text class="battery-polarity" x="24" y="-12">+</text>';
  if(c.type==='spdt'){const upright=thumbnail?0:-(c.angle??0);return `<path d="M-54 0h27M26-24h28M26 24h28M-23 0 23 ${c.position===2?24:-24}"/><circle cx="-25" r="3"/><circle cx="25" cy="-24" r="3"/><circle cx="25" cy="24" r="3"/><text class="switch-port-label" x="-43" y="-12" transform="rotate(${upright} -43 -12)">C</text><text class="switch-port-label" x="42" y="-35" transform="rotate(${upright} 42 -35)">1</text><text class="switch-port-label" x="42" y="39" transform="rotate(${upright} 42 39)">2</text>`;}
  if (c.type === 'resistor') return '<path d="M-54 0h26m56 0h26"/><rect x="-28" y="-13" width="56" height="26" rx="2"/><path d="M-21-6h42" opacity=".16"/>';
  if(c.type==='rheostat') {const slider=thumbnail?0:-28+56*Math.max(0,Math.min(1,c.value/100));return `<path d="M-54 18h11V0h15"/><rect x="-28" y="-12" width="56" height="24" rx="2"/><path class="rheostat-slider" d="M0-54v18H${slider}v24m-5-8 5 8 5-8"/>`;}
  if(c.type==='capacitor') return '<path d="M-54 0h46M8 0h46M-8-23v46M8-23v46"/>';
  if(c.type==='inductor') return '<path d="M-54 0h20C-34-25-12-25-12 0C-12-25 10-25 10 0C10-25 32-25 32 0h22"/>';
  if(c.type==='heater'){const h=heaterAppearance(thumbnail?0:power),shape='M-33 0-26-15-13 15 0-15 13 15 26-15 33 0';return `<path d="M-54 0h21m66 0h21"/><path class="heater-glow" d="${shape}" stroke="${h.color}" stroke-width="8" opacity="${h.opacity}"/><path class="heater-coil" d="${shape}" stroke="${h.color}" stroke-width="${h.width}"/><path d="M-23-23q-5-6 0-12m23 12q-5-6 0-12m23 12q-5-6 0-12" stroke="${h.color}" opacity="${h.level*.8}"/>`;}
  if(c.type==='motor') return `<path d="M-54 0h28m52 0h28"/><circle r="26"/>${thumbnail?'<text class="motor-letter" y="8">M</text>':''}`;
  if(c.type==='bell') return `<path class="bell-body" d="M-25 0a25 25 0 0 1 50 0Z" fill="${active?'#f0e8fa':'#fdfcff'}"/><path d="M-14 0v54M14 0v54"/>`;
  if(c.type==='fuse') return `<path d="M-54 0h27m54 0h27"/><rect x="-27" y="-12" width="54" height="24" rx="3"/><path d="${c.blown?'M-22 0h10m24 0h10m-15-7 14 14m-14 0 14-14':'M-22 0h44'}" stroke="${c.blown?'#d97882':'#8c78ac'}"/>`;
  if (c.type === 'lamp') {
    const lampPower=Math.abs(power);
    const appearance=lampAppearance(thumbnail?0:lampPower);
    return `${appearance.opacity>.001?`<circle class="lamp-glow" r="${appearance.radius}" fill="url(#lampGlow)" stroke="none" opacity="${appearance.opacity}"/>`:''}<path d="M-54 0h28m52 0h28"/><circle class="lamp-body" r="26" fill="${appearance.fill}" stroke="${appearance.ring}"/><path class="lamp-filament" d="m-17-17 34 34m-34 0 34-34" stroke="${appearance.filament}"/>`;
  }
  if (c.type === 'switch') return `<path d="M-54 0h29M25 0h29M-23 0 23 ${c.closed ? 0 : -24}"/><circle cx="-25" cy="0" r="3"/><circle cx="25" cy="0" r="3"/>`;
  return `<path d="M-54 0h28m52 0h28"/><circle r="26"/>${thumbnail ? `<text class="meter-letter" y="8">${c.type === 'ammeter' ? 'A' : 'V'}</text>` : ''}`;
}
export function thumbnail(type) { const view=type==='rheostat'?'-65 -62 130 93':type==='bell'?'-52 -35 104 97':type==='spdt'?'-62 -44 124 88':'-62 -32 124 64';return `<svg viewBox="${view}" aria-hidden="true"><g class="component-symbol">${symbol({ type, closed: false }, {thumbnail:true})}</g></svg>`; }
