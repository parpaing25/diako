# -*- coding: utf-8 -*-
"""
ÉTAPE 1 — CHOISIR les affiches d'événements, et fabriquer les planches-contact.

⚠ RIEN N'EST ENVOYÉ NI ÉCRIT ICI. Comme pour les plats, le choix se REGARDE
  avant d'être posé : sur 50 photos de plats retenues par trois filtres
  textuels, 17 étaient fausses et seul l'œil les a vues.
"""
import glob, io, json, os, re, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photos_evenements import SANS_AFFICHE, SUJETS, choisir
from photos_plats import AGENT

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(os.environ.get("TEMP", "."), "diako-evenements")


def cle_anon():
    for f in glob.glob(os.path.join(RACINE, "dist/assets/*.js")):
        t = io.open(f, encoding="utf-8", errors="replace").read()
        m = re.search(r'"(eyJ[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{50,}\.[A-Za-z0-9_\-]{20,})"', t)
        if m:
            return m.group(1)
    raise SystemExit("cle anon introuvable : lance `npm run build` d'abord")


URL = "https://eifrwecaszzqrdwjjjbu.supabase.co"
KEY = cle_anon()

req = urllib.request.Request(
    URL + "/rest/v1/events?select=id,slug,title,poster_url&order=title&limit=200",
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
evts = json.loads(urllib.request.urlopen(req, timeout=60).read())
sans = [e for e in evts if not e.get("poster_url")]
print(f"{len(evts)} evenements, {len(sans)} sans affiche\n")

# ⚠ GARDE-FOU : un titre de la table de sujets qui ne correspond a AUCUN
#   evenement est une faute de frappe silencieuse — on la dit.
titres = {e["title"] for e in evts}
orphelins = [t for t in list(SUJETS) + list(SANS_AFFICHE) if t not in titres]
if orphelins:
    print("⚠ titres inconnus de la base (a corriger) :")
    for t in orphelins:
        print("   ", t)
    print()

oublies = [e["title"] for e in sans
           if e["title"] not in SUJETS and e["title"] not in SANS_AFFICHE]
if oublies:
    print("⚠ evenements que la table ne traite pas du tout :")
    for t in oublies:
        print("   ", t)
    print()

os.makedirs(SORTIE, exist_ok=True)
retenus, vides = [], []
aTraiter = [e for e in sans if e["title"] in SUJETS]
for i, e in enumerate(aTraiter, 1):
    termes, exiges = SUJETS[e["title"]]
    try:
        c = choisir(e["title"], termes, exiges)
    except Exception as ex:
        c = None
        print(f"  {i:3}/{len(aTraiter)} ERREUR {e['title'][:36]} : {str(ex)[:70]}", flush=True)
    if not c:
        vides.append(e["title"])
        print(f"  {i:3}/{len(aTraiter)} — {e['title'][:44]:46} rien de sur", flush=True)
        continue
    c["id"] = e["id"]
    c["slug"] = e.get("slug") or ""
    retenus.append(c)
    print(f"  {i:3}/{len(aTraiter)} OK {e['title'][:42]:44} {c['fichier'][:40]:42} "
          f"{c['dim'][0]}x{c['dim'][1]} {c['licence'][:14]}", flush=True)
    try:
        v = c["url"].replace("/1600px-", "/400px-")
        r = urllib.request.Request(v, headers={"User-Agent": AGENT})
        nom = re.sub(r"[^a-z0-9]+", "-", c["titre"].lower())[:40]
        io.open(os.path.join(SORTIE, nom + ".jpg"), "wb").write(
            urllib.request.urlopen(r, timeout=90).read())
        c["vignette"] = nom + ".jpg"
    except Exception:
        pass
    time.sleep(0.2)

io.open(os.path.join(RACINE, "evenements_retenus.json"), "w", encoding="utf-8").write(
    json.dumps(retenus, ensure_ascii=False, indent=1))
print(f"\nRETENUS : {len(retenus)} — RIEN DE SUR : {len(vides)}")
print(f"REFUSES D'OFFICE (fetes generiques, evenements recents) : {len(SANS_AFFICHE)}")
print("vignettes :", SORTIE)
if vides:
    print("\nsans resultat :", ", ".join(vides))
