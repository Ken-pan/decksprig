"""Build portable native faces from the already licensed, bundled font originals.
Run with fonttools + brotli. No network/font downloading and no source file edits.
"""
from pathlib import Path
import re,json,hashlib,struct,io,shutil,logging,argparse
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.merge import Merger

logging.getLogger('fontTools').setLevel(logging.ERROR)
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/fonts/pptx';OUT.mkdir(exist_ok=True)
catalog=json.loads((ROOT/'src/core/font-catalog.json').read_text())
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--family',action='append',help='Build only this bundled family; preserve other native faces')
parser.add_argument('--rebuild',action='store_true',help='Replace existing generated faces for the selected families')
args=parser.parse_args()
families=args.family or [font['family'] for font in catalog]
unknown=set(families)-{font['family'] for font in catalog}
if unknown:parser.error('Unknown bundled font: '+', '.join(sorted(unknown)))
manifest_path=OUT/'manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else []
if args.rebuild:manifest=[face for face in manifest if face['family'] not in families]
def name(font,id,default):
 v=font['name'].getDebugName(id);return v if v else default
def eot(font,raw):
 os=font['OS/2'];pan=os.panose
 panose=bytes(getattr(pan,k) for k in ['bFamilyType','bSerifStyle','bWeight','bProportion','bContrast','bStrokeVariation','bArmStyle','bLetterForm','bMidline','bXHeight'])
 head=struct.pack('<IIII',0,len(raw),0x00020001,0)+panose+bytes([1,1 if os.fsSelection&1 else 0])+struct.pack('<IHH',os.usWeightClass,os.fsType,0x504C)
 head+=struct.pack('<IIIIIII',os.ulUnicodeRange1,os.ulUnicodeRange2,os.ulUnicodeRange3,os.ulUnicodeRange4,getattr(os,'ulCodePageRange1',0),getattr(os,'ulCodePageRange2',0),font['head'].checkSumAdjustment)+struct.pack('<IIII',0,0,0,0)
 for value in [name(font,1,'Font'),name(font,2,'Regular'),name(font,5,'Version 1.0'),name(font,4,'Font')]:
  data=value.encode('utf-16le');head+=struct.pack('<HH',0,len(data))+data
 head+=struct.pack('<HH',0,0) # Padding5 and unrestricted RootStringSize, allowed by OFL.
 blob=head+raw;return struct.pack('<I',len(blob))+blob[4:]
for family in families:
 item=next(f for f in catalog if f['family']==family)
 css_path=ROOT/('public'+item['css']);blocks=[]
 for block in re.findall(r'@font-face\s*\{([^}]+)\}',css_path.read_text()):
  style=re.search(r'font-style:\s*(normal|italic)',block)
  weight=re.search(r'font-weight:\s*(\d+)(?:\s+(\d+))?',block)
  if not weight:raise ValueError('Missing weight: '+family)
  paths=[]
  for url in re.findall(r"url\(['\"]?([^\)'\"]+)",block):
   path=ROOT/('public'+url) if url.startswith('/') else css_path.parent/url
   if path not in paths:paths.append(path)
  blocks.append((style[1] if style else 'normal',int(weight[1]),int(weight[2] or weight[1]),paths))
 license=ROOT/('public'+item['license'])
 assert 'SIL OPEN FONT LICENSE' in license.read_text(),'Only verified OFL families are packaged'
 license_out=OUT/(item['id']+'-OFL.txt')
 if not license_out.exists() or args.rebuild:shutil.copy2(license,license_out)
 for italic in [False,True] if 'italic' in item['styles'] else [False]:
  for weight in ([400] if len(item['weights'])==1 else [400,700]):
   native_style=('boldItalic' if italic else 'bold') if weight>=600 else ('italic' if italic else 'regular')
   if any(f['family']==family and f['style']==native_style for f in manifest):continue
   available=[b for b in blocks if b[0]==('italic' if italic else 'normal')]
   if not available:raise ValueError('Missing face: '+family+' '+native_style)
   distance=min(abs(weight-max(b[1],min(b[2],weight))) for b in available)
   paths=[]
   for _,low,high,sources in available:
    if abs(weight-max(low,min(high,weight)))==distance:
     for path in sources:
      if path not in paths:paths.append(path)
   temps=[];modified=[]
   for i,path in enumerate(paths):
    font=TTFont(path,recalcTimestamp=False);font.flavor=None;modified.append(font['head'].modified)
    if 'fvar' in font:font=instantiateVariableFont(font,{axis.axisTag:weight if axis.axisTag=='wght' else axis.defaultValue for axis in font['fvar'].axes},inplace=False)
    font.recalcTimestamp=False
    temp=OUT/f'.{item["id"]}-{native_style}-{i}.ttf';font.save(temp);temps.append(temp)
   if len(temps)>1:font=Merger().merge([str(t) for t in temps])
   else:font=TTFont(temps[0],recalcTimestamp=False)
   style=('Bold Italic' if italic else 'Bold') if weight>=600 else ('Italic' if italic else 'Regular');full=family+' '+style
   for nameid,value in [(1,family),(2,style),(4,full),(6,full.replace(' ','')),(16,family),(17,style)]:font['name'].setName(value,nameid,3,1,0x409)
   font['OS/2'].usWeightClass=weight;assert font['OS/2'].fsType==0,'Only fully editable, installable OFL faces are packaged'
   font['OS/2'].fsSelection=(font['OS/2'].fsSelection&~(1|1<<5|1<<6))|((1<<5) if weight>=600 else 0)|(1 if italic else 0)|((1<<6) if not italic and weight<600 else 0)
   font['head'].macStyle=(font['head'].macStyle&~3)|(1 if weight>=600 else 0)|(2 if italic else 0)
   font['head'].modified=max(modified);font.recalcTimestamp=False
   font.flavor=None;buf=io.BytesIO();font.save(buf);raw=buf.getvalue();font=TTFont(io.BytesIO(raw),recalcTimestamp=False)
   stem=item['id']+'-'+native_style;ttf=OUT/(stem+'.ttf');ttf.write_bytes(raw);payload=eot(font,raw);(OUT/(stem+'.fntdata')).write_bytes(payload)
   manifest.append({'family':family,'style':native_style,'weight':weight,'file':'/fonts/pptx/'+stem+'.fntdata','ttf':'/fonts/pptx/'+stem+'.ttf','license':'/fonts/pptx/'+item['id']+'-OFL.txt','format':'EOT 0x20001; full sfnt, no glyph subsetting','fsType':font['OS/2'].fsType,'glyphs':len(font.getBestCmap()),'sha256':hashlib.sha256(payload).hexdigest(),'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}})
   for t in temps:t.unlink()
   print(f'{family} {style}: {len(raw)} bytes, {len(font.getBestCmap())} characters',flush=True)
manifest_path.write_text(json.dumps(manifest,indent=2))
print('Native font faces packaged:',len(manifest),flush=True)
