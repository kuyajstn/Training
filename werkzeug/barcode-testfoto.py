# Aufruf: python3 werkzeug/barcode-testfoto.py 4056489012788 /tmp/foto.jpg -9   (Code, Ziel, Schräge in Grad)
# EAN-13 als „Foto“: Code auf weißem Etikett, leicht schräg, unscharf, mit Rauschen, in einem großen Bild.
import sys, random
from PIL import Image, ImageDraw, ImageFilter
L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"]
R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"]
P = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
def bits(code):
    d=[int(c) for c in code]; s="101"
    for i,c in enumerate(d[1:7]): s += (L if P[d[0]][i]=="L" else G)[c]
    s += "01010"
    for c in d[7:]: s += R[c]
    return s+"101"
code, out, schraeg = sys.argv[1], sys.argv[2], float(sys.argv[3])
b = bits(code); m = 8
lab = Image.new("L", ((len(b)+20)*m, 70*m), 245); dr = ImageDraw.Draw(lab)
for i,c in enumerate(b):
    if c=="1": dr.rectangle([(i+10)*m, 5*m, (i+11)*m-1, 62*m], fill=20)
lab = lab.rotate(schraeg, expand=True, fillcolor=120)
foto = Image.new("L", (3024, 2268), 120)
foto.paste(lab, ((3024-lab.width)//2, (2268-lab.height)//2))
foto = foto.filter(ImageFilter.GaussianBlur(2.2))
px = foto.load()
for _ in range(400000):
    x,y = random.randrange(3024), random.randrange(2268); px[x,y] = max(0,min(255,px[x,y]+random.randint(-40,40)))
foto.convert("RGB").save(out, quality=82)
print(out, lab.size)
