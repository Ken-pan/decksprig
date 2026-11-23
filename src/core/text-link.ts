/** A presentation link must never execute script or carry connection secrets.
 * Self-contained so the portable player uses the same policy. */
export function textLinkUrl(raw?:string):string|undefined {
 if(!raw)return;const value=raw.trim();if(value.length>3000||/[\u0000-\u001f\u007f]/.test(value))return;
 // Figma's plugin VM has no browser URL global. Keep validation portable.
 let decoded:string;try{decoded=decodeURIComponent(value);}catch{return;}
 if(/[\u0000-\u001f\u007f]/.test(decoded)||/(?:[?&#])(?:token|access_token|api[-_]?key|secret|password|client-id)=/i.test(decoded))return;
 const web=/^https?:\/\/([^/?#\s]+)(?:[/?#][^\s]*)?$/i.exec(value);
 if(web&&!/[@\\]/.test(decodeURIComponent(web[1]))&&/^(?:\[[a-f\d:.]+\]|[^\s/?#:@]+)(?::\d{1,5})?$/i.test(web[1]))return value;
 if(/^mailto:[^\s@?,]+@[^\s@?,]+(?:\?[^\s]*)?$/i.test(value)||/^tel:\+?[\d ().-]+$/i.test(value))return value;
}

/** Range links are promoted only when every nonblank range has one target. */
export function wholeTextLink(segments:readonly {characters?:string;text?:string;hyperlink?:{type:string;value:string}|null}[]):string|undefined {
 const content=segments.filter(s=>(s.characters??s.text??'').trim());if(!content.length)return;
 const first=content[0].hyperlink;if(first?.type!=='URL')return;
 const url=textLinkUrl(first.value);return url&&content.every(s=>s.hyperlink?.type==='URL'&&textLinkUrl(s.hyperlink.value)===url)?url:undefined;
}
