/** Defaults read from native Slides after choosing each preset in its UI.
 * These are playback durations, distinct from the inspector's displayed values.
 * Imported configurations keep their own authoritative native duration. */
export function nativeSpringDuration(curve:string):number|undefined{
 if(curve==='GENTLE')return 1022.0937728881836;
 if(curve==='QUICK')return 744.255542755127;
 if(curve==='BOUNCY')return 958.2165479660034;
 if(curve==='SLOW')return 1250.1229047775269;
}
export function nativeSpringDisplayDuration(curve:string):number|undefined{
 if(curve==='GENTLE'||curve==='BOUNCY')return 800;
 if(curve==='QUICK'||curve==='SLOW')return 600;
}
