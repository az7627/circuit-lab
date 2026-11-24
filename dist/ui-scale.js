export function normalizeUiScale(value){return Number.isFinite(value)?Math.round(Math.max(.25,Math.min(2.5,value))*4)/4:1;}
export function uiScale(){return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))||1;}
