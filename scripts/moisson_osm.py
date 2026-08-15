"""
MOISSON OPENSTREETMAP — les 23 régions de Madagascar.

⚠ POURQUOI OSM ET PAS UN AUTRE SOURCE. La licence ODbL autorise la réutilisation
  avec attribution ; Google Maps, TripAdvisor et Booking l'interdisent. Le projet
  a déjà tranché cette question (règle du dépôt : « OSM Overpass + Nominatim,
  jamais Google Maps »).

⚠ CE QU'ON PREND : le nom, le type, les COORDONNÉES RÉELLES, le téléphone, le
  site, l'adresse quand ils existent.
⚠ CE QU'ON NE PREND PAS : aucun prix, aucune note, aucun avis. OSM n'en porte
  pas de fiables, et la règle n°1 du projet interdit d'en fabriquer.
"""

import json
import io
import os
import time
import urllib.request
import urllib.error

SORTIE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "osm")
os.makedirs(SORTIE, exist_ok=True)

REGIONS = [
    "Analamanga", "Vakinankaratra", "Itasy", "Bongolava",
    "Haute Matsiatra", "Amoron'i Mania", "Vatovavy", "Fitovinany",
    "Atsimo-Atsinanana", "Ihorombe", "Menabe", "Melaky",
    "Atsimo-Andrefana", "Androy", "Anosy", "Alaotra-Mangoro",
    "Atsinanana", "Analanjirofo", "Boeny", "Sofia", "Betsiboka",
    "Diana", "Sava",
]

# `out center` donne un point même pour un contour : un hôtel cartographié en
# polygone est aussi utile qu'un hôtel cartographié en point.
GABARIT = """[out:json][timeout:180];
area["name"="%s"]["admin_level"="4"]->.a;
(
  nwr(area.a)["tourism"~"^(hotel|guest_house|hostel|chalet|motel|apartment|camp_site)$"]["name"];
  nwr(area.a)["amenity"~"^(restaurant|cafe|fast_food|bar)$"]["name"];
  nwr(area.a)["tourism"~"^(attraction|museum|viewpoint|zoo|artwork|picnic_site)$"]["name"];
  nwr(area.a)["leisure"~"^(nature_reserve|park)$"]["name"];
  nwr(area.a)["boundary"="protected_area"]["name"];
  nwr(area.a)["natural"~"^(beach|cave_entrance|hot_spring|waterfall|peak)$"]["name"];
  nwr(area.a)["historic"]["name"];
);
out center 1200;
"""

MIROIRS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def interroger(region: str) -> dict | None:
    corps = (GABARIT % region.replace('"', '')).encode("utf-8")
    for essai, url in enumerate(MIROIRS * 2):
        try:
            req = urllib.request.Request(
                url, data=corps,
                headers={"User-Agent": "Diako/1.0 (annuaire voyage Madagascar; contact diako.fonenako.mg)"},
            )
            with urllib.request.urlopen(req, timeout=200) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            print(f"    essai {essai + 1} sur {url.split('/')[2]} : {type(e).__name__}", flush=True)
            time.sleep(12)
    return None


total = 0
for i, region in enumerate(REGIONS, 1):
    fichier = os.path.join(SORTIE, region.replace("'", "_").replace(" ", "_") + ".json")
    if os.path.exists(fichier):
        d = json.load(io.open(fichier, encoding="utf-8"))
        n = len(d.get("elements", []))
        total += n
        print(f"[{i:2}/23] {region:20} deja moissonne : {n}", flush=True)
        continue

    print(f"[{i:2}/23] {region:20} interrogation…", flush=True)
    d = interroger(region)
    if d is None:
        print(f"        ECHEC sur {region}", flush=True)
        continue
    n = len(d.get("elements", []))
    total += n
    io.open(fichier, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))
    print(f"        {n} elements", flush=True)
    # Overpass est un service benevole : on ne le martele pas.
    time.sleep(8)

print(f"\nTOTAL BRUT : {total} elements sur {len(REGIONS)} regions", flush=True)
