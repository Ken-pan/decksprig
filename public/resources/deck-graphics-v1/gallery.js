import {DEFAULT_GRAPHIC_RECIPE, GRAPHIC_FAMILIES, normalizeGraphicRecipe, graphicInfo, graphicSearchScore, graphicFacets, customizeGraphic, graphicDetailSvg} from '../graphic-engine.js';
const editorPath=document.querySelector('meta[name=deck-editor-path]')?.content||'/';
const $=selector=>document.querySelector(selector),grid=$('.grid'),status=$('#status'),dialog=$('dialog');
let assets=[],category='',family='',query='',ink=$('#ink').value,background='light',urls=[],detailUrls=[],selected,recipe={...DEFAULT_GRAPHIC_RECIPE},detailInk=ink,mode='material',searchTimer;
const drafts=new Map();
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
const svgUrl=svg=>URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
function free(list){list.forEach(url=>URL.revokeObjectURL(url));list.length=0;}
function render(){
  free(urls);grid.replaceChildren();
  const facets=graphicFacets(assets.map(a=>a.item),query,category),select=$('#family');select.replaceChildren(new Option('All families',''));
  facets.forEach(f=>{const option=new Option(`${f.label} (${f.count})`,f.id);option.disabled=!f.count&&f.id!==family;select.add(option);});select.value=family;
  const shown=assets.filter(a=>(!category||a.item.category===category)&&(!family||graphicInfo(a.item).family===family)&&Number.isFinite(graphicSearchScore(a.item,query))).sort((a,b)=>graphicSearchScore(a.item,query)-graphicSearchScore(b.item,query));
  status.textContent=`${shown.length} resources · Background thumbnails show enlarged detail`;$('#clear').hidden=!(query||category||family);
  if(!shown.length){const empty=node('p','No matches. Try a shorter search or clear the filters.');empty.className='empty';grid.append(empty);}
  for(const asset of shown){
    const {item,svg}=asset,info=graphicInfo(item),url=svgUrl(graphicDetailSvg(customizeGraphic(svg,ink,{},info.repeatable),info,item.width,item.height));urls.push(url);
    const article=node('article');article.className='asset';article.dataset.category=item.category;
    const button=node('button');button.setAttribute('aria-label',`Preview ${item.title}`);button.addEventListener('click',()=>open(asset));
    const preview=node('div');preview.className='preview';const img=node('img');img.src=url;img.alt='';img.loading='lazy';preview.append(img);
    const title=node('span',item.title);title.className='title';const meta=node('span',`${info.familyLabel} · ${item.category==='accent'?'Accent':'Detail'}`);meta.className='info';button.append(preview,title,meta);article.append(button);grid.append(article);
  }
}
function saveDraft(){if(selected)drafts.set(selected.item.id,{recipe:{...recipe},ink:detailInk});}
function open(asset){
  selected=asset;const draft=drafts.get(asset.item.id);recipe=normalizeGraphicRecipe(draft?.recipe||{});detailInk=draft?.ink||ink;mode='material';
  const {item}=asset,info=graphicInfo(item);$('#detail-title').textContent=item.title;$('#description').textContent=info.description;$('#usage').textContent=`Best for: ${info.useCases.join(' · ')}`;
  $('#license-label').textContent=`Source and license · ${item.license}`;$('#license-notice').textContent=item.licenseNotice;$('#source').href=item.sourceUrl;$('#license').href=item.licenseUrl;
  $('#controls').replaceChildren();
  const fields=[{key:'strength',label:'Strength',min:25,max:200,step:5,factor:100,unit:'%'},...(info.repeatable?[{key:'scale',label:'Pattern size',min:50,max:300,step:5,factor:100,unit:'%'},{key:'rotation',label:'Angle',min:0,max:180,step:1,factor:1,unit:'°'}]:[])];
  fields.forEach(field=>{const label=node('div');label.className='range-control';label.append(node('span',field.label));const inputs=node('div');inputs.className='range-input';
    for(const type of ['range','number']){const input=node('input');input.type=type;input.min=field.min;input.max=field.max;input.step=field.step;input.dataset.key=field.key;input.dataset.factor=field.factor;input.setAttribute('aria-label',`${field.label}${type==='number'?' value':''}`);input.addEventListener(type==='range'?'input':'change',()=>{const number=Number(input.value);if(!input.value||!Number.isFinite(number)){input.value=String(Math.round(recipe[field.key]*field.factor));return;}recipe=normalizeGraphicRecipe({...recipe,[field.key]:Math.min(field.max,Math.max(field.min,number))/field.factor});update();});inputs.append(input);}
    inputs.append(node('span',field.unit));label.append(inputs);$('#controls').append(label);
  });
  $('[data-mode=example]').hidden=item.category==='accent';$('#detail-color input').value=detailInk;update();document.body.style.overflow='hidden';dialog.showModal();
}
function update(){
  if(!selected)return;free(detailUrls);saveDraft();const {item,svg}=selected,info=graphicInfo(item),full=customizeGraphic(svg,detailInk,recipe,info.repeatable),url=svgUrl(full);detailUrls.push(url);
  const preview=mode==='detail'?svgUrl(graphicDetailSvg(full,info,item.width,item.height)):url;if(preview!==url)detailUrls.push(preview);
  const image=$('#detail-image');image.src=preview;image.alt=`${item.title} · ${mode==='detail'?'enlarged detail':mode==='example'?'example composition':'full material'}`;
  const stage=$('.inspector-preview');stage.dataset.category=item.category;stage.dataset.bg=background;stage.classList.toggle('example',mode==='example');$('.example-copy').hidden=mode!=='example';
  $('#preview-caption').textContent=mode==='detail'?'Enlarged detail · Downloads use the full material':mode==='example'?'Example composition · Text is not included in the SVG':'Full material · Transparent SVG';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(mode===b.dataset.mode)));
  document.querySelectorAll('[data-strength]').forEach(b=>b.setAttribute('aria-pressed',String(recipe.strength===Number(b.dataset.strength))));
  document.querySelectorAll('#controls input').forEach(input=>{input.value=String(Math.round(recipe[input.dataset.key]*Number(input.dataset.factor)));if(input.type==='range')input.setAttribute('aria-valuetext',`${input.value}${input.dataset.key==='rotation'?' degrees':' percent'}`);});
  const download=$('#download');download.href=url;download.download=item.id+'-custom.svg';const resourceId=`deck-graphics:${item.category==='accent'?'accent-':''}${item.id}`;
  $('#editor').href=`${editorPath}?${new URLSearchParams({library:'deck-graphics',asset:resourceId,accent:detailInk,recipe:JSON.stringify(recipe)})}`;
  $('#detail-status').textContent='Settings stay with your editor import and customized SVG. Original pack files stay unchanged.';
}
$('#close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{document.body.style.overflow='';saveDraft();free(detailUrls);});
$('#reset').addEventListener('click',()=>{recipe={...DEFAULT_GRAPHIC_RECIPE};detailInk=ink;$('#detail-color input').value=detailInk;update();});
$('#detail-color input').addEventListener('input',e=>{detailInk=e.target.value;update();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;update();}));
document.querySelectorAll('[data-strength]').forEach(b=>b.addEventListener('click',()=>{recipe={...recipe,strength:Number(b.dataset.strength)};update();}));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.filter;family='';document.querySelectorAll('[data-filter]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));render();}));
$('#family').addEventListener('change',e=>{family=e.target.value;render();});$('input[type=search]').addEventListener('input',e=>{query=e.target.value.slice(0,120);clearTimeout(searchTimer);searchTimer=setTimeout(render,120);});
$('#ink').addEventListener('input',e=>{ink=e.target.value;render();});$('#background').addEventListener('change',e=>{background=e.target.value;document.body.dataset.bg=background;});
$('#clear').addEventListener('click',()=>{query=category=family='';$('input[type=search]').value='';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(!b.dataset.filter)));render();});
try{
  const response=await fetch('manifest.json');if(!response.ok)throw new Error('The catalog could not load. Reload to try again.');
  const manifest=await response.json();assets=await Promise.all(manifest.items.map(async item=>{const r=await fetch(item.file);if(!r.ok)throw new Error('An SVG could not load. Reload to try again.');return {item,svg:await r.text()};}));
  $('#dark-example').src=svgUrl(customizeGraphic(assets.find(a=>a.item.id==='contour-flow').svg,'#f5f4ef'));render();
}catch(error){status.textContent=error.message;}
