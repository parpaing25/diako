# -*- coding: utf-8 -*-
"""planche2.py — planche de relecture des images RENDUES de la série 2 (sortie2/),
une publication par rangée, assez grande pour lire les textes.

    python marketing/atelier/planche2.py planche.jpg zombitse ibonia [--largeur 250]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
ICI = Path(__file__).resolve().parent
a = sys.argv[1:]
W = int(a[a.index("--largeur") + 1]) if "--largeur" in a else 250
if "--largeur" in a:
    i = a.index("--largeur"); del a[i:i + 2]
sortie, cles = Path(a[0]), a[1:]
H, G = int(W * 1.25), 6
dossiers = [d for c in cles for d in sorted((ICI / "sortie2").glob(f"*-{c}")) if d.name[11:] == c]
try:
    f = ImageFont.truetype("arial.ttf", 14)
except Exception:
    f = ImageFont.load_default()
sheet = Image.new("RGB", (5 * (W + G), len(dossiers) * (H + 20)), "white")
d = ImageDraw.Draw(sheet)
for r, dos in enumerate(dossiers):
    ims = [dos / "affiche-fil.png"] + sorted(dos.glob("fil-*.png"))
    d.text((2, r * (H + 20) + 2), dos.name, fill="black", font=f)
    for j, im in enumerate(ims):
        sheet.paste(Image.open(im).convert("RGB").resize((W, H)), (j * (W + G), r * (H + 20) + 18))
sheet.save(sortie, quality=78)
print(sheet.size, sortie.stat().st_size // 1024, "Ko")
