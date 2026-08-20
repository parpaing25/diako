# -*- coding: utf-8 -*-
"""
LES 42 ÉVÉNEMENTS N'ONT AUCUNE AFFICHE.

`poster_url` est nul sur 42 lignes sur 42, alors que /evenements est une grille
de cartes : le calendrier du pays s'affiche en 42 rectangles gris.

🔴 ICI, UN RAPPROCHEMENT PAR TITRE NE PEUT PAS MARCHER — et c'est la différence
   avec les plats. « Assomption », « Pâques », « Fête du Travail » ne désignent
   rien de malgache sur Commons : une recherche par titre rendrait une basilique
   italienne ou un défilé syndical français, avec un score parfait. Le nom de
   l'événement n'est pas son SUJET.

⚠ ON ÉCRIT DONC LE SUJET À LA MAIN, événement par événement. Ce n'est pas de la
  donnée inventée : on ne fabrique aucune date, aucun lieu, aucun prix. On
  choisit ce qu'on va CHERCHER — « Adansonia grandidieri » pour la floraison des
  baobabs, « Famadihana » pour le retournement des morts — et on vérifie ensuite
  ce qui revient, à l'œil. Le nom scientifique est volontairement préféré au nom
  courant : il est bien plus discriminant sur Commons.

🔴 ET ON N'ILLUSTRE PAS LES FÊTES GÉNÉRIQUES. Noël, Pâques, la Toussaint, la
   Fête du Travail : un sapin ou une procession pris ailleurs dans le monde
   n'apprendrait rien et laisserait croire à une photo prise à Madagascar. Une
   case vide est honnête. Elles sont listées dans SANS_AFFICHE avec leur motif,
   pour qu'un prochain passage ne les repropose pas sans savoir pourquoi.

⚠ L'ATTRIBUTION EST OBLIGATOIRE (migration 0104), comme pour 0049, 0082 et 0096 :
  auteur, licence et page d'origine, ou rien.
"""
import os, re, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photos_plats import REBUT, chercher, contient_mots, details, sans_accent

# ── Ce qu'on cherche, événement par événement ────────────────────────────────
#    (termes de recherche, mots qui DOIVENT apparaître dans le résultat)
SUJETS = {
    "Agrégation de requins-baleines à Nosy Be":
        (["Rhincodon typus Madagascar", "whale shark Nosy Be", "Rhincodon typus"], ["rhincodon"]),
    "Saison des baleines à bosse — côte est":
        (["Megaptera novaeangliae Madagascar", "humpback whale Madagascar"], ["megaptera"]),
    "Festival des Baleines de Sainte-Marie":
        (["humpback whale Sainte Marie Madagascar", "Megaptera novaeangliae Indian Ocean"], ["megaptera", "humpback"]),
    "Floraison des jacarandas d'Antananarivo":
        (["Jacaranda Antananarivo", "Jacaranda mimosifolia Madagascar", "Jacaranda mimosifolia"], ["jacaranda"]),
    "Floraison nocturne des baobabs de Grandidier":
        (["Adansonia grandidieri", "Allee des Baobabs Morondava"], ["adansonia", "baobab"]),
    "Famadihana, le retournement des morts":
        (["Famadihana", "Famadihana Madagascar"], ["famadihana"]),
    "Naissances des lémuriens catta":
        (["Lemur catta Berenty", "Lemur catta Madagascar", "Lemur catta"], ["catta"]),
    "Campagne du litchi":
        (["Litchi chinensis Madagascar", "lychee Madagascar", "Litchi chinensis"], ["litchi", "lychee"]),
    "Campagne de la vanille verte":
        (["Vanilla planifolia Madagascar", "vanilla Sambava", "Vanilla planifolia"], ["vanilla", "vanille"]),
    "Campagne du girofle":
        (["Syzygium aromaticum Madagascar", "clove Madagascar", "Syzygium aromaticum"], ["clove", "girofle", "syzygium"]),
    "Festival Sôrogno – Cacao":
        (["Theobroma cacao Madagascar", "cocoa Ambanja", "Theobroma cacao"], ["cacao", "cocoa", "theobroma"]),
    "Grande moisson du riz (vary be)":
        (["rice harvest Madagascar", "riziere Madagascar", "rice field Madagascar"], ["madagascar"]),
    "Marché aux zébus d'Ambalavao (Tsienimparihy)":
        (["zebu market Ambalavao", "marche aux zebus Madagascar", "zebu Madagascar"], ["zebu"]),
    "Saison du savika (rodéo betsileo)":
        (["Savika Madagascar", "savika betsileo"], ["savika"]),
    "Fitampoha du Menabe":
        (["Fitampoha", "Belo sur Tsiribihina"], ["fitampoha", "tsiribihina"]),
    "Saison de reproduction des oiseaux endémiques":
        (["Masoala bird Madagascar", "endemic bird Madagascar"], ["madagascar"]),
    "Fête de l'Indépendance":
        (["Madagascar independence day", "fete nationale Madagascar"], ["madagascar"]),
    "Festikite Madagascar":
        (["kitesurfing Madagascar", "kitesurf Diego Suarez"], ["madagascar"]),
    "Saison cyclonique du sud-ouest de l'océan Indien":
        (["cyclone Madagascar", "tropical cyclone Madagascar"], ["cyclone"]),
    "Alahamady Be, le Nouvel An malgache":
        (["Ambohimanga Rova", "Alahamady Madagascar"], ["ambohimanga", "alahamady"]),
    "Saison des pluies (été austral)":
        (["rainy season Madagascar", "Madagascar rain landscape"], ["madagascar"]),
    "Saison sèche (hiver austral)":
        (["dry season Madagascar", "Madagascar dry landscape"], ["madagascar"]),
}

# ── Ce qu'on refuse d'illustrer, et pourquoi ─────────────────────────────────
SANS_AFFICHE = {
    "Jour de l'An": "fête générique — une photo prise ailleurs n'apprendrait rien",
    "Noël": "fête générique",
    "Pâques (dimanche et lundi)": "fête générique",
    "Pentecôte (dimanche et lundi)": "fête générique",
    "Ascension": "fête générique",
    "Assomption": "fête générique",
    "Toussaint": "fête générique",
    "Fête du Travail": "fête générique",
    "Fête des Martyrs": "commémoration — aucune image libre fiable et non équivoque",
    "Madajazzcar": "festival récent — rien de libre sur Commons",
    "Angaredona Mozika Festival": "festival récent — rien de libre",
    "Festival Sômarôho": "festival récent — rien de libre",
    "Festival Tsolabe": "festival récent — rien de libre",
    "Makua Festival Music": "festival récent — rien de libre",
    "Madagascar sous les étoiles": "événement récent — rien de libre",
    "FIM — Foire Internationale de Madagascar": "salon — rien de libre",
    "Salon ITM — International Tourism Fair Madagascar": "salon — rien de libre",
    "Trail du Mandray": "course récente — rien de libre",
    "UTOP — Ultra Trail Ô Plateaux": "course récente — rien de libre",
    "Convention annuelle du Toby Ankaramalaza": "rassemblement religieux — rien de libre",
}


def choisir(titre, termes, exiges):
    """Le meilleur fichier pour un événement, ou None si rien ne convient."""
    vus, candidats = set(), []
    for terme in termes:
        fichiers = [f for f in chercher(terme, 16) if f not in vus]
        vus.update(fichiers)
        if not fichiers:
            continue
        for f, i in details(fichiers).items():
            if not (i["auteur"] and i["licence"] and i["url"]):
                continue
            # ⚠ UNE AFFICHE EST UN BANDEAU 16/9. Une image plus haute que large
            #   s'affiche recadrée au point de devenir méconnaissable — un
            #   baobab entier rendu en tranche de tronc.
            if i["l"] < 800 or i["h"] < 500 or i["l"] < i["h"]:
                continue
            texte = f + " " + (i["description"] or "") + " " + (i["categories"] or "")
            if REBUT.search(texte):
                continue
            # Au moins UN des mots exigés — le sujet, pas le titre.
            t = sans_accent(texte).lower()
            if not any(re.search(r"\b" + re.escape(m) + r"\b", t) for m in exiges):
                continue
            mg = re.search(r"\b(madagascar|malagasy|malgache)\b", t) is not None
            candidats.append(((2 if mg else 0) + (1 if contient_mots(f, exiges[:1]) else 0),
                              i["l"] * i["h"], f, i))
        if candidats:
            break
        time.sleep(0.25)

    if not candidats:
        return None
    candidats.sort(key=lambda x: (-x[0], -x[1]))
    s, _, f, i = candidats[0]
    return {"titre": titre, "fichier": f, "url": i["url"], "auteur": i["auteur"],
            "licence": i["licence"], "page": i["page"], "score": s, "dim": [i["l"], i["h"]]}
