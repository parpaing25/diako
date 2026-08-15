"""
MOISSON DES LOCALITES — villes, villages, hameaux, quartiers.

⚠ POURQUOI C'EST LE VRAI GISEMENT. Le referentiel compte 178 destinations, dont
  46 villes seulement ont des coordonnees. Madagascar en compte des milliers
  dans OSM. Chaque localite devient une page `/lieu/<slug>` — et surtout, les
  3 158 etablissements importes peuvent alors se rattacher a un village VOISIN
  plutot qu'a une ville a 25 km.

⚠ ON NE PREND QUE CE QUI A UN NOM ET UNE POSITION. Un `place` sans nom est un
  point de reference cartographique, pas une destination.
"""

import json
import io
import os
import time
import urllib.request

SORTIE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "osm_lieux")
os.makedirs(SORTIE, exist_ok=True)

REGIONS = [
    ("Analamanga", "analamanga"), ("Vakinankaratra", "vakinankaratra"),
    ("Itasy", "itasy"), ("Bongolava", "bongolava"),
    ("Matsiatra Ambony", "haute-matsiatra"), ("Amoron'i Mania", "amoron-i-mania"),
    ("Vatovavy", "vatovavy"), ("Fitovinany", "fitovinany"),
    ("Atsimo-Atsinanana", "atsimo-atsinanana"), ("Ihorombe", "ihorombe"),
    ("Menabe", "menabe"), ("Melaky", "melaky"),
    ("Atsimo-Andrefana", "atsimo-andrefana"), ("Androy", "androy"),
    ("Anosy", "anosy"), ("Alaotra-Mangoro", "alaotra-mangoro"),
    ("Atsinanana", "atsinanana"), ("Analanjirofo", "analanjirofo"),
    ("Boeny", "boeny"), ("Sofia", "sofia"), ("Betsiboka", "betsiboka"),
    ("Diana", "diana"), ("Sava", "sava"),
]

# ⚠ `isolated_dwelling` et `locality` sont EXCLUS : une ferme isolee ou un
#   toponyme sans habitants ne sont pas des destinations, et les inclure
#   noierait les vraies dans un bruit qu'aucun voyageur ne cherche.
GABARIT = """[out:json][timeout:240];
area["name"="%s"]["admin_level"="4"]->.a;
(
  node(area.a)["place"~"^(city|town|village|hamlet|suburb|quarter)$"]["name"];
);
out 6000;
"""

MIROIRS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]


def interroger(region: str):
    corps = (GABARIT % region).encode("utf-8")
    for essai, url in enumerate(MIROIRS * 3):
        try:
            req = urllib.request.Request(
                url, data=corps,
                headers={"User-Agent": "Diako/1.0 (annuaire voyage Madagascar; diako.fonenako.mg)"},
            )
            with urllib.request.urlopen(req, timeout=260) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            print(f"    essai {essai + 1} ({url.split('/')[2]}) : {type(e).__name__}", flush=True)
            time.sleep(15)
    return None


total = 0
for i, (osm_nom, slug_region) in enumerate(REGIONS, 1):
    f = os.path.join(SORTIE, slug_region + ".json")
    if os.path.exists(f):
        n = len(json.load(io.open(f, encoding="utf-8")).get("elements", []))
        total += n
        print(f"[{i:2}/23] {slug_region:20} deja : {n}", flush=True)
        continue

    print(f"[{i:2}/23] {slug_region:20} …", flush=True)
    d = interroger(osm_nom)
    if d is None:
        print(f"        ECHEC {osm_nom}", flush=True)
        continue
    n = len(d.get("elements", []))
    total += n
    io.open(f, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))
    print(f"        {n} localites", flush=True)
    time.sleep(6)

print(f"\nTOTAL : {total} localites", flush=True)
