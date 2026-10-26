export function normalizeUiScale(value){return Number.isFinite(value)?Math.round(Math.max(.75,Math.min(2,value))*100)/100:1;}
export function uiScale(){return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))||1;}
