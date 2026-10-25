import {renderTaskGuides} from './task-guides.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function enhanceWebsiteSeo(out,origin){
  const pages=[['index.html','/','en','Decksprig | Browser slide editor for portfolios & presentations'],['guide.html','/guide','en','Decksprig guide | Edit, present, back up & export slides'],['guide.zh-CN.html','/guide.zh-cn','zh-CN','Decksprig 中文指南 | 编辑、演示、备份与导出幻灯片'],['privacy.html','/privacy','en','Decksprig privacy policy'],['licenses.html','/licenses','en','Decksprig licenses & artwork attribution']];
  for(const [file,path,lang,title] of pages){
    let html=await readFile(resolve(out,file),'utf8');
    const description=html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || (path==='/privacy'?'How Decksprig stores documents locally and handles optional connected features.':'Licenses, attribution and reuse terms for Decksprig code, fonts and artwork.');
    const image=origin+'/assets/editor-light.jpg';
    html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escape(title)}</title>`).replace(/<link\b[^>]*(?:rel="canonical"|hreflang="[^"]+")[^>]*>/gi,'').replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi,'');
    const graph=[{'@type':'WebSite','@id':origin+'/#website',name:'Decksprig',url:origin+'/',publisher:{'@type':'Person',name:'Ken Pan'}},{'@type':path.startsWith('/guide')?'TechArticle':'WebPage','@id':origin+path+'#webpage',url:origin+path,name:title,description,inLanguage:lang,isPartOf:{'@id':origin+'/#website'}}];
    if(path==='/')graph.push({'@type':'WebApplication','@id':origin+'/#app',name:'Decksprig',url:origin+'/',description,applicationCategory:'ProductivityApplication',operatingSystem:'Web browser',screenshot:image,author:{'@type':'Person',name:'Ken Pan'}});
    if(path!=='/')graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Decksprig',item:origin+'/'},{'@type':'ListItem',position:2,name:title,item:origin+path}]});
    let tags=`<link rel="canonical" href="${origin+path}"><meta name="description" content="${description}"><meta name="robots" content="index, follow, max-image-preview:large">`;
    for(const [name,value]of Object.entries({'og:type':path.startsWith('/guide')?'article':'website','og:site_name':'Decksprig','og:title':title,'og:description':description,'og:url':origin+path,'og:image':image,'og:image:alt':'Decksprig browser slide editor','og:locale':lang==='en'?'en_US':'zh_CN'}))tags+=`<meta property="${name}" content="${escape(value)}">`;
    for(const [name,value]of Object.entries({'twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,'twitter:image':image,'twitter:image:alt':'Decksprig browser slide editor'}))tags+=`<meta name="${name}" content="${escape(value)}">`;
    if(path.startsWith('/guide'))tags+=`<link rel="alternate" hreflang="en" href="${origin}/guide"><link rel="alternate" hreflang="zh-Hans" href="${origin}/guide.zh-cn"><link rel="alternate" hreflang="x-default" href="${origin}/guide">`;
    tags+=`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script>`;
    await writeFile(resolve(out,file),html.replace('</head>',tags+'</head>'));
  }
  for(const file of ['demo.html','presentation.html']){let html=await readFile(resolve(out,file),'utf8');if(!html.includes('name="robots"'))html=html.includes('</head>')?html.replace('</head>','<meta name="robots" content="noindex, follow"></head>'):html.replace(/(<html\b[^>]*>)/i,'$1<meta name="robots" content="noindex, follow">');await writeFile(resolve(out,file),html);}
  await writeFile(resolve(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${pages.map(([,path])=>`<url><loc>${origin+path}</loc>${path.startsWith('/guide')?`<xhtml:link rel="alternate" hreflang="en" href="${origin}/guide"/><xhtml:link rel="alternate" hreflang="zh-Hans" href="${origin}/guide.zh-cn"/>`:''}</url>`).join('')}</urlset>\n`);
  await renderTaskGuides(out);
  console.log('Website SEO: 5 canonical public pages; reciprocal guides; editor previews excluded from sitemap.');
}
