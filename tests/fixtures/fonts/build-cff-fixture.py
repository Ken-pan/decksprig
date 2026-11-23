"""Generate independent full-glyph CFF/CFF2 fixtures from the existing OFL original. Run from the project root with fontTools installed."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
import shutil
base=Path(__file__).resolve().parent;base.mkdir(exist_ok=True)
source=Path('public/fonts/pptx/manrope-regular.ttf')
f=TTFont(source);units=f['head'].unitsPerEm;fb=FontBuilder(units,isTTF=False);order=f.getGlyphOrder();fb.setupGlyphOrder(order);fb.setupCharacterMap(f.getBestCmap());gs=f.getGlyphSet();chars={}
for name in order:
 pen=T2CharStringPen(f['hmtx'].metrics[name][0],gs);gs[name].draw(pen);chars[name]=pen.getCharString()
fb.setupCFF('DecksprigCFFFixture',{'FullName':'Decksprig CFF Fixture','FamilyName':'Decksprig CFF Fixture','Weight':'Regular'},chars,{})
fb.setupHorizontalMetrics(f['hmtx'].metrics);fb.setupHorizontalHeader(ascent=f['hhea'].ascent,descent=f['hhea'].descent,lineGap=f['hhea'].lineGap);fb.setupNameTable({'familyName':'Decksprig CFF Fixture','styleName':'Regular','psName':'DecksprigCFFFixture','fullName':'Decksprig CFF Fixture Regular'});fb.setupOS2(sTypoAscender=f['OS/2'].sTypoAscender,sTypoDescender=f['OS/2'].sTypoDescender,usWinAscent=f['OS/2'].usWinAscent,usWinDescent=f['OS/2'].usWinDescent,fsType=0);fb.setupPost();fb.setupMaxp()
for n in f['name'].names:
 if n.nameID in [0,13,14]:fb.font['name'].names.append(n)

for table in ['GPOS','GSUB','kern']:
 if table in f:fb.font[table]=f[table]
fb.save(base/'manrope-cff.otf')
from fontTools.cffLib.CFFToCFF2 import convertCFFToCFF2
from fontTools import version
import hashlib,json
cff2=TTFont(base/'manrope-cff.otf');convertCFFToCFF2(cff2);cff2.save(base/'manrope-cff2.otf')
shutil.copy2('public/fonts/pptx/manrope-OFL.txt',base/'OFL.txt')
(base/'source.json').write_text(json.dumps({'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'generator':'build-cff-fixture.py','fontTools':version,'purpose':'Independent CFF/CFF2 reader, outline conversion and full-glyph tests; not runtime fonts','family':'Decksprig CFF Fixture','glyphs':len(order),'codepoints':len(f.getBestCmap()),'license':'OFL.txt'},indent=2)+'\n')
