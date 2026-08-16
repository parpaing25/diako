# -*- coding: utf-8 -*-
"""
ÉTAPE 1 — CHOISIR. Interroge Commons pour les 95 plats et écrit
`plats_retenus.json` + une planche-contact de vignettes dans le dossier
temporaire, pour que le choix soit VU avant d'être posé.

⚠ RIEN N'EST ENVOYÉ NI ÉCRIT ICI. L'envoi sur o2switch et la migration SQL sont
  l'étape 2 (`lancer_plats_envoi.py`), volontairement séparée : on regarde les
  vignettes d'abord. Une photo fausse sur un plat ne se repère plus jamais une
  fois en ligne.
"""
import glob, io, json, os, re, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photos_plats import AGENT, choisir

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(os.environ.get("TEMP", "."), "diako-plats")


def cle_anon():
    """La clé publique se lit dans le bundle : c'est une clé anon, elle est
    conçue pour être exposée au navigateur. Aucun secret n'est en jeu."""
    for f in glob.glob(os.path.join(RACINE, "dist/assets/*.js")):
        t = io.open(f, encoding="utf-8", errors="replace").read()
        m = re.search(r'"(eyJ[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{50,}\.[A-Za-z0-9_\-]{20,})"', t)
        if m:
            return m.group(1)
    raise SystemExit("cle anon introuvable : lance `npm run build` d'abord")


URL = "https://eifrwecaszzqrdwjjjbu.supabase.co"
KEY = cle_anon()

req = urllib.request.Request(
    URL + "/rest/v1/dishes?select=slug,name_fr,name_mg,photo_url&order=slug&limit=200",
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
plats = json.loads(urllib.request.urlopen(req, timeout=60).read())
# On ne retouche pas ce qui a déjà une photo.
plats = [p for p in plats if not p.get("photo_url")]
print(f"{len(plats)} plats sans photo\n")

os.makedirs(SORTIE, exist_ok=True)
retenus, vides = [], []
for i, p in enumerate(plats, 1):
    try:
        c = choisir(p)
    except Exception as e:
        c = None
        print(f"  {i:3}/{len(plats)} ERREUR {p['slug']} : {str(e)[:80]}", flush=True)
    if not c:
        vides.append(p["slug"])
        print(f"  {i:3}/{len(plats)} — {p['slug'][:28]:30} rien de sûr", flush=True)
        continue
    retenus.append(c)
    print(f"  {i:3}/{len(plats)} ✓ {p['slug'][:28]:30} {c['fichier'][:46]:48} "
          f"score {c['score']} {c['licence'][:16]}", flush=True)
    # La vignette locale, pour pouvoir REGARDER avant de poser.
    try:
        v = c["url"].replace("/1600px-", "/320px-")
        r = urllib.request.Request(v, headers={"User-Agent": AGENT})
        io.open(os.path.join(SORTIE, c["slug"] + ".jpg"), "wb").write(
            urllib.request.urlopen(r, timeout=90).read())
    except Exception:
        pass
    time.sleep(0.2)

io.open(os.path.join(RACINE, "plats_retenus.json"), "w", encoding="utf-8").write(
    json.dumps(retenus, ensure_ascii=False, indent=1))
print(f"\nRETENUS : {len(retenus)} — SANS PHOTO SÛRE : {len(vides)}")
print("vignettes :", SORTIE)
if vides:
    print("\nà couvrir autrement :", ", ".join(vides))
