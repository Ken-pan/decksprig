/** Used only after reconnect, conflict, offline and pause guards have returned. */
export function figmaPairedStatus(native:{ack:number}|undefined,nativeSeq:number,ack:number,commandSeq:number){
 if(!native&&nativeSeq===0)return 'Reading native slides in Figma';
 return (native?.ack??ack)<commandSeq?'Waiting for Figma to apply changes':'Connected · Changes sync automatically';
}
