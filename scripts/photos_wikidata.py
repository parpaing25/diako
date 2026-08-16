# -*- coding: utf-8 -*-
"""
LES PHOTOS QUE WIKIDATA A DÉJÀ, ET QUE NOUS N'AVONS PAS.

2267 sites publiés sur 2476 n'ont aucune image. L'archive personnelle est
épuisée (46 couvertures posées, 902 photos passées en revue). Il reste une
source légitime et massive : les éléments Wikidata situés à Madagascar qui
portent une propriété P18 « image », c'est-à-dire un fichier de Wikimedia
Commons.

⚠ CE QUE ÇA IMPOSE : L'ATTRIBUTION. Commons héberge du CC BY, du CC BY-SA et
  du domaine public. Les deux premiers EXIGENT de nommer l'auteur ET la
  licence : sans les trois champs de 0049 (cover_credit, cover_licence,
  cover_source) une photo n'est pas « gratuite », elle est en infraction. On ne
  pose donc rien tant que l'API de Commons n'a pas rendu l'auteur et la licence.

🔴 LE PIÈGE DU RAPPROCHEMENT, DÉJÀ PAYÉ UNE FOIS. Rapprocher par sous-chaîne a
   rangé six îles sous « Nosy Be » parce que « nosy » leur est commun. Ici le
   risque est le même en pire : Wikidata contient des milliers d'entités
   malgaches homonymes. On n'accepte donc QU'UNE ÉGALITÉ STRICTE des mots
   significatifs, et on refuse tout nom qui correspondrait à plusieurs sites de
   notre base — un doublon rendrait le choix arbitraire.

⚠ ET LE NOM SEUL NE SUFFIT PAS : on vérifie que les coordonnées de Wikidata
  tombent à moins de 25 km de celles du site. « Ambohimanga » désigne une
  colline royale près d'Antananarivo et une bonne dizaine de villages ailleurs ;
  le nom est identique, le lieu non.
"""
import io, json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request

AGENT = "DiakoPhotos/1.0 (https://diako.fonenako.mg ; onjaniaina27@gmail.com)"
SPARQL = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"
ART = {"de", "du", "des", "la", "le", "les", "d", "l", "i", "ny", "a", "et",
       "the", "of", "en", "au", "aux"}
RAYON_MAX_KM = 25


def jeu(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()
    return frozenset(m for m in s.split() if m not in ART and len(m) > 1)


def km(a, b, c, d):
    """Distance approximative, largement suffisante pour un garde-fou à 25 km."""
    if None in (a, b, c, d):
        return 1e9
    return math.hypot((a - c) * 111.0, (b - d) * 111.0 * math.cos(math.radians(a)))


def http(url, entetes=None, essais=4):
    for i in range(essais):
        try:
            r = urllib.request.Request(url, headers={"User-Agent": AGENT, **(entetes or {})})
            with urllib.request.urlopen(r, timeout=180) as f:
                return f.read()
        except Exception as e:
            if i == essais - 1:
                raise
            # ⚠ Wikidata limite le débit et répond 429 : on attend franchement,
            #   sinon on se fait bannir pour l'heure et la moisson s'arrête.
            time.sleep(5 * (i + 1))


def moissonner():
    """Tout ce qui est à Madagascar (P17 = Q1019) et porte une image."""
    q = """
    SELECT ?item ?nomFr ?nomEn ?img ?coord WHERE {
      ?item wdt:P17 wd:Q1019 ; wdt:P18 ?img .
      OPTIONAL { ?item wdt:P625 ?coord }
      OPTIONAL { ?item rdfs:label ?nomFr FILTER(lang(?nomFr) = "fr") }
      OPTIONAL { ?item rdfs:label ?nomEn FILTER(lang(?nomEn) = "en") }
    }
    """
    u = SPARQL + "?format=json&query=" + urllib.parse.quote(q)
    d = json.loads(http(u, {"Accept": "application/sparql-results+json"}).decode())
    out = []
    for b in d["results"]["bindings"]:
        lat = lng = None
        if "coord" in b:
            m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", b["coord"]["value"])
            if m:
                lng, lat = float(m.group(1)), float(m.group(2))
        for c in ("nomFr", "nomEn"):
            if c in b:
                out.append({"q": b["item"]["value"].rsplit("/", 1)[1],
                            "nom": b[c]["value"], "img": b["img"]["value"],
                            "lat": lat, "lng": lng})
    return out


def credit(fichiers):
    """Auteur + licence + page d'origine, par paquets de 50 (limite de l'API).

    ⚠ SANS CES TROIS CHAMPS ON NE POSE RIEN. Une photo CC BY-SA affichée sans
      son auteur n'est pas une photo gratuite, c'est une violation."""
    infos = {}
    fichiers = list(fichiers)
    for i in range(0, len(fichiers), 50):
        lot = fichiers[i:i + 50]
        u = (COMMONS + "?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url"
             + "&titles=" + urllib.parse.quote("|".join("File:" + f for f in lot)))
        d = json.loads(http(u).decode())
        for p in (d.get("query", {}).get("pages") or {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata") or {}

            def v(k):
                t = (meta.get(k) or {}).get("value") or ""
                return re.sub(r"<[^>]+>", "", t).strip()

            infos[p.get("title", "").removeprefix("File:")] = {
                "auteur": v("Artist") or v("Credit") or None,
                "licence": v("LicenseShortName") or None,
                "page": ii.get("descriptionurl"),
                "url": ii.get("url"),
            }
        time.sleep(0.4)
    return infos
