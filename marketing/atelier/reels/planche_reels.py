# -*- coding: utf-8 -*-
"""planche_reels.py — une image par plan de chaque reel (au milieu du plan), pour relire
le rendu à l'œil sans ouvrir 15 vidéos.

    python marketing/atelier/reels/planche_reels.py planche.jpg r-isalo r-andasibe ...
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
ICI = Path(__file__).resolve().parent
W, H = 150, 267
dest, cles = Path(sys.argv[1]), sys.argv[2:]
lignes = []
for cle in cles:
    f = ICI / "sortie" / cle / f"{cle}-musique.mp4"
    total = json.loads((ICI / "sortie" / cle / "fiche.json").read_text(encoding="utf-8"))["duree_s"]
    temps, t = [], 1.4
    while t < total - 0.5:
        temps.append(t)
        t += 2.6
    temps.append(total - 0.8)
    ims = []
    with tempfile.TemporaryDirectory() as td:
        for k, t in enumerate(temps):
            p = Path(td) / f"{k}.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(f), "-frames:v", "1",
                            "-vf", f"scale={W}:{H}", str(p)], check=True)
            ims.append(Image.open(p).convert("RGB"))
    lignes.append((cle, ims))
larg = max(len(i) for _, i in lignes) * (W + 4)
P = Image.new("RGB", (larg, len(lignes) * (H + 18)), "white")
d = ImageDraw.Draw(P)
for r, (cle, ims) in enumerate(lignes):
    d.text((2, r * (H + 18) + 2), cle, fill="black")
    for k, im in enumerate(ims):
        P.paste(im, (k * (W + 4), r * (H + 18) + 16))
P.save(dest, quality=74)
print(P.size, dest.stat().st_size // 1024, "Ko")
