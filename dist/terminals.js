export const terminalIndices=type=>['spdt','ammeter','voltmeter'].includes(type)?[0,1,2]:[0,1];
export const contactIndex=component=>component.type==='spdt'?component.position:1;
