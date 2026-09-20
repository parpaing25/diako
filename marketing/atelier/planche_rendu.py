# -*- coding: utf-8 -*-
"""Planche des images RENDUES (ce qui partira), deux publications par rangée."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.stdout.reconfigure(encoding="utf-8")
cles = sys.argv[2:]
sortie = Path(sys.argv[1])
dossiers = [d for c in cles for d in sorted(Path("sortie").glob(f"*-{c}")) if d.name[11:] == c]
W, H, G = 118, 148, 4
try: f = ImageFont.truetype("arial.ttf", 12)
except Exception: f = ImageFont.load_default()
lignes = [dossiers[i:i + 2] for i in range(0, len(dossiers), 2)]
sheet = Image.new("RGB", (2 * 5 * (W + G) + 16, len(lignes) * (H + 18)), "white")
d = ImageDraw.Draw(sheet)
for r, paire in enumerate(lignes):
    for k, dos in enumerate(paire):
        ims = [dos / "affiche-fil.png"] + sorted(dos.glob("fil-*.png"))
        x0 = k * (5 * (W + G) + 16)
        d.text((x0, r * (H + 18)), dos.name[11:], fill="black", font=f)
        for j, im in enumerate(ims):
            sheet.paste(Image.open(im).convert("RGB").resize((W, H)), (x0 + j * (W + G), r * (H + 18) + 16))
sheet.save(sortie, quality=80)
print(sheet.size, sortie.stat().st_size // 1024, "Ko")
