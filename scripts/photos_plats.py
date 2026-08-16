# -*- coding: utf-8 -*-
"""
LES 95 PLATS N'ONT AUCUNE PHOTO — ET L'ATLAS EST UNE PAGE DE VIGNETTES.

Le propriétaire l'a demandé en clair : « sur l'atlas des plats, les photos sont
obligatoires, en couverture et dans les détails ». Aujourd'hui `photo_url` est
nul sur 95 lignes sur 95 : la page affiche 95 rectangles gris.

⚠ LA SOURCE EST WIKIMEDIA COMMONS, PAS UNE RECHERCHE D'IMAGES. Commons donne
  l'auteur et la licence par API, ce qui rend l'attribution POSSIBLE. Une photo
  CC BY-SA affichée sans son auteur n'est pas une photo gratuite, c'est une
  infraction — d'où les trois colonnes de la migration 0096 (`photo_credit`,
  `photo_licence`, `photo_source`). On ne pose rien sans les trois.

🔴 LE PIÈGE DU RAPPROCHEMENT A DÉJÀ COÛTÉ CHER SUR CE PROJET. Rapprocher par
   sous-chaîne avait rangé six îles sous « Nosy Be » parce que « nosy » leur est
   commun. Sur des plats, se tromper est plus grave encore : personne ne repère
   qu'une photo de riz illustre le ravitoto, et le site devient faux sans que
   personne ne le voie. On applique donc trois filtres cumulatifs :

     1. le nom du plat doit apparaître en MOTS ENTIERS dans le titre du fichier
        ou sa description (pas en sous-chaîne : « anana » ne doit pas capter
        « bananas ») ;
     2. le fichier doit être une vraie photo (pas un blason, pas une carte, pas
        un diagramme, pas un portrait) ;
     3. l'auteur ET la licence doivent être connus.

⚠ LES NOMS GÉNÉRIQUES SONT TRAITÉS À PART. « Crabe », « Crevettes », « Huîtres »
  désignent l'ingrédient et non une recette malgache : une photo de crabe est
  une photo de crabe, elle n'affirme rien de faux. Mais « Koba », « Kitoza »,
  « Romazava » désignent une préparation précise : pour ceux-là on exige en plus
  un signal malgache (Madagascar / Malagasy / le nom en malgache), sinon on
  préfère RIEN à une photo plausible. Une case vide est honnête ; une photo
  fausse ne se rattrape jamais.

⚠ AUCUNE ÉCRITURE EN BASE ICI. Le script produit `plats_retenus.json` puis, une
  fois les images envoyées sur o2switch, une migration SQL que le propriétaire
  applique. C'est la règle du projet : le DDL et les écritures de référentiel
  passent par une migration relue, jamais par un script qui parle à la prod.
"""
import io, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

AGENT = "DiakoPhotos/1.0 (https://diako.fonenako.mg ; onjaniaina27@gmail.com)"
COMMONS = "https://commons.wikimedia.org/w/api.php"

ART = {"de", "du", "des", "la", "le", "les", "d", "l", "a", "et", "au", "aux",
       "en", "sy", "ny", "the", "of", "and", "with"}

# ⚠ Ces mots dans un titre de fichier disqualifient d'office : Commons est aussi
#   plein de blasons, de cartes, de portraits et de couvertures de livres.
REBUT = re.compile(
    r"\b(coat[_ ]of[_ ]arms|blason|flag|drapeau|map|carte|logo|seal|stamp|timbre"
    r"|portrait|diagram|chart|graph|svg|icon|banner|poster|book|cover|manuscript"
    r"|signature|plaque|monument|statue|building|church|eglise|cemetery"
    # 🔴 CES MOTS SONT LÀ PARCE QUE LE PREMIER PASSAGE LES A LAISSÉS ENTRER.
    #    « Carpe » avait retenu « Karpa - cmentarz » — un CIMETIÈRE POLONAIS ;
    #    « Crabe » un cimetière italien à Foza (« foza » = crabe en malgache,
    #    Foza = une commune de Vénétie) ; « Moules » un fichier sur des moules
    #    de FONDERIE. Le mot entier ne protège de rien quand la langue change.
    r"|cmentarz|cimitero|cappella|chapel|crafts|artisanat|aluminium|fonderie"
    r"|forge|tomb|tombeau|grave|nekropol)\b",
    re.I)

# ⚠ ET UN FILTRE POSITIF, PARCE QUE LE FILTRE NÉGATIF NE SUFFIRA JAMAIS. On ne
#   peut pas énumérer tout ce qui n'est pas de la nourriture ; on peut exiger
#   qu'un signal de nourriture soit PRÉSENT. C'est ce qui distingue « Calamars,
#   plat pendant la célébration… » — une vraie assiette — de « Cemetery in
#   Karpa », que le seul nom du plat ne séparait pas.
NOURRITURE = re.compile(
    r"\b(food|foods|dish|dishes|cuisine|cooking|cook|meal|plat|plats|assiette"
    r"|recipe|recette|restaurant|gastronom\w*|culinar\w*|farm to plate"
    r"|soup|soupe|drink|beverage|boisson|jus|juice|cocktail|rhum|rum|beer|biere"
    r"|fruit|fruits|vegetable|legume|meat|viande|fish|poisson|riz|rice|bread"
    r"|pain|cake|gateau|dessert|snack|street food|market|marche|grill\w*"
    r"|fried|frit|bouilli|boiled|roast|roti|sauce|epice|spice|pepper|piment"
    r"|mokary|koba|vary|hena|laoka|sakafo)\b",
    re.I)

# Les plats dont le nom EST l'ingrédient : une photo de l'ingrédient suffit et
# n'affirme rien de faux.
GENERIQUES = {
    "crabe", "crevettes", "huitres", "calamar", "camaron", "capitaine", "carpe",
    "espadon", "langouste", "amalona", "bichique", "brochette", "cafe-malgache",
    "eau-de-coco", "anana", "banane-flambee", "cote-de-porc", "filet-de-zebu",
}


def sans_accent(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def mots(s):
    """Les mots significatifs d'un nom, sans accents ni articles."""
    s = re.sub(r"[^a-z0-9 ]+", " ", sans_accent(s).lower())
    return [m for m in s.split() if m not in ART and len(m) > 2]


def contient_mots(texte, besoin):
    """Vrai si TOUS les mots demandés sont présents en mots ENTIERS.

    ⚠ `\\b` et non `in` : c'est toute la différence entre trouver « anana » et
      capter « bananas ». La sous-chaîne est exactement l'erreur qui avait rangé
      six îles sous « Nosy Be »."""
    t = sans_accent(texte or "").lower()
    return all(re.search(r"\b" + re.escape(m) + r"\b", t) for m in besoin)


def http(url, essais=4):
    for i in range(essais):
        try:
            r = urllib.request.Request(url, headers={"User-Agent": AGENT})
            with urllib.request.urlopen(r, timeout=120) as f:
                return f.read()
        except Exception:
            if i == essais - 1:
                raise
            time.sleep(1.5 * (i + 1))


def chercher(terme, n=14):
    """Les fichiers image de Commons pour un terme."""
    u = (COMMONS + "?action=query&format=json&list=search&srnamespace=6"
         + "&srlimit=" + str(n) + "&srsearch=" + urllib.parse.quote(terme))
    try:
        d = json.loads(http(u).decode())
    except Exception:
        return []
    return [x["title"].removeprefix("File:")
            for x in d.get("query", {}).get("search", [])
            if re.search(r"\.(jpe?g|png|webp)$", x["title"], re.I)]


def details(fichiers):
    """Auteur, licence, page d'origine et dimensions, par paquets de 50.

    ⚠ SANS AUTEUR NI LICENCE ON NE POSE RIEN — c'est la règle héritée de 0049 et
      reprise par 0096."""
    infos = {}
    fichiers = list(dict.fromkeys(fichiers))
    for i in range(0, len(fichiers), 50):
        lot = fichiers[i:i + 50]
        u = (COMMONS + "?action=query&format=json&prop=imageinfo"
             + "&iiprop=extmetadata|url|size&iiurlwidth=1600&titles="
             + urllib.parse.quote("|".join("File:" + f for f in lot)))
        try:
            d = json.loads(http(u).decode())
        except Exception:
            continue
        for p in (d.get("query", {}).get("pages") or {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata") or {}

            def v(k):
                t = (meta.get(k) or {}).get("value") or ""
                return re.sub(r"<[^>]+>", " ", t).strip()

            infos[p.get("title", "").removeprefix("File:")] = {
                "auteur": v("Artist") or v("Credit") or None,
                "licence": v("LicenseShortName") or None,
                "description": v("ImageDescription"),
                "categories": v("Categories"),
                "page": ii.get("descriptionurl"),
                "url": ii.get("thumburl") or ii.get("url"),
                "l": ii.get("width") or 0,
                "h": ii.get("height") or 0,
            }
        time.sleep(0.35)
    return infos


def malgache(info, fichier):
    """Un signal qui rattache l'image à Madagascar."""
    tout = " ".join(str(info.get(k) or "") for k in
                    ("description", "categories")) + " " + fichier
    return re.search(r"\b(madagascar|malagasy|malgache|antananarivo|tananarive)\b",
                     sans_accent(tout), re.I) is not None


def choisir(plat):
    """Le meilleur fichier pour un plat, ou None si rien ne mérite d'être posé."""
    nom_mg = (plat.get("name_mg") or "").strip()
    nom_fr = (plat.get("name_fr") or "").strip()
    est_generique = plat["slug"] in GENERIQUES

    # ⚠ ORDRE DÉLIBÉRÉ : le nom malgache d'abord, c'est le plus distinctif.
    #   « Ravitoto » ne désigne qu'une chose ; « Porc au gingembre », mille.
    requetes = []
    if nom_mg:
        requetes.append((nom_mg + " Madagascar", mots(nom_mg)))
        requetes.append((nom_mg, mots(nom_mg)))
    if nom_fr and mots(nom_fr) != mots(nom_mg):
        requetes.append((nom_fr + " Madagascar", mots(nom_fr)))
        if est_generique:
            requetes.append((nom_fr + " food", mots(nom_fr)))

    vus, candidats = set(), []
    for terme, besoin in requetes:
        if not besoin:
            continue
        fichiers = [f for f in chercher(terme) if f not in vus]
        vus.update(fichiers)
        if not fichiers:
            continue
        infos = details(fichiers)
        for f, i in infos.items():
            if REBUT.search(f):
                continue
            if not (i["auteur"] and i["licence"] and i["url"]):
                continue
            if min(i["l"], i["h"]) < 400:
                continue
            texte = f + " " + (i["description"] or "") + " " + (i["categories"] or "")
            # ⚠ LE REBUT PORTE SUR LE TEXTE ENTIER, pas sur le seul nom de
            #   fichier : « Karpa - cmentarz » ne trahissait le cimetière que par
            #   sa description, et c'est elle qui l'a démasqué.
            if REBUT.search(texte):
                continue
            if not contient_mots(texte, besoin):
                continue
            # ⚠ SANS SIGNAL DE NOURRITURE, ON PASSE. Le nom d'un plat malgache
            #   est un toponyme ailleurs dans le monde ; une assiette, non.
            if not NOURRITURE.search(sans_accent(texte)):
                continue
            # ⚠ SANS SIGNAL DE NOURRITURE, ON PASSE. Le nom du plat peut être un
            #   toponyme ailleurs dans le monde ; l'assiette, non.
            if not NOURRITURE.search(sans_accent(texte)):
                continue
            mg = malgache(i, f)
            # Un plat NON générique sans aucun signal malgache est refusé : mieux
            # vaut une case vide qu'une photo plausible et fausse.
            if not est_generique and not mg:
                continue
            score = (2 if mg else 0) + (1 if contient_mots(f, besoin) else 0)
            candidats.append((score, min(i["l"], i["h"]), f, i))
        if candidats:
            break
        time.sleep(0.25)

    if not candidats:
        return None
    candidats.sort(key=lambda x: (-x[0], -x[1]))
    s, _, f, i = candidats[0]
    return {"slug": plat["slug"], "fichier": f, "url": i["url"], "auteur": i["auteur"],
            "licence": i["licence"], "page": i["page"], "score": s,
            "dim": [i["l"], i["h"]], "nom_fr": nom_fr, "nom_mg": nom_mg}
