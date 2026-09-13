"""Generate editable branding and an illustrative README animation.
Optional artwork tool: Python 3 + Pillow. Not needed to build/run the extension.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'media'
OUT.mkdir(exist_ok=True)
NAVY='#131922'; PANEL='#1b2330'; LINE='#303d50'; TEXT='#dce5f0'; MUTED='#8898ae'; BLUE='#65c8ed'; PURPLE='#ac8df7'; GREEN='#8ac89a'
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="InlineTraceLens: a lens framing a Git branch">
<rect x="8" y="8" width="496" height="496" rx="112" fill="#131922"/>
<path d="M326 326L419 419" fill="none" stroke="#ac8df7" stroke-width="48" stroke-linecap="round"/>
<circle cx="224" cy="224" r="137" fill="#1b2330" stroke="#65c8ed" stroke-width="30"/>
<path d="M179 166V283M179 264C179 231 269 248 269 199" fill="none" stroke="#ac8df7" stroke-width="17" stroke-linecap="round"/>
<circle cx="179" cy="166" r="21" fill="#65c8ed"/>
<circle cx="179" cy="283" r="21" fill="#65c8ed"/>
<circle cx="269" cy="199" r="21" fill="#ac8df7"/>
</svg>'''
(OUT/'icon.svg').write_text(SVG, encoding='utf8')
S=4
icon=Image.new('RGBA',(512*S,512*S),(0,0,0,0)); d=ImageDraw.Draw(icon)
def box(b): return tuple(round(x*S) for x in b)
def circ(x,y,r,fill): d.ellipse(box((x-r,y-r,x+r,y+r)),fill=fill)
d.rounded_rectangle(box((8,8,504,504)),radius=112*S,fill=NAVY)
d.line(box((326,326,419,419)),fill=PURPLE,width=48*S);circ(326,326,24,PURPLE);circ(419,419,24,PURPLE)
circ(224,224,152,BLUE);circ(224,224,122,PANEL)
d.line(box((179,166,179,283)),fill=PURPLE,width=17*S)
pts=[]
for i in range(81):
 t=i/80; a=1-t
 pts.append((S*(a*a*a*179+3*a*a*t*179+3*a*t*t*269+t*t*t*269),S*(a*a*a*264+3*a*a*t*231+3*a*t*t*248+t*t*t*199)))
d.line(pts,fill=PURPLE,width=17*S,joint='curve')
for px,py in pts: d.ellipse((px-8.5*S,py-8.5*S,px+8.5*S,py+8.5*S),fill=PURPLE)
for x,y,c in [(179,166,BLUE),(179,283,BLUE),(269,199,PURPLE)]:circ(x,y,21,c)
icon=icon.resize((512,512),Image.Resampling.LANCZOS);icon.save(OUT/'icon.png')

W,H=1120,660
FONTDIR=Path('C:/Windows/Fonts')
def font(size,bold=False,mono=False):
 candidates=[FONTDIR/('consola.ttf' if mono else 'seguisb.ttf' if bold else 'segoeui.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf' if mono else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
 for f in candidates:
  if f.exists():return ImageFont.truetype(str(f),size)
 return ImageFont.load_default(size=size)
F={n:font(n) for n in [12,13,14,16,18,20,24,30]};B={n:font(n,True) for n in [16,20,24,30]};M=font(17,mono=True)
small=icon.resize((44,44),Image.Resampling.LANCZOS)
def base(step,title,subtitle):
 im=Image.new('RGB',(W,H),NAVY);dr=ImageDraw.Draw(im)
 im.paste(small,(28,22),small)
 dr.text((86,25),'InlineTraceLens',font=B[24],fill=TEXT)
 dr.text((87,56),'GIT GRAPH  /  INLINE BLAME',font=F[12],fill=MUTED)
 dr.text((W-210,35),'vluzrmos.inlinetracelens',font=F[12],fill=MUTED)
 dr.line((28,89,W-28,89),fill=LINE)
 dr.text((32,111),step,font=F[13],fill=BLUE)
 dr.text((32,137),title,font=B[30],fill=TEXT)
 dr.text((32,182),subtitle,font=F[16],fill=MUTED)
 dr.rounded_rectangle((28,226,W-28,596),radius=10,fill=PANEL,outline=LINE)
 dr.text((32,620),'DEMONSTRAÇÃO ILUSTRATIVA • DADOS FICTÍCIOS',font=F[12],fill=MUTED)
 for i in range(3):dr.rounded_rectangle((W-127+i*30,626,W-107+i*30,630),radius=2,fill=BLUE if i==int(step[:2])-1 else LINE)
 return im,dr

def badge(dr,x,y,label,color):
 width=dr.textlength(label,font=F[12])+14
 dr.rounded_rectangle((x,y,x+width,y+22),radius=4,outline=color)
 dr.text((x+7,y+2),label,font=F[12],fill=color)
 return width

def graph(expanded=False):
 im,dr=base('01 / HISTÓRICO','Siga o caminho de cada commit.','Branches locais e remotos, merges e arquivos alterados em uma única visão.')
 dr.text((47,242),'Git Graph',font=B[16],fill=TEXT);dr.text((155,244),'demo-project / main',font=F[13],fill=MUTED)
 dr.text((922,244),'5 commits',font=F[13],fill=MUTED)
 dr.line((29,274,1090,274),fill=LINE)
 for x,label in [(48,'Grafo'),(168,'Descrição'),(760,'Autor'),(944,'Commit')]:dr.text((x,285),label,font=F[12],fill=MUTED)
 subjects=['Merge branch feature/auth','Validate session tokens','Improve graph navigation','Add inline blame','Initial commit']
 hashes=['25a7d41','ac47a92','fa123b7','02e65ca','936abcd']
 ys=[329,375,421,467,513] if not expanded else [329,493,539]
 dr.line((72,ys[0],72,ys[-1]),fill=BLUE,width=2)
 for a,b in [(0,1)]:
  y1,y2=ys[a],ys[b]
  points=[(72,y1),(105,y1+15),(105,y2-12),(72,y2)]
  dr.line(points,fill=PURPLE,width=2)
 for i,y in enumerate(ys):
  dr.ellipse((67,y-5,77,y+5),fill=PANEL,outline=BLUE,width=2)
  if expanded and i==0:dr.rounded_rectangle((145,y-17,1080,y+18),radius=4,fill='#28384a')
  x=168
  if i==0:
   x+=badge(dr,x,y-11,'main',BLUE)+7;x+=badge(dr,x,y-11,'origin/main',PURPLE)+12
  dr.text((x,y-10),subjects[i],font=F[14],fill=TEXT)
  dr.text((760,y-10),'Alex Silva' if i%2==0 else 'Sam Costa',font=F[13],fill=MUTED)
  dr.text((944,y-10),hashes[i],font=font(13,mono=True),fill=BLUE)
 if expanded:
  dr.rounded_rectangle((149,354,1077,467),radius=5,fill='#151d29')
  dr.text((168,365),'ARQUIVOS ALTERADOS',font=F[12],fill=MUTED)
  for y,status,name,c in [(398,'M','src/auth/session.ts',PURPLE),(431,'A','test/session.test.ts',GREEN)]:
   dr.text((170,y),status,font=F[14],fill=c);dr.text((202,y),name,font=F[14],fill=TEXT);dr.text((962,y),'Abrir diff',font=F[12],fill=BLUE)
 return im

CODE=[('export function',' loadProfile(id: string) {'),('  const',' user = findUser(id);'),('  if',' (!user) {'),('    return',' null;'),('  }',''),('',''),('  const',' profile = {'),('    id:',' user.id,'),('    name:',' user.name,'),('  };',''),('  return',' profile;'),('}','')]
def blame(lines,multi=False):
 im,dr=base('03 / MULTICURSOR' if multi else '02 / AUTORIA','Mais cursores. O mesmo contexto.' if multi else 'A autoria acompanha seu cursor.','Uma anotação por linha com cursor, mesmo com múltiplas seleções.' if multi else 'Quem alterou, há quanto tempo e por quê — sem poluir o restante do arquivo.')
 dr.text((49,242),'profile.ts',font=F[14],fill=TEXT);dr.text((954,244),'TypeScript',font=F[12],fill=MUTED);dr.line((29,274,1090,274),fill=LINE)
 for i,(keyword,body) in enumerate(CODE):
  y=291+i*23
  if i in lines:dr.rectangle((30,y-2,1090,y+21),fill='#222f40')
  dr.text((50,y),str(i+1).rjust(2),font=M,fill='#65748a')
  dr.text((99,y),keyword,font=M,fill=PURPLE)
  dr.text((99+dr.textlength(keyword,font=M),y),body,font=M,fill=TEXT)
  if i in lines:
   length=dr.textlength(keyword+body,font=M)
   dr.line((100+length,y+1,100+length,y+19),fill=BLUE,width=2)
   label='Você · há 2 dias · Add profile lookup · 25a7d41' if i%2 else 'Sam · há 4 dias · Refine profile data · ac47a92'
   dr.text((max(520,125+length),y+3),label,font=F[13],fill=MUTED)
 return im

def pointer(im,x,y,click=False):
 im=im.copy();dr=ImageDraw.Draw(im)
 if click:dr.ellipse((x-13,y-13,x+13,y+13),outline=BLUE,width=2)
 dr.polygon([(x,y),(x+2,y+22),(x+8,y+16),(x+14,y+25),(x+19,y+22),(x+13,y+14),(x+22,y+12)],fill='#f3f7fc',outline='#111722')
 return im
frames=[]; durations=[]
def add(im,ms=120):frames.append(im);durations.append(ms)
def move(im,a,b):
 for i in range(12):
  t=(i+1)/12;t=t*t*(3-2*t)
  add(pointer(im,round(a[0]+(b[0]-a[0])*t),round(a[1]+(b[1]-a[1])*t)),60)
first=graph();add(first,1300);move(first,(950,568),(425,329));add(pointer(first,425,329,True),250)
opened=graph(True);add(pointer(opened,425,329),1500);move(opened,(425,329),(417,407));add(pointer(opened,417,407,True),700)
for line in [1,3,7]:add(blame([line]),1400)
add(blame([1,7,10],True),3000)
add(first,700)
# One adaptive palette reduces flicker between frames; optimize stores changed regions.
contact=Image.new('RGB',(W,H*4))
for i,img in enumerate([first,opened,blame([3]),blame([1,7,10],True)]):contact.paste(img,(0,i*H))
palette=contact.quantize(colors=128,method=Image.Quantize.MEDIANCUT)
indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
indexed[0].save(OUT/'demo.gif',save_all=True,append_images=indexed[1:],duration=durations,loop=0,optimize=True,disposal=1)
opened.save(OUT/'demo-preview.png')
print(f'Created icon.svg, icon.png, demo.gif ({len(frames)} frames, {sum(durations)/1000:.1f}s), demo-preview.png')
