# -*- coding: utf-8 -*-
"""Télécharge chaque image de Commons, la ramène à 1600 px, l'envoie sur
o2switch et écrit l'ordre SQL. L'attribution voyage avec l'image."""
import io, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photos_archives import preparer, envoyer
from photos_wikidata import AGENT
from PIL import Image

r = json.loads(io.open("wikidata_retenus.json", encoding="utf-8").read())
faits, rates = [], []
for i, x in enumerate(r, 1):
    try:
        req = urllib.request.Request(x["url"], headers={"User-Agent": AGENT})
        brut = urllib.request.urlopen(req, timeout=180).read()
        tmp = os.path.join(os.environ.get("TEMP", "."), "wd_tmp.jpg")
        with Image.open(io.BytesIO(brut)) as im:
            im.convert("RGB").save(tmp, "JPEG", quality=92)
        oct_, dim = preparer(tmp)
        rep = envoyer(oct_, f"wikidata/{x['table']}/{x['slug']}.jpg")
        faits.append({**{k: x[k] for k in ("table", "slug", "auteur", "licence", "page")},
                      "url": rep["url"]})
        print(f"  {i:3}/{len(r)} {x['table'][:4]:4} {x['slug'][:32]:34} {dim[0]}x{dim[1]} "
              f"{len(oct_)//1024:4} Ko  {str(x['licence'])[:14]}", flush=True)
    except Exception as e:
        rates.append((x["slug"], str(e)[:110]))
        print(f"  {i:3}/{len(r)} ECHEC {x['slug']} : {str(e)[:110]}", flush=True)
    time.sleep(0.5)
io.open("wikidata_envoyees.json", "w", encoding="utf-8").write(json.dumps(faits, ensure_ascii=False))
print(f"\nTERMINE : {len(faits)} envoyees, {len(rates)} en echec")
for s, m in rates: print("   ", s, "—", m)
