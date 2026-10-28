# -*- coding: utf-8 -*-
"""editeur_du_jour.py — le fournisseur Di'ako de l'« éditeur du jour ».

Contrat : `marketing/editeur/CONTRAT.md` du dépôt Fonenako (28/10/2026). L'éditeur appelle ce
script une fois par créneau, au plus 30 h avant la sortie. Ici on FABRIQUE seulement : aucune
écriture chez Meta, aucune écriture en base, aucun message. Lecture seule de Supabase (REST,
clé anon publique relue dans le client du site, colonnes énumérées) et de Wikimedia Commons.

    python marketing/atelier/editeur_du_jour.py fabriquer --jour 2026-11-04 --heure 18:00 \\
        --nature album --sortie <dossier vide> --deja <registre.json> \\
        [--maintenant 2026-11-03T13:40] [--sans-rendu]
    python marketing/atelier/editeur_du_jour.py controler --texte-fichier <texte.txt> --quand 2026-11-04T18:00
    python marketing/atelier/editeur_du_jour.py planche --sortie <dossier>     # photos candidates, à l'œil

Créneaux (mesure de la page sur 180 jours : vidéo moyenne 192, carrousel médiane 19 ;
meilleures heures 18 h, 00 h, 20 h ; 12 h est faible) :
  00:00  photo | album   événement du mois (events), plat (dishes), site (attractions), en rotation
  18:00  album           une ville (série 3, jamais publiée, chiffres relus EN DIRECT) ou un lieu
                         (places), en alternance ; repli : un site en album
  20:00  reel            un lieu de la série 1 (photos choisies à l'œil) ou une région, en rotation ;
                         repli : des plats, puis une région qui puise plus loin dans la réserve des
                         posts (9:16, musique seule, monté par reels/reel.py)
Une nature dont le vivier est vide passe la main à la suivante ; si toutes sont vides : code 2.
Une région déjà montrée la veille, le jour même ou le lendemain passe après les autres (`region`
est écrite dans chaque fiche pour cela).

Codes : 0 fabriqué ET contrôlé · 2 rien de juste pour ce créneau · 1 refus d'une garde ou erreur
(raison sur la sortie d'erreur). `controler` : 0 juste · 3 FAUX · 4 je ne sais pas.

🔴 Fraîcheur. Tout chiffre (hôtels, restaurants, noms de lieux) est compté EN DIRECT dans la base
  au moment de la fabrication, sur les fiches PUBLIÉES (`is_published`), jamais recopié de
  chiffres3.json ni du miroir local. Un événement n'est proposé que si le mois de SORTIE est dans
  son `mois[]`, qu'il n'est pas passé, et sa période est citée telle que la base la donne :
  aucune date n'est inventée (`starts_on` est presque toujours vide).
🔴 Une photo = un seul contenu. Une publication photo/album n'emploie jamais une photo des séries
  1, 2, 3, des reels ou d'une publication précédente de l'éditeur (fiches voisines de --sortie) ;
  `verifier.py` la contrôle à nouveau en sous-processus (il lit sys.argv à l'import : ne JAMAIS
  l'importer). Un reel peut reprendre une photo des séries de septembre et octobre, comme les
  15 reels l'ont fait (au moins 7 jours après la publication), jamais celle d'un autre reel ni
  d'une publication de l'éditeur.
🔴 Malgache : seulement les gabarits fixes de GABARITS_MG (relecture : editeur-mg-a-relire.md) et
  les lignes de la série 3 (serie3.json, A-RELIRE-malgache-serie3.md). Aucun mot n'est fabriqué.
⚠ Textes de la base : les phrases qui portent une note de travail (⚠, « source », « à présenter »,
  « confiance »), une phrase tronquée ou, pour les événements, un CHIFFRE sont écartées : une
  fiche « Campagne du girofle » portait 90 % et 18 000 producteurs que sa source ne dit pas.
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
DEPOT = ICI.parent.parent
sys.path.insert(0, str(ICI))
sys.path.append(str(ICI / "reels"))     # reels/reel.py, importé seulement pour monter un reel
import fabriquer as f1   # noqa: E402  — couleurs, typo, crédits, logo
import fabriquer2 as f2  # noqa: E402  — affiche photo / typographique, carte de texte, photo suivante
import fabriquer3 as f3  # noqa: E402  — affiche « mot », cartes sens / noms / chiffres, remplir()
import chiffres3 as c3   # noqa: E402  — VILLES, MOTIFS (sys.argv n'est lu que dans son main)
import commons           # noqa: E402  — api(), infos(), UA (sys.argv n'est lu que sous __main__)

PAGE = "diako"
TZ = timezone(timedelta(hours=3))                    # Madagascar
SITE = "https://diako.fonenako.mg"
URL = "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1"
CACHE = ICI / "editeur-cache"                         # métadonnées Commons et photos HD (hors git)
MINI_POST, MINI_REEL = 1600, 1600                     # plus grand côté de l'original, en px
ICONES = {"📍", "🧭", "📖", "📅", "🎭", "🍲", "🎶", "📜", "🙏"}   # celles qu'attend verifier.py
TEL = re.compile(r"(?<!\d)(?:\+?261[\s.]?|0)3[2-9](?:[\s.]?\d){7}(?!\d)")
MAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
HORS_ALPHABET = re.compile(r"[cquwxç]", re.I)

# ───────────────────────── gabarits malgaches (relecture : editeur-mg-a-relire.md) ─────────────────────────
# Écrits UNE fois. Seules les données entre accolades s'y insèrent (noms propres).
GABARITS_MG = {
    "mg-titre-evenement": ("Amin'ity volana ity", "En ce mois-ci"),
    "mg-titre-plat": ("Sakafo malagasy matsiro", "Un plat malgache savoureux"),
    "mg-titre-boisson": ("Zava-pisotro malagasy", "Une boisson malgache"),
    "mg-titre-site": ("Toerana tsara ho tsidihina", "Un bel endroit à visiter"),
    "mg-titre-lieu": ("Andao ho any {nom}", "Allons à {nom}"),
    "mg-titre-reel": ("Madagasikara tsara tarehy", "Madagascar, la belle"),
    "mg-q-evenement": ("Efa nahafantatra izany ve ianao ?", "Le saviez-vous déjà ?"),
    "mg-q-plat": ("Efa nanandrana {nom} ve ianao ?", "Avez-vous déjà goûté le {nom} ?"),
    "mg-q-plat-generique": ("Efa nanandrana izany ve ianao ?", "Avez-vous déjà goûté cela ?"),
    "mg-q-site": ("Efa nandeha tany {nom} ve ianao ?", "Êtes-vous déjà allé à {nom} ?"),
    "mg-q-lieu": ("Efa tonga tany {nom} ve ianao ?", "Êtes-vous déjà venu jusqu'à {nom} ?"),
    "mg-q-reel-lieu": ("Efa nandeha tany {nom} ve ianao ?", "Êtes-vous déjà allé à {nom} ?"),
    "mg-q-reel-region": ("Efa nitsidika ny faritra {nom} ve ianao ?", "Avez-vous déjà visité la région {nom} ?"),
    "mg-q-reel-plats": ("Iza amin'ireo no tianao indrindra ?", "Lequel préférez-vous ?"),
}

# Photos regardées et écartées : `planche` du 28/10/2026, 201 photos candidates vues une à une.
# Clé = cle_photo(source), valeur = raison. Une photo écartée ne sort ni en post ni en reel.
PHOTOS_ECARTEES: dict[str, str] = {
    "premier_train_à_la_gare_de_vohidiala_depuis_10_ans,_lac_alaotra,_madagascar_(25883940980).jpg":
        "foule, visages en gros plan",
    "berenty_001.jpg": "porte d'entrée, pas la réserve",
    "nosy_ve_island.jpg": "broussailles, l'île ne se voit pas",
    "zombitse_entree.jpg": "panneau d'entrée",
    "ikopa_river_with_pirogues_antananarivo_madagascar.jpg": "photo ancienne (XIXe siècle)",
    "fisherman_in_mahajanga_(amborovy).jpg": "une personne en sujet principal",
    "andranofasika_market,_january_2010,_madagascar_(4466561827).jpg": "foule et enfant au marché",
    "вулканическое_поле_амбре-бобаомби_(мадагаскар).jpg": "vue satellite",
    "nosy-be_dzamandzar_0013.jpg": "une personne en sujet principal",
    "antagnavo_01.jpg": "ne montre pas le lac",
    "entrée_du_parc_national_montagne_d'ambre.jpg": "panneau d'entrée",
    "eutriorchisasturkeulemans.jpg": "dessin d'oiseau, pas une photo du lieu",
    "festin_pour_les_religieuses_du_fifohazana.jpg": "foule en sujet principal",
    "anon-madagascar_-_antongona.jpg": "peinture, pas une photo",
    "mru-nbo_25.08.2009_09-39-16.jpg": "nuages vus d'avion, pas la rivière",
    "bonbon_coco.jpg": "ne montre pas des bonbons coco",
    "anana_(légume_enrichissant_de_madagascar).jpg": "une personne en sujet principal",
    "meat_stall_in_antanavario.jpg": "étal de boucherie, pas du kitoza",
    "litchi_chinensis_'brewster'_kz01.jpg": "arbre en fleur, pas la récolte",
    "famadihana.jpg": "visages pendant un rite",
}

# Les sujets de la série 2 (septembre-octobre) : un événement qui en reprend un n'est pas reproposé.
SUJETS_SERIE2 = {"requins", "baleines", "ibonia", "zombitse", "romazava", "rapeto", "tsimbazaza", "jacarandas",
                 "darafify", "peyrieras", "valiha", "madajazzcar", "babakoto", "sorabe", "girofle", "makua"}
PLATS_SERIE2 = {"romazava", "mofo-gasy"}
NOMS_ANGLAIS = re.compile(r"(?i)\b(national park|falls|lake|forest|beach|reserve|island|bay|river|mountain|park|garden)\b")
TITRE_PAS_UNE_PHOTO = re.compile(
    r"(?i)(\bmap\b|\bcarte\b|locator|location|logo|\bflag\b|drapeau|blason|coat[_ ]of[_ ]arms|satellite|\bnasa\b|"
    r"\biss\d|diagram|sch[ée]ma|\.svg$|\.png$|\.gif$|\.tiff?$|panneau|\bsign\b|stamp|timbre|billet|banknote)")

TYPE_SITE = {"sommet": "sommet", "site": "site", "plage": "plage", "patrimoine": "site patrimonial", "reserve": "réserve",
             "parc": "parc", "point_de_vue": "point de vue", "grotte": "grotte", "musee": "musée",
             "parc_animalier": "parc animalier", "oeuvre": "œuvre", "cascade": "cascade", "source": "source",
             "aire": "aire protégée"}
TYPE_LIEU = {"ville": "ville", "village": "village", "quartier": "quartier", "hameau": "hameau", "parc": "parc",
             "region": "région", "site": "site", "ile": "île", "plage": "plage", "zone_touristique": "zone touristique",
             "commune": "commune"}
EMOJI_SITE = {"plage": "🏖️", "cascade": "💧", "reserve": "🌿", "parc": "🌿", "sommet": "⛰️", "grotte": "🕳️",
              "patrimoine": "🏛️", "musee": "🏛️", "point_de_vue": "👀", "parc_animalier": "🐒", "ile": "🏝️",
              "village": "🏡", "ville": "🏙️", "zone_touristique": "🧭", "commune": "🏡"}
EMOJI_EVT = {"nature": "🌿", "recolte": "🌾", "festival": "🎉", "culturel": "🎭", "culture": "🎭", "religieux": "🕯️",
             "sport": "🏃"}
FAMILLE_PLAT = {"laoka": "Un laoka : ce que l'on mange avec le riz.", "riz": "Un plat de riz.",
                "dessert": "Un dessert.", "boisson": "Une boisson.", "soupe": "Une soupe.",
                "grillade": "Une grillade.", "fruit-de-mer": "Un plat de la mer.",
                "mofo": "Un mofo : les beignets et galettes de la rue malgache."}
MOIS_FR = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
           "novembre", "décembre"]
MOIS_NUM = {m: i for i, m in enumerate(MOIS_FR) if m} | {"fevrier": 2, "aout": 8, "decembre": 12}

# Les descriptions de plats de la base sont écrites SANS accents (« grillee », « a la ») : on rétablit
# seulement les mots sans ambiguïté dans ce contexte culinaire.
ACCENTS = {
    "caramelisee": "caramélisée", "grillee": "grillée", "grillees": "grillées", "grille": "grillé",
    "fraiche": "fraîche", "pate": "pâte", "sucree": "sucrée", "cacahuetes": "cacahuètes", "fete": "fête",
    "cotes": "côtes", "cote": "côte", "cotiere": "côtière", "relevees": "relevées", "relevee": "relevée",
    "releve": "relevé", "sautees": "sautées", "saute": "sauté", "legumes": "légumes", "legume": "légume",
    "repandu": "répandu", "ecrasee": "écrasée", "dejeuner": "déjeuner", "macere": "macéré", "epices": "épices",
    "oeufs": "œufs", "bredes": "brèdes", "brede": "brède", "zebu": "zébu", "legerement": "légèrement",
    "puree": "purée", "huitres": "huîtres", "entree": "entrée", "passe": "passé", "tres": "très",
    "mange": "mangé", "foret": "forêt", "mijote": "mijoté", "mijotes": "mijotés", "mijotee": "mijotée",
    "mijotees": "mijotées", "specialite": "spécialité", "lanieres": "lanières", "sechees": "séchées",
    "fumees": "fumées", "fumee": "fumée", "effiloche": "effiloché", "rissole": "rissolé", "marines": "marinés",
    "cuisine": "cuisiné", "creme": "crème", "biere": "bière", "cafe": "café", "riviere": "rivière",
    "rivieres": "rivières", "riziere": "rizière", "piece": "pièce", "doree": "dorée", "flambee": "flambée",
    "poelee": "poêlée", "rapee": "râpée", "rape": "râpé", "pilees": "pilées", "pimente": "pimenté",
    "parfume": "parfumé", "fermente": "fermenté", "distille": "distillé", "acidule": "acidulé",
    "geante": "géante", "epais": "épais", "elevage": "élevage", "ecrevisse": "écrevisse", "heritage": "héritage",
    "completement": "complètement", "concentre": "concentré", "pave": "pavé", "croute": "croûte",
    "gateau": "gâteau", "mariniere": "marinière", "meuniere": "meunière", "reduise": "réduise",
    # résumés de lieux écrits sans accents (« son marche et son port », « douze especes de lemuriens »)
    "marche": "marché", "especes": "espèces", "espece": "espèce", "lemuriens": "lémuriens", "lemurien": "lémurien",
    "ile": "île", "iles": "îles", "ilots": "îlots", "ilot": "îlot", "celebre": "célèbre", "deserte": "déserte",
    "desertes": "désertes", "eglise": "église", "cathedrale": "cathédrale", "peche": "pêche",
    "pecheurs": "pêcheurs", "protegee": "protégée", "protegees": "protégées", "hotel": "hôtel",
    "hotels": "hôtels", "theatre": "théâtre", "etape": "étape", "premiere": "première", "region": "région",
    "reserve": "réserve", "decouvrir": "découvrir", "ete": "été", "pres": "près", "ecole": "école",
    "village": "village", "colline": "colline", "cratere": "cratère", "crateres": "cratères",
    "riziculture": "riziculture", "cuvette": "cuvette", "rizicole": "rizicole", "cernee": "cernée",
    "foret-galerie": "forêt-galerie",
}


class Refus(Exception):
    """Une garde a refusé, ou une erreur empêche de fabriquer juste : code 1."""


class Rien(Exception):
    """Aucun contenu juste pour ce créneau (vivier vide) : code 2."""


def maintenant_reel() -> datetime:
    return datetime.now(TZ).replace(microsecond=0)


LU_LE = maintenant_reel()


def horodatage() -> str:
    return datetime.now(TZ).strftime("%d/%m/%Y à %H:%M")


# ───────────────────────── lecture de la base (REST anon, lecture seule) ─────────────────────────

@functools.lru_cache(maxsize=1)
def cle_anon() -> str:
    """La clé anon est publique (elle est dans le bundle du site) : on la relit dans le client,
    comme collecter_lieux.py, au lieu de la recopier."""
    src = (DEPOT / "src" / "integrations" / "supabase" / "client.ts").read_text(encoding="utf-8")
    m = re.search(r'"(eyJ[A-Za-z0-9._-]+)"', src)
    if not m:
        raise Refus("clé anon introuvable dans src/integrations/supabase/client.ts")
    return m.group(1)


def _requete(table: str, params: dict, entetes: dict):
    q = urllib.parse.urlencode(params, safe="(),.*:{}")
    h = {"apikey": cle_anon(), "Authorization": f"Bearer {cle_anon()}", **entetes}
    for essai in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(f"{URL}/{table}?{q}", headers=h), timeout=60)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and essai < 2:
                time.sleep(3 + 4 * essai)
                continue
            raise Refus(f"lecture {table} : HTTP {e.code} {e.read()[:200]!r}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if essai < 2:
                time.sleep(3 + 4 * essai)
                continue
            raise Refus(f"lecture {table} impossible : {e}") from None
    raise Refus(f"lecture {table} impossible")


def rest(table: str, params: dict) -> list[dict]:
    out, debut = [], 0
    while True:
        lot = json.load(_requete(table, params, {"Range": f"{debut}-{debut + 999}"}))
        out += lot
        if len(lot) < 1000:
            return out
        debut += 1000


def compte(table: str, params: dict) -> int:
    r = _requete(table, {**params, "select": "id", "limit": "1"}, {"Prefer": "count=exact", "Range": "0-0"})
    cr = r.headers.get("Content-Range") or ""
    try:
        return int(cr.split("/")[1])
    except (IndexError, ValueError):
        raise Refus(f"compte {table} illisible : {cr!r}") from None


def liste_in(ids) -> str:
    return "in.(" + ",".join(ids) + ")"


COLS_EV = ("id,slug,title,kind,periode,mois,starts_on,ends_on,recurrent,yearly,place_id,lieu_libre,summary,"
           "poster_licence,poster_source,confiance,source")
COLS_PLAT = ("id,slug,name_fr,name_mg,family,description,photo_licence,photo_source,nb_restaurants,"
             "typical_place_id,is_vegetarian")
COLS_SITE = "id,slug,name,kind,summary,description,cover_licence,cover_source,best_months,guide_required,fady,place_id,source"
COLS_LIEU = "id,slug,name_fr,kind,region,summary,cover_licence,cover_source,merged_into,nb_pages,parent_id"


@functools.lru_cache(maxsize=1)
def evenements() -> tuple:
    return tuple(rest("events", {"select": COLS_EV, "is_published": "eq.true", "order": "slug"}))


@functools.lru_cache(maxsize=1)
def plats() -> tuple:
    return tuple(rest("dishes", {"select": COLS_PLAT, "order": "slug"}))


@functools.lru_cache(maxsize=1)
def sites_couverts() -> tuple:
    return tuple(rest("attractions", {"select": COLS_SITE, "is_published": "eq.true",
                                      "cover_source": "not.is.null", "order": "slug"}))


@functools.lru_cache(maxsize=1)
def lieux_couverts() -> tuple:
    return tuple(rest("places", {"select": COLS_LIEU, "merged_into": "is.null", "cover_source": "not.is.null",
                                 "order": "slug"}))


_LIEUX: dict[str, dict] = {}


def lieux_par_id(ids) -> dict[str, dict]:
    manquants = sorted({i for i in ids if i and i not in _LIEUX})
    for k in range(0, len(manquants), 80):
        for r in rest("places", {"select": COLS_LIEU, "id": liste_in(manquants[k:k + 80])}):
            _LIEUX[r["id"]] = r
    return {i: _LIEUX[i] for i in ids if i in _LIEUX}


def lieux_par_slug(slugs) -> list[dict]:
    return rest("places", {"select": COLS_LIEU, "slug": liste_in(slugs)})


@functools.lru_cache(maxsize=256)
def etablissements(ids: tuple) -> tuple[int, int, int]:
    """(hôtels, restaurants, fiches) PUBLIÉS rattachés à ces lieux ou à leurs quartiers."""
    tous = list(ids)
    for r in rest("places", {"select": "id", "parent_id": liste_in(ids), "merged_into": "is.null"}):
        tous.append(r["id"])
    lst = liste_in(sorted(set(tous)))
    h = compte("pages", {"place_id": lst, "is_published": "eq.true", "categories": "cs.{hotel}"})
    r = compte("pages", {"place_id": lst, "is_published": "eq.true", "categories": "cs.{restaurant}"})
    p = compte("pages", {"place_id": lst, "is_published": "eq.true"})
    return h, r, p


NOM_SITE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ'’ -]{3,40}$")


@functools.lru_cache(maxsize=64)
def sites_du_lieu(place_id: str) -> tuple:
    """Les sites publiés d'un lieu, les mieux renseignés d'abord. Un nom saisi à la main qui
    ressemble à une phrase (« Aux martrys tombes a Nosy Be Pour L'etat de droit... ») est écarté."""
    lignes = rest("attractions", {"select": "slug,name,kind,cover_source,summary", "place_id": f"eq.{place_id}",
                                  "is_published": "eq.true", "order": "name"})
    bons = [s for s in lignes if NOM_SITE.match((s.get("name") or "").strip())
            and len(s["name"].split()) <= 6 and not NOMS_ANGLAIS.search(s["name"])
            and not DEBUT_PAS_UN_NOM.match(s["name"].strip())
            # le type générique « site » reçoit les saisies à la main (« Nosy Easy Rent », un loueur) :
            # sans photo ni résumé, il ne fait pas une ligne « à voir »
            and (s.get("kind") != "site" or s.get("cover_source") or s.get("summary"))]
    bons.sort(key=lambda s: (0 if s.get("cover_source") else 1 if s.get("summary") else 2, s["name"]))
    # « Arbre Sacré » et « L'arbre sacré Sakalava » sont le même lieu (Hell-Ville, vu au rendu du 28/10) :
    # un nom contenu dans un autre ne fait pas une ligne de plus
    gardes, noms = [], []
    for s in bons:
        n = nom_compare(s["name"])
        if n and not any(n in m or m in n for m in noms):
            gardes.append(s)
            noms.append(n)
    return tuple(gardes)


# un bout de phrase (« Aux Morts Pour La France ») ou un commerce (« Location Bienvenu », Hell-Ville,
# rendu du 28/10) n'est pas un lieu « à voir »
DEBUT_PAS_UN_NOM = re.compile(r"(?i)^((aux|au|à|a|pour|de|du|des)\s|(location|agence|boutique|bar|snack|h[ôo]tel|"
                              r"restaurant|resto|shop|magasin|[ée]picerie|pharmacie|garage)\b)")


def nom_compare(nom: str) -> str:
    t = unicodedata.normalize("NFKD", nom.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"^(l['’]|le |la |les )", "", t.strip())
    return re.sub(r"[^a-z]", "", t)


NOM_ADRESSE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ'’&.,() -]{3,40}$")


@functools.lru_cache(maxsize=64)
def adresses_du_lieu(ids: tuple) -> tuple:
    """Quelques fiches PUBLIÉES du lieu (nom et catégorie seulement, jamais de contact)."""
    tous = list(ids)
    for r in rest("places", {"select": "id", "parent_id": liste_in(ids), "merged_into": "is.null"}):
        tous.append(r["id"])
    out = []
    for r in rest("pages", {"select": "name,categories", "place_id": liste_in(sorted(set(tous))),
                            "is_published": "eq.true", "order": "completeness.desc,name", "limit": "40"}):
        nom = re.sub(r"\s+", " ", (r.get("name") or "")).strip()
        cats = r.get("categories") or []
        genre = "hôtel" if "hotel" in cats else ("restaurant" if "restaurant" in cats else None)
        if genre and NOM_ADRESSE.match(nom) and nom.lower() not in {x[0].lower() for x in out}:
            out.append((nom, genre))
    return tuple(out[:6])


@functools.lru_cache(maxsize=64)
def acces_du_lieu(place_id: str) -> tuple:
    acc = rest("place_access", {"select": "from_place_id,mode,duration_h,distance_km,road_state",
                                "place_id": f"eq.{place_id}"})
    noms = lieux_par_id([a["from_place_id"] for a in acc if a.get("from_place_id")])
    return tuple({**a, "depuis": (noms.get(a.get("from_place_id")) or {}).get("name_fr")} for a in acc)


@functools.lru_cache(maxsize=32)
def motif_vivant(cle: str) -> dict:
    m = next(x for x in c3.MOTIFS if x[0] == cle)
    _, libelle, sens, mode, aiguille = m
    filtre = f"ilike.{aiguille}*" if mode == "debut" else f"ilike.*{aiguille}"
    n = compte("places", {"name_fr": filtre, "merged_into": "is.null"})
    noms, vus = [], set()
    for r in rest("places", {"select": "name_fr", "name_fr": filtre, "merged_into": "is.null",
                             "order": "nb_pages.desc,name_fr", "limit": "120"}):
        x = (r["name_fr"] or "").strip()
        if x and x.lower() not in vus:
            vus.add(x.lower())
            noms.append(x)
    return {"motif": libelle, "sens": sens, "mode": mode, "aiguille": aiguille, "nombre": n, "exemples": noms[:40]}


@functools.lru_cache(maxsize=1)
def totaux() -> dict:
    return {"total_lieux": compte("places", {"merged_into": "is.null"}),
            "total_villes": compte("places", {"merged_into": "is.null", "kind": "eq.ville"}),
            "total_pages": compte("pages", {"is_published": "eq.true"})}


# ───────────────────────── photos (Commons, crédits lus dans extmetadata) ─────────────────────────

def cle_photo(source: str) -> str:
    """Copie de verifier.cle_photo (on ne peut pas importer verifier.py) : le NOM DU FICHIER
    Commons, normalisé, identifie une photo quelle que soit l'écriture de l'adresse."""
    s = urllib.parse.unquote(source or "").replace(" ", "_")
    s = s.split("File:", 1)[-1] if "File:" in s else s.rsplit("/", 1)[-1]
    return s.lower()


def titre_commons(source: str) -> str:
    s = urllib.parse.unquote(source or "")
    if "commons.wikimedia.org" not in s or "File:" not in s:
        return ""
    nom = s.split("File:", 1)[1].split("?")[0].split("#")[0].replace("_", " ").strip()
    return "File:" + nom[:1].upper() + nom[1:] if nom else ""


def _lire_json(f: Path, defaut):
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return defaut


def _ecrire_json(f: Path, donnees) -> None:
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(f.suffix + ".tmp")
    tmp.write_text(json.dumps(donnees, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def infos_photos(titres: list[str]) -> dict[str, dict]:
    """Auteur, licence, taille de chaque fichier Commons. Fait STABLE : gardé 30 jours en cache."""
    fichier = CACHE / "commons.json"
    cache = _lire_json(fichier, {})
    limite = (datetime.now(TZ) - timedelta(days=30)).isoformat()
    manquants = sorted({t for t in titres if t and (t not in cache or cache[t].get("lu", "") < limite)})
    for k in range(0, len(manquants), 50):
        lot = manquants[k:k + 50]
        try:
            infos = commons.infos(lot)
        except Exception as e:  # noqa: BLE001 — le réseau ne doit pas laisser croire à une absence
            raise Refus(f"Wikimedia Commons illisible : {e}") from None
        vus = set()
        for f in infos:
            cache[f["titre"]] = {**f, "lu": datetime.now(TZ).isoformat()}
            vus.add(f["titre"])
        for t in lot:                       # titre absent de la réponse : on le note pour ne pas reboucler
            if t not in vus and t not in cache:
                cache[t] = {"titre": t, "absent": True, "lu": datetime.now(TZ).isoformat()}
    if manquants:
        _ecrire_json(fichier, cache)
    return {t: cache.get(t) for t in titres}


def auteur_lisible(a: str) -> str:
    a = f1.auteur_lisible(a or "")
    return "auteur inconnu" if re.search(r"(?i)unknown author", a) else a


def photo_depuis(source: str, info: dict | None, mini: int) -> tuple[dict | None, str]:
    """La photo prête à l'emploi, ou (None, raison)."""
    if not info or info.get("absent"):
        return None, "fichier absent de Commons"
    if not info.get("libre"):
        return None, f"licence non libre ({info.get('licence')!r})"
    if not (info.get("auteur") or "").strip():
        return None, "auteur illisible"
    w, h = info.get("largeur") or 0, info.get("hauteur") or 0
    if max(w, h) < mini:
        return None, f"trop petite ({w}×{h})"
    if not 0.45 <= w / max(h, 1) <= 2.6:
        return None, f"format étroit ({w}×{h})"
    if TITRE_PAS_UNE_PHOTO.search(info["titre"]):
        return None, "carte, logo ou schéma"
    cp = cle_photo(source)
    if cp in PHOTOS_ECARTEES:
        return None, "écartée à l'œil : " + PHOTOS_ECARTEES[cp]
    return {"titre": info["titre"], "auteur": auteur_lisible(info["auteur"]),
            "licence": f1.licence_lisible(info["licence"]), "source": source,
            "largeur": w, "hauteur": h, "cle_photo": cp}, ""


def telecharger(ph: dict, largeur: int) -> Path:
    """La photo en grand (largeur demandée, ou l'original s'il est plus petit), en cache."""
    nom = hashlib.sha1(ph["titre"].encode("utf-8")).hexdigest()[:16] + f"-{largeur}.jpg"
    dest = CACHE / "photos" / nom
    if dest.exists() and dest.stat().st_size > 20_000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = commons.api({"action": "query", "titles": ph["titre"], "prop": "imageinfo", "iiprop": "url",
                         "iiurlwidth": largeur})
        ii = r["query"]["pages"][0]["imageinfo"][0]
        url = ii.get("thumburl") or ii["url"]
    except Exception as e:  # noqa: BLE001
        raise Refus(f"adresse de {ph['titre']} illisible : {e}") from None
    for essai in range(4):
        try:
            donnees = urllib.request.urlopen(urllib.request.Request(url, headers=commons.UA), timeout=180).read()
            break
        except OSError as e:
            if essai == 3:
                raise Refus(f"téléchargement de {ph['titre']} impossible : {e}") from None
            time.sleep(3 + 3 * essai)
    tmp = dest.with_suffix(".tmp")
    tmp.write_bytes(donnees)
    from PIL import Image
    try:
        # ⚠ Windows : l'image doit être FERMÉE avant de renommer le fichier (sinon « fichier utilisé »)
        with Image.open(tmp) as im:
            w, h = im.size
            if im.format != "JPEG":
                im.convert("RGB").save(dest, "JPEG", quality=92)
            fmt = im.format
    except OSError as e:
        tmp.unlink(missing_ok=True)
        raise Refus(f"{ph['titre']} : fichier téléchargé illisible ({e})") from None
    if fmt == "JPEG":
        tmp.replace(dest)
    else:
        tmp.unlink(missing_ok=True)
    if max(w, h) < 1080:                     # on MESURE les pixels, on ne suppose pas
        dest.unlink(missing_ok=True)
        raise Refus(f"{ph['titre']} : {w}×{h}, trop petite pour une image de 1080 px")
    return dest


# ───────────────────────── registre : clés et photos déjà prises ─────────────────────────

def charger_deja(chemin: str | None) -> list[dict]:
    if not chemin:
        return []
    f = Path(chemin)
    if not f.exists():
        return []
    try:
        d = json.loads(f.read_text(encoding="utf-8") or "[]")
    except ValueError as e:
        raise Refus(f"--deja illisible ({f}) : {e}") from None
    if isinstance(d, dict):
        d = d.get("publications") or d.get("registre") or []
    return [x for x in d if isinstance(x, dict) and x.get("cle")]


def fiches_voisines(sortie: Path) -> list[dict]:
    """Les fiches que ce fournisseur a déjà écrites pour l'éditeur (dossiers frères de --sortie)."""
    out = []
    if not sortie.parent.exists():
        return out
    for fj in sortie.parent.glob("*/fiche.json"):
        if fj.parent.resolve() == sortie.resolve():
            continue
        f = _lire_json(fj, None)
        if isinstance(f, dict) and f.get("page") == PAGE:
            out.append(f)
    return out


def _photos_choix(cle: str) -> list[dict]:
    """Les photos choisies à l'œil pour un sujet des séries 1 à 3 (choix/<clé>.json, rang 1 parfois
    tiré de candidats.json) — même logique que reels/reel.py:photo_hd."""
    tous = _lire_json(ICI / "choix" / f"{cle}.json", {})
    cand = {c["cle"]: c for c in _lire_json(ICI / "candidats.json", [])}
    out = []
    for rang in range(1, 7):
        c = tous.get(str(rang))
        if c:
            out.append({"rang": rang, "titre": c["titre"], "auteur": auteur_lisible(c["credit"]),
                        "licence": f1.licence_lisible(c["licence"]), "source": c["source"]})
        elif rang == 1:
            p = (cand.get(cle) or {}).get("photo") or {}
            src = p.get("source") or ""
            if "commons.wikimedia.org/wiki/File:" in src:
                out.append({"rang": 1, "titre": titre_commons(src), "auteur": auteur_lisible(p.get("credit")),
                            "licence": f1.licence_lisible(p.get("licence")), "source": src})
    for ph in out:
        ph["cle_photo"] = cle_photo(ph["source"])
    return out


@functools.lru_cache(maxsize=1)
def photos_des_series() -> frozenset:
    """Toutes les photos des séries 1, 2, 3 (publiées, en file, ou jamais sorties) et des choix."""
    vus = set()
    for serie in ("sortie", "sortie2", "sortie3"):
        for fj in (ICI / serie).glob("*/fiche.json"):
            for ph in (_lire_json(fj, {}) or {}).get("photos", []):
                vus.add(cle_photo(ph.get("source")))
    for cj in (ICI / "choix").glob("*.json"):
        for v in (_lire_json(cj, {}) or {}).values():
            vus.add(cle_photo(v.get("source")))
    for c in _lire_json(ICI / "candidats.json", []):
        if (c.get("photo") or {}).get("source"):
            vus.add(cle_photo(c["photo"]["source"]))
    vus.discard("")
    return frozenset(vus)


@functools.lru_cache(maxsize=1)
def reels_passes() -> tuple[frozenset, frozenset]:
    """(clés de choix déjà montées en reel, photos de ces reels) — les 15 reels de septembre-octobre."""
    reels = _lire_json(ICI / "reels" / "reels.json", {}).get("reels", [])
    cles = frozenset(r["photos"] for r in reels if r.get("photos"))
    vus = {ph["cle_photo"] for c in cles for ph in _photos_choix(c)}
    for fj in (ICI / "reels" / "sortie").glob("*/fiche.json"):
        for ph in (_lire_json(fj, {}) or {}).get("photos", []):
            vus.add(cle_photo(ph.get("source")))
    vus.discard("")
    return cles, frozenset(vus)


class Registre:
    def __init__(self, deja: list[dict], voisines: list[dict]):
        self.cles = {x["cle"] for x in deja} | {f["cle"] for f in voisines if f.get("cle")}
        self.photos_editeur = {cle_photo(p.get("source")) for f in voisines for p in f.get("photos") or []}
        self.photos_editeur.discard("")
        self.textes = [f.get("texte") or "" for f in voisines]
        self.regions_datees = []
        for f in list(deja) + list(voisines):
            try:
                if f.get("region"):
                    self.regions_datees.append((date.fromisoformat(f["jour"]), f["region"]))
            except (TypeError, ValueError):
                continue

    def regions_proches(self, jour: date) -> set:
        """Les régions déjà montrées la veille, le jour même ou le lendemain : on en préfère une autre."""
        return {r for j, r in self.regions_datees if abs((j - jour).days) <= 1}

    def photos_interdites(self, reel: bool) -> set:
        base = set(self.photos_editeur) | set(reels_passes()[1])
        return base if reel else base | set(photos_des_series())

    def prefixe_regions(self, prefixe: str) -> int:
        return sum(1 for c in self.cles if c.startswith(prefixe))


# ───────────────────────── textes ─────────────────────────

META = re.compile(r"(?i)(⚠|\bsources?\b|confiance|à présenter|\baffich[ée]|modèle de données|\bfiche\b|relev[ée] le|"
                  r"selon la presse|https?://|@|\[réf|\bà doubler\b)")
ANAPHORE = re.compile(r"^(Cette|Ce|Cet|Ces|Elle|Il|Ils|Elles|Celui|Celle|Attention|On y)\b")


def phrases(t: str) -> list[str]:
    t = re.sub(r"\s+", " ", (t or "").replace("’", "'").strip())
    t = re.sub(r"(?<=[a-zà-ÿ])\.(?=[A-ZÀ-Ö][a-zà-ÿ])", ". ", t)     # « Atsinanana.Elle » -> deux phrases
    return [s.strip() for s in re.split(r"(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«\"])", t) if s.strip()]


def filtrer(texte: str, sans_chiffres: bool, maxi: int = 3, longueur: int = 420) -> str:
    """Les phrases publiables d'un texte de la base : ni note de travail, ni phrase tronquée, ni
    (si demandé) chiffre ; une phrase qui renvoie à une phrase écartée est écartée avec elle."""
    garde, prec_ok = [], True
    for s in phrases(texte):
        mauvais = bool(META.search(s)) or not re.search(r"[.!?…»)]$", s) or len(s) < 12
        if sans_chiffres and re.search(r"\d", s):
            mauvais = True
        if not mauvais and not prec_ok and ANAPHORE.match(s):
            mauvais = True
        prec_ok = not mauvais
        if not mauvais:
            garde.append(s)
    out, total = [], 0
    for s in garde:
        if len(out) >= maxi or total + len(s) > longueur:
            break
        out.append(s)
        total += len(s) + 1
    return " ".join(out)


def sans_accents(t: str) -> bool:
    """Un texte de la base écrit entièrement sans accent (on ne touche jamais à un texte accentué)."""
    return bool(t) and not re.search(r"[éèêëàâîïôûùç]", t, re.I)


def accentuer(t: str) -> str:
    def mot(m: re.Match) -> str:
        w = m.group(0)
        r = ACCENTS.get(w.lower())
        if not r:
            return w
        return r[:1].upper() + r[1:] if w[:1].isupper() else r
    t = re.sub(r"[A-Za-z]+", mot, t or "")
    t = re.sub(r"\ba (la|l'|part|doser|base)\b", r"à \1", t)
    t = re.sub(r"(^|[.!?]\s+)A (\w)", r"\1À \2", t)
    return t


def propre(t: str) -> str:
    return accentuer(t) if sans_accents(t) else t


def accorder(t: str) -> str:
    """« 1 hôtels » -> « 1 hôtel » : les nombres viennent de la base, l'accord suit."""
    return re.sub(r"(?<!\d)\b([01]) (hôtel|restaurant|fiche|établissement|nom de lieu)s\b", r"\1 \2", t)


def nombre(n: int) -> str:
    return f3.fmt(n)


def diese(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    mots = re.findall(r"[A-Za-z0-9]+", t)
    return "#" + "".join(m[:1].upper() + m[1:] for m in mots) if mots else ""


def hashtags(*mots: str) -> list[str]:
    out = ["#Diako"]
    for m in [*mots, "Madagascar", "VoyageMadagascar", "VisitMadagascar", "DecouvrirMadagascar"]:
        h = diese(m)
        if h and 3 <= len(h) <= 30 and h.lower() not in {x.lower() for x in out}:
            out.append(h)
        if len(out) == 5:
            break
    return out


def utm_de(cle: str) -> str:
    return cle.replace(":", "_")


def cle_de_utm(u: str) -> str:
    return u.replace("_", ":")


def slug_sur(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", (s or "").lower()).strip("-")


def lien_complet(lien: str, utm: str, reel: bool = False) -> str:
    return (f"{SITE}{lien}?utm_source=facebook&utm_medium={'reel' if reel else 'post'}"
            f"&utm_campaign=editeur&utm_content={utm}")


def gabarit(gid: str, **donnees) -> str:
    t = GABARITS_MG[gid][0]
    for k, v in donnees.items():
        t = t.replace("{" + k + "}", v)
    if "{" in t:
        raise Refus(f"gabarit malgache {gid} non rempli : {t}")
    return t


def composer(icone: str, titre: str, mg: str, emoji: str, paragraphes: list[str], question: str, cta: str,
             lien: str, photos: list[dict], tags: list[str], musique: str | None = None,
             note: str | None = None) -> str:
    auteurs = []
    for ph in photos:
        if ph["auteur"] not in auteurs:
            auteurs.append(ph["auteur"])
    blocs = [f"{icone} {titre} — {mg} {emoji}🇲🇬", *[p for p in paragraphes if p], "🙋 " + question,
             f"👉 {cta} : {lien}"]
    if auteurs:
        blocs.append("📷 Photos : " + " · ".join(auteurs)
                     + " — Wikimedia Commons, licences libres (détail sur chaque image)")
    if note:
        blocs.append(note)
    if musique:
        blocs.append("🎵 Musique : " + musique)
    blocs.append(" ".join(tags))
    return accorder("\n\n".join(blocs).strip())


def verifier_gabarits() -> None:
    """Chaque gabarit malgache passe l'alphabet et la particule « ve » (question fermée)."""
    for gid, (mg, _) in GABARITS_MG.items():
        sans = re.sub(r"\{[^}]*\}", "", mg)
        mots = [w for w in re.findall(r"[\w'’-]+", sans.lower())]
        hors = [w for w in mots if HORS_ALPHABET.search(w)]
        if hors:
            raise Refus(f"gabarit {gid} : mots hors alphabet malgache {hors}")
        if mg.startswith("Efa ") and " ve " not in mg:
            raise Refus(f"gabarit {gid} : question fermée sans « ve »")


# ───────────────────────── la publication ─────────────────────────

class Pub(dict):
    """cle, type, lien, texte, images (spécifications de rendu), photos, sources, gabarits, reel."""


def p_affiche(titre: str, ou: str, mg: str, rubrique: str, icone: str, emoji: str, lien: str) -> dict:
    return {"cle": "editeur", "titre": titre, "ou": ou, "mg": mg, "rubrique": rubrique, "icone": icone,
            "emoji": emoji, "lien": lien}


def suffixe_photo(ph: dict, rang: int) -> dict:
    return {**ph, "rang": rang}


# ── 00:00 · événement du mois ──

def date_unique(periode: str | None, annee: int) -> date | None:
    """Une période qui ne nomme qu'UN jour (« 1er novembre, chaque année ») : ce jour-là."""
    p = (periode or "").lower()
    jours = re.findall(r"\b(\d{1,2})(?:er)?\s+(" + "|".join(MOIS_NUM) + r")\b", p)
    if len(jours) != 1:
        return None
    tete = p.split(",")[0]
    if re.search(r"\b(au|à|jusqu|entre|de|du)\b|–|—", tete):
        return None
    j, m = jours[0]
    try:
        return date(annee, MOIS_NUM[m], int(j))
    except ValueError:
        return None


def evenement_admis(e: dict, jour: date) -> str:
    """'' si l'événement est juste à la date de sortie, sinon la raison."""
    if jour.month not in (e.get("mois") or []):
        return "hors du mois de sortie"
    titre = (e.get("title") or "") + " " + (e.get("slug") or "")
    if e.get("kind") == "fete_nationale" or re.search(r"(?i)no[eë]l|r[ée]veillon|nouvel an|f[êe]te nationale|"
                                                      r"ind[ée]pendance", titre):
        return "fête nationale ou de calendrier : jamais un événement (règle Diako du 03/09/2026)"
    if re.search(r"⚠|À présenter|à présenter", e.get("summary") or ""):
        return "la fiche porte une note de travail : pas prête"
    if not (e.get("recurrent") or e.get("yearly")) and not e.get("starts_on"):
        return "événement ponctuel sans date vérifiable"
    if e.get("starts_on"):
        debut = date.fromisoformat(e["starts_on"][:10])
        fin = date.fromisoformat(e["ends_on"][:10]) if e.get("ends_on") else debut
        if e.get("yearly"):
            try:
                debut, fin = debut.replace(year=jour.year), fin.replace(year=jour.year)
            except ValueError:
                pass
        if fin < jour:
            return f"terminé le {fin.isoformat()}"
    unique = date_unique(e.get("periode"), jour.year)
    if unique and unique < jour:
        return f"jour unique déjà passé ({unique.isoformat()})"
    mots = set(re.split(r"[-_]", e.get("slug") or ""))
    if mots & SUJETS_SERIE2:
        return "sujet déjà traité par la série 2"
    return ""


def urgence(e: dict, jour: date) -> int:
    mois, m, n = set(e.get("mois") or []), jour.month, 0
    while m in mois and n < 12:
        n += 1
        m = m % 12 + 1
    return n


def candidats_evenement(jour: date) -> list[tuple[str, dict]]:
    ordre = {"certaine": 0, "periode_sure": 1}
    evs = [e for e in evenements() if not evenement_admis(e, jour)]
    evs.sort(key=lambda e: (urgence(e, jour), ordre.get(e.get("confiance"), 2), e["slug"]))
    return [(f"diako:evenement:{slug_sur(e['slug'])}:{jour.year}", e) for e in evs]


def construire_evenement(cle: str, e: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    if evenement_admis(e, jour):
        return None
    titre = e["title"].strip()
    lieu = re.sub(r"\s+", " ", (e.get("lieu_libre") or "")).strip()
    lieu_base = None
    if e.get("place_id"):
        lieu_base = lieux_par_id([e["place_id"]]).get(e["place_id"])
        if not lieu:
            lieu = (lieu_base or {}).get("name_fr") or ""
    resume = filtrer(e.get("summary"), sans_chiffres=True, maxi=3, longueur=380)
    periode = (e.get("periode") or "").strip()
    photo, sources = None, {}
    for src, quoi in ((e.get("poster_source"), "affiche de l'événement"),
                      ((lieu_base or {}).get("cover_source"), f"couverture du lieu {(lieu_base or {}).get('name_fr')}")):
        t = titre_commons(src or "")
        if not t or cle_photo(src) in interdites:
            continue
        ph, _ = photo_depuis(src, infos_photos([t]).get(t), MINI_POST)
        if ph:
            photo = suffixe_photo(ph, 1)
            sources["photo"] = f"{quoi} — {ph['titre']}, {ph['auteur']}, {ph['licence']}"
            break
    emoji = EMOJI_EVT.get(e.get("kind"), "📅")
    mg = gabarit("mg-titre-evenement")
    p = p_affiche(titre, lieu or "Madagascar", mg, "Ce mois-ci", "📅", emoji, "/evenements")
    paras = [resume or f"Au calendrier Diako en {MOIS_FR[jour.month]} : {titre}."]
    if periode:
        paras.append(f"🗓️ Quand : {periode}")
    if lieu:
        paras.append(f"📍 Où : {lieu}")
    paras.append("Fêtes, saisons, récoltes : le calendrier de Diako les range mois par mois, pour choisir "
                 "le bon moment de partir.")
    utm = utm_de(cle)
    texte = composer("📅", titre, mg, emoji, paras, gabarit("mg-q-evenement"), "Le calendrier du mois sur Diako",
                     lien_complet("/evenements", utm), [photo] if photo else [],
                     hashtags(titre, re.split(r",| et ", lieu)[0] if lieu else ""))
    images = [("affiche_photo", p, photo) if photo else ("affiche_typo", p)]
    if nature == "album":
        if periode:
            images.append(("carte", p, f"Quand ?\n\n{periode}"))
        if resume:
            images.append(("carte", p, resume))
    sources |= {"événement": f"Supabase events/{e['slug']} (is_published, mois={e.get('mois')}), lu le {horodatage()}",
                "période": f"citée telle quelle depuis events.periode ({e.get('confiance') or 'confiance non dite'})"}
    if e.get("source"):
        sources["source de la fiche"] = e["source"]
    return Pub(cle=cle, type="evenement", lien="/evenements", texte=texte, images=images,
               photos=[photo] if photo else [], sources=sources,
               gabarits=["mg-titre-evenement", "mg-q-evenement"], reel=False, chiffres={})


# ── 00:00 · plat ──

def ordre_stable(x: str) -> str:
    return hashlib.sha1(("diako-editeur:" + x).encode("utf-8")).hexdigest()


def candidats_plat() -> list[tuple[str, dict]]:
    out = [d for d in plats() if d.get("photo_source") and d["slug"] not in PLATS_SERIE2]
    out.sort(key=lambda d: ordre_stable(d["slug"]))
    return [(f"diako:plat:{slug_sur(d['slug'])}", d) for d in out]


def photo_du_plat(d: dict, interdites: set, mini: int) -> dict | None:
    src = d.get("photo_source") or ""
    t = titre_commons(src)
    if not t or cle_photo(src) in interdites:
        return None
    ph, _ = photo_depuis(src, infos_photos([t]).get(t), mini)
    return ph


def construire_plat(cle: str, d: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    ph = photo_du_plat(d, interdites, MINI_POST)
    if not ph:
        return None
    photo = suffixe_photo(ph, 1)
    nom, nom_mg = d["name_fr"].strip(), (d.get("name_mg") or "").strip()
    desc = propre(filtrer(d.get("description"), sans_chiffres=True, maxi=3, longueur=320))
    boisson = d.get("family") == "boisson"
    gid_t = "mg-titre-boisson" if boisson else "mg-titre-plat"
    mg = gabarit(gid_t)
    if nom_mg and not HORS_ALPHABET.search(nom_mg) and nom_mg.lower() != nom.lower():
        question, gid_q = gabarit("mg-q-plat", nom=nom_mg), "mg-q-plat"
    else:
        question, gid_q = gabarit("mg-q-plat-generique"), "mg-q-plat-generique"
    tete = nom + (f" — « {nom_mg} » en malgache" if nom_mg and nom_mg.lower() != nom.lower() else "")
    if desc[:2].istitle() and desc[1:2].islower():       # « Le riz nature… » après deux-points -> « le riz… »
        desc = desc[:1].lower() + desc[1:]
    paras = [f"{tete} : {desc}" if desc else tete + "."]
    fam = FAMILLE_PLAT.get(d.get("family") or "")
    infos = [x for x in (fam, "Sans viande ni poisson." if d.get("is_vegetarian") else None) if x]
    if infos:
        paras.append(" ".join(infos))
    n_resto = d.get("nb_restaurants") or 0
    if n_resto == 1:
        paras.append("Sur Diako, 1 restaurant le propose.")
    elif n_resto > 1:
        paras.append(f"Sur Diako, {nombre(n_resto)} restaurants le proposent.")
    paras.append("Chaque plat malgache a sa fiche sur Diako : ce qu'il contient, et les autres plats de "
                 "la même famille.")
    lien = f"/plat/{d['slug']}"
    utm = utm_de(cle)
    p = p_affiche(nom, "Cuisine malgache" + (f" · {d['family']}" if d.get("family") else ""), mg, "Le goût",
                  "🍲", "😋", lien)
    texte = composer("🍲", nom, mg, "😋", paras, question, "La fiche du plat sur Diako", lien_complet(lien, utm),
                     [photo], hashtags(nom, "CuisineMalgache"))
    images = [("affiche_photo", p, photo)]
    if nature == "album":
        if desc:
            images.append(("carte", p, desc))
        if infos:
            images.append(("carte", p, " ".join(infos)))
    return Pub(cle=cle, type="plat", lien=lien, texte=texte, images=images, photos=[photo],
               sources={"plat": f"Supabase dishes/{d['slug']}, lu le {horodatage()}",
                        "photo": f"{ph['titre']}, {ph['auteur']}, {ph['licence']}"},
               gabarits=[gid_t, gid_q], reel=False, chiffres={"nb_restaurants": n_resto})


# ── 00:00 · site ──

def candidats_site() -> list[tuple[str, dict]]:
    pris = liens_des_series()
    out = [a for a in sites_couverts()
           if len(a.get("description") or "") >= 150 and f"/site/{a['slug']}" not in pris
           and not NOMS_ANGLAIS.search(a["name"]) and a.get("place_id")
           and a["name"].strip().lower() not in {"madagascar"}]
    out.sort(key=lambda a: ordre_stable(a["slug"]))
    return [(f"diako:site:{slug_sur(a['slug'])}", a) for a in out]


def construire_site(cle: str, a: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    src = a.get("cover_source") or ""
    t = titre_commons(src)
    if not t or cle_photo(src) in interdites:
        return None
    ph, _ = photo_depuis(src, infos_photos([t]).get(t), MINI_POST)
    if not ph:
        return None
    photo = suffixe_photo(ph, 1)
    lieu = lieux_par_id([a["place_id"]]).get(a["place_id"]) or {}
    if not lieu.get("region"):
        return None
    desc = propre(filtrer(a.get("description"), sans_chiffres=False, maxi=3, longueur=430))
    if not desc:
        return None
    nom, genre = a["name"].strip(), TYPE_SITE.get(a.get("kind"), "site")
    emoji = EMOJI_SITE.get(a.get("kind"), "🧭")
    mg = gabarit("mg-titre-site")
    paras = [desc, f"📍 {genre[:1].upper() + genre[1:]} · {lieu['name_fr']}, région {lieu['region']}."]
    if a.get("fady"):
        paras.append("Fady (interdits) signalés sur Diako : " + ", ".join(a["fady"][:4]) + ".")
    if a.get("guide_required"):
        paras.append("La visite se fait avec un guide, selon la fiche Diako.")
    h, r, _ = etablissements((lieu["id"],))
    if h or r:
        paras.append(f"À {lieu['name_fr']}, Diako référence {nombre(h)} hôtels et {nombre(r)} restaurants "
                     f"(fiches publiées, relevé le {horodatage()}).")
    note = "📖 Texte : extrait de Wikipédia, licence CC BY-SA." if "wikipedia" in (a.get("source") or "").lower() \
        or "wikipédia" in (a.get("source") or "").lower() else None
    lien = f"/site/{a['slug']}"
    utm = utm_de(cle)
    p = p_affiche(nom, f"{genre[:1].upper() + genre[1:]} · {lieu['region']}", mg, "À voir", "🧭", emoji, lien)
    texte = composer("🧭", nom, mg, emoji, paras, gabarit("mg-q-site", nom=nom), "La fiche du site sur Diako",
                     lien_complet(lien, utm), [photo], hashtags(nom, lieu["region"]), note=note)
    images = [("affiche_photo", p, photo)]
    if nature == "album":
        images.append(("carte", p, desc))
    sources = {"site": f"Supabase attractions/{a['slug']} (is_published), lu le {horodatage()}",
               "photo": f"{ph['titre']}, {ph['auteur']}, {ph['licence']}"}
    if h or r:
        sources[f"{h} hôtels, {r} restaurants"] = (f"Supabase pages (is_published, place_id = {lieu['slug']} "
                                                   f"et ses quartiers), lu le {horodatage()}")
    if a.get("source"):
        sources["texte"] = a["source"]
    return Pub(cle=cle, type="site", lien=lien, texte=texte, images=images, photos=[photo], sources=sources,
               gabarits=["mg-titre-site", "mg-q-site"], reel=False, chiffres={"hotels": h, "restaurants": r},
               region=lieu["region"])


# ── 18:00 · ville (série 3) ──

@functools.lru_cache(maxsize=1)
def serie3() -> dict:
    return _lire_json(ICI / "serie3.json", {})


def candidats_ville() -> list[tuple[str, dict]]:
    return [(f"diako:ville:{slug_sur(p['cle'])}", p) for p in serie3().get("publications", [])]


def construire_ville(cle: str, p0: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    p = json.loads(json.dumps(p0))
    ville = next((v for v in c3.VILLES if v[0] == p["cle"]), None)
    if not ville or not p.get("lien"):
        return None
    _, libelle, slugs, region = ville
    if p["decoupe"].strip().lower() == p["titre"].strip().lower():
        return None
    morceaux = [x.strip() for x in p["decoupe"].split("·")]
    if any(m not in morceaux for m in (p.get("defs") or {})):
        return None
    rangs = [r for r in lieux_par_slug(slugs) if not r.get("merged_into")]
    if len(rangs) != len(slugs) or any(r.get("region") != region for r in rangs):
        return None                                   # lieu fusionné ou région changée : lien douteux
    h, r, n = etablissements(tuple(sorted(x["id"] for x in rangs)))
    ch = {"villes": {p["cle"]: {"libelle": libelle, "region": region, "hotels": h, "restaurants": r, "pages": n}},
          "motifs": {}, "referentiel_charge_le": horodatage(), **totaux()}
    if p.get("motif"):
        ch["motifs"][p["motif"]] = motif_vivant(p["motif"])
    ctx = f3.contexte(p, ch)
    # la photo : la couverture du lieu dans la base (jamais celles de sortie3/, déjà comptées par verifier.py)
    photo = None
    if p["type"] == "photos":
        for x in rangs:
            t = titre_commons(x.get("cover_source") or "")
            if t and cle_photo(x["cover_source"]) not in interdites:
                ph, _ = photo_depuis(x["cover_source"], infos_photos([t]).get(t), MINI_POST)
                if ph:
                    photo = suffixe_photo(ph, 1)
                    break
        if not photo:
            p["type"] = "mot"
    images = []
    if p["type"] == "photos":
        images.append(("affiche_photo", {**p, "lien": "/" if f3.barre3(p["lien"]) == "diako.fonenako.mg"
                                         else p["lien"]}, photo))
    else:
        images.append(("affiche_mot", p, ctx))
    for c in p["cartes"]:
        if c["k"] == "sens":
            if not p.get("sens"):
                return None
            images.append(("sens", p, ctx))
        elif c["k"] == "noms":
            if not p.get("motif"):
                return None
            images.append(("noms", p, ch, ctx))
        elif c["k"] == "chiffres":
            images.append(("chiffres", p, ch))
        elif c["k"] == "fait":
            images.append(("carte", p, f3.remplir(c["t"], ctx)))
        else:
            return None
    if not 4 <= len(images) <= 5:
        return None
    utm = utm_de(cle)
    texte = accorder(f3.brouillon(p, [photo] if photo else [],
                                  f"utm_source=facebook&utm_medium=post&utm_campaign=editeur&utm_content={utm}", ctx))
    sources = {f"{h} hôtels, {r} restaurants, {n} fiches": (f"Supabase pages (is_published, place_id = "
                                                            f"{', '.join(slugs)} et leurs quartiers), lu le {horodatage()}"),
               "texte": "serie3.json (série 3 « Tanàna tsirairay », jamais publiée) : " + " ; ".join(p.get("sources", []))}
    if p.get("motif"):
        m = ch["motifs"][p["motif"]]
        sources[f"{m['nombre']} noms en {m['motif']}"] = (f"Supabase places (name_fr ilike, merged_into nul), "
                                                          f"lu le {horodatage()}")
    if photo:
        sources["photo"] = f"couverture du lieu dans la base — {photo['titre']}, {photo['auteur']}, {photo['licence']}"
    return Pub(cle=cle, type="ville", lien=p["lien"], texte=texte, images=images, photos=[photo] if photo else [],
               sources=sources, gabarits=[f"serie3-titre-{p['cle']}", f"serie3-question-{p['cle']}"]
               + ([f"serie3-gloses-{p['cle']}"] if any(c["k"] == "sens" for c in p["cartes"]) else []),
               reel=False, chiffres={"hotels": h, "restaurants": r, "pages": n,
                                     "motif": ch["motifs"].get(p.get("motif"), {}).get("nombre")}, region=region)


# ── 18:00 · lieu (places) ──

@functools.lru_cache(maxsize=1)
def liens_des_series() -> frozenset:
    """Les fiches (lieux et sites) déjà mises en avant par les séries 1, 2 et 3."""
    liens = set()
    for serie in ("sortie", "sortie2", "sortie3"):
        for fj in (ICI / serie).glob("*/fiche.json"):
            lien = (_lire_json(fj, {}) or {}).get("lien")
            if lien:
                liens.add(lien)
    for p in serie3().get("publications", []):
        liens.add(p.get("lien"))
    return frozenset(x for x in liens if x)


def candidats_lieu() -> list[tuple[str, dict]]:
    pris = liens_des_series()
    villes3 = {s for v in c3.VILLES for s in v[2]}
    out = [x for x in lieux_couverts()
           if x.get("region") and x.get("kind") in TYPE_LIEU and x["kind"] not in ("quartier", "region", "hameau")
           and f"/lieu/{x['slug']}" not in pris and x["slug"] not in villes3]
    out.sort(key=lambda x: (-(x.get("nb_pages") or 0), x["slug"]))
    return [(f"diako:lieu:{slug_sur(x['slug'])}", x) for x in out]


def construire_lieu(cle: str, x: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    src = x.get("cover_source") or ""
    t = titre_commons(src)
    if not t or cle_photo(src) in interdites:
        return None
    ph, _ = photo_depuis(src, infos_photos([t]).get(t), MINI_POST)
    if not ph:
        return None
    photo = suffixe_photo(ph, 1)
    nom, genre = x["name_fr"].strip(), TYPE_LIEU.get(x["kind"], "lieu")
    sites = [s for s in sites_du_lieu(x["id"]) if not NOMS_ANGLAIS.search(s["name"])][:6]
    acces = [a for a in acces_du_lieu(x["id"]) if a.get("depuis") and a.get("mode")]
    h, r, n = etablissements((x["id"],))
    resume = propre(filtrer(x.get("summary"), sans_chiffres=True, maxi=2, longueur=260))
    emoji = EMOJI_SITE.get(x["kind"], "📍")
    lien = f"/lieu/{x['slug']}"
    p = p_affiche(nom, f"{genre[:1].upper() + genre[1:]} · {x['region']}", gabarit("mg-titre-lieu", nom=nom),
                  "Destination", "📍", emoji, lien)
    ch = {"villes": {"editeur": {"libelle": nom, "region": x["region"], "hotels": h, "restaurants": r, "pages": n}},
          "referentiel_charge_le": horodatage()}
    adresses = adresses_du_lieu((x["id"],)) if (h or r) else ()
    cartes = []
    if sites:
        cartes.append(("carte", p, "À voir autour :\n\n" + "\n".join(f"· {s['name']}" for s in sites)))
    if h or r:
        cartes.append(("chiffres", p, ch))
    if len(adresses) >= 2:
        cartes.append(("carte", p, "Quelques adresses sur Diako :\n\n"
                       + "\n".join(f"· {nom_a} ({genre_a})" for nom_a, genre_a in adresses)))
    if acces:
        lignes = []
        for a in acces[:3]:
            d = f", environ {a['duration_h']:g} h" if a.get("duration_h") else ""
            lignes.append(f"· depuis {a['depuis']} : {a['mode']}{d}")
        cartes.append(("carte", p, "Y aller, selon Diako :\n\n" + "\n".join(lignes)))
    if resume:
        cartes.append(("carte", p, resume))
    images = [("affiche_photo", p, photo), *cartes[:3]]
    # une seconde photo : la couverture d'un site rattaché, si elle est libre et jamais employée
    photos = [photo]
    for s in sites:
        full = next((a for a in sites_couverts() if a["slug"] == s["slug"]), None)
        if not full:
            continue
        s_src = full.get("cover_source") or ""
        s_t = titre_commons(s_src)
        if not s_t or cle_photo(s_src) in interdites or cle_photo(s_src) == photo["cle_photo"]:
            continue
        ph2, _ = photo_depuis(s_src, infos_photos([s_t]).get(s_t), MINI_POST)
        if ph2:
            photo2 = suffixe_photo(ph2, len(images) + 1)
            images.append(("suite", {**p, "titre": full["name"]}, photo2))
            photos.append(photo2)
            break
    if not 4 <= len(images) <= 5:
        return None
    if nature == "photo":                    # 00:00 en repli : l'affiche seule, le texte garde tout
        images, photos = images[:1], photos[:1]
    paras = [resume or f"{nom}, {genre} de la région {x['region']}."]
    if sites:
        paras.append("👀 À voir autour, selon Diako : " + ", ".join(s["name"] for s in sites[:5]) + ".")
    if len(adresses) >= 2:
        paras.append("📌 Parmi les adresses référencées : " + ", ".join(n_ for n_, _ in adresses[:4]) + ".")
    if acces:
        a = acces[0]
        paras.append(f"🚗 Depuis {a['depuis']} : {a['mode']}"
                     + (f", environ {a['duration_h']:g} h" if a.get("duration_h") else "") + " (fiche d'accès Diako).")
    if h or r:
        paras.append(f"🏨 Sur place, Diako référence {nombre(h)} hôtels et {nombre(r)} restaurants "
                     f"(fiches publiées, relevé le {horodatage()}).")
    utm = utm_de(cle)
    cta = f"Où dormir et où manger à {nom}" if (h or r) else f"{nom} sur Diako"
    texte = composer("📍", nom, p["mg"], emoji, paras, gabarit("mg-q-lieu", nom=nom), cta, lien_complet(lien, utm),
                     photos, hashtags(nom, x["region"]))
    sources = {"lieu": f"Supabase places/{x['slug']}, lu le {horodatage()}",
               "photos": " · ".join(f"{q['titre']} ({q['auteur']}, {q['licence']})" for q in photos)}
    if sites:
        sources["à voir"] = f"Supabase attractions (is_published, place_id = {x['slug']}), lu le {horodatage()}"
    if acces:
        sources["accès"] = f"Supabase place_access ({x['slug']}), lu le {horodatage()}"
    if h or r:
        sources[f"{h} hôtels, {r} restaurants"] = (f"Supabase pages (is_published, place_id = {x['slug']} et ses "
                                                   f"quartiers), lu le {horodatage()}")
    if len(adresses) >= 2:
        sources["adresses"] = f"Supabase pages (nom et catégorie, is_published), lu le {horodatage()}"
    return Pub(cle=cle, type="lieu", lien=lien, texte=texte, images=images, photos=photos, sources=sources,
               gabarits=["mg-titre-lieu", "mg-q-lieu"], reel=False, chiffres={"hotels": h, "restaurants": r},
               region=x["region"])


def construire_site_album(cle: str, a: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    return construire_site(cle, a, "album", jour, interdites)


# ── 20:00 · reels ──

@functools.lru_cache(maxsize=1)
def musiques() -> list[dict]:
    import reel as R  # noqa: E402 — reels/reel.py, sûr à l'import
    index = _lire_json(R.MUSIQUES / "index.json", {})
    return [m for m in (index.get("morceaux") or []) if (R.MUSIQUES / m["fichier"]).exists()]


def musique_du_jour(jour: date) -> dict:
    ms = musiques()
    if not ms:
        raise Refus("aucune musique dans le dossier de l'atelier Fonenako")
    return ms[jour.toordinal() % len(ms)]


def credit_musique(m: dict) -> str:
    if m.get("attribution_requise"):
        return m["attribution_texte"]
    return f"{m['titre']} — {m['auteur']} ({m['licence']})"


def candidats_reel_lieu() -> list[tuple[str, dict]]:
    deja, _ = reels_passes()
    try:
        _, _, pubs = f1.charger()
    except SystemExit as e:                  # charger() refuse une série sans lien : pas de reel de lieu
        raise Refus(f"série 1 illisible : {e}") from None
    return [(f"diako:reel:lieu:{slug_sur(p['cle'])}", p) for p in pubs
            if p["cle"] not in deja and (ICI / "choix" / f"{p['cle']}.json").exists()]


MOUVEMENTS = ["pano", "zoom", "pano-g", "zoom-out", "pano", "zoom"]


def construire_reel_lieu(cle: str, p: dict, nature: str, jour: date, interdites: set) -> Pub | None:
    photos = [ph for ph in _photos_choix(p["cle"]) if ph["cle_photo"] not in interdites][:5]
    if len(photos) < 4:
        return None
    lien = p["lien"]
    slug = lien.rsplit("/", 1)[-1]
    if lien.startswith("/lieu/"):
        rangs = [x for x in lieux_par_slug([slug]) if not x.get("merged_into")]
    else:
        rangs = rest("attractions", {"select": "id,slug,name,summary,place_id", "slug": f"eq.{slug}",
                                     "is_published": "eq.true"})
    if not rangs:
        return None                                      # la fiche a disparu : pas de lien mort
    base = rangs[0]
    region = (base.get("region") if lien.startswith("/lieu/")
              else (lieux_par_id([base["place_id"]]).get(base["place_id"]) or {}).get("region")
              if base.get("place_id") else None)
    h = r = 0
    if lien.startswith("/lieu/"):
        h, r, _ = etablissements((base["id"],))
    resume = propre(filtrer(base.get("summary"), sans_chiffres=True, maxi=2, longueur=260))
    titre = p["titre"]
    m = musique_du_jour(jour)
    plans = []
    for i, ph in enumerate(photos):
        # reel.photo_hd lit le RANG dans choix/<clé>.json : on garde le rang d'origine de la photo
        pl = {"photo": ph["rang"], "mouv": MOUVEMENTS[i % len(MOUVEMENTS)]}
        if i == 1:
            pl |= {"texte": titre, "sous": p["ou"]}
        elif i == 2 and (h or r):
            pl |= {"texte": f"{nombre(h)} hôtels · {nombre(r)} restaurants", "sous": "référencés sur Diako"}
        plans.append(pl)
    plans_txt = [accorder(x.get("texte", "")) for x in plans]
    for x, t in zip(plans, plans_txt):
        if t:
            x["texte"] = t
    utm = utm_de(cle)
    fin = (f"Où dormir à {titre} ?<br>Tout est sur" if (h or r) else f"{titre} :<br>la fiche est sur")
    r_def = {"cle": utm, "photos": p["cle"], "lieu": p["ou"], "accroche": titre, "musique": m["fichier"],
             "lien": lien, "cta": "", "plans": plans, "fin": {"texte": fin}, "description": "", "hashtags": []}
    paras = [resume or f"{titre}, {p['ou']}.", "Quelques secondes d'évasion, en photos libres de Wikimedia Commons. 🎬"]
    if h or r:
        paras.append(f"🏨 Sur place, Diako référence {nombre(h)} hôtels et {nombre(r)} restaurants "
                     f"(fiches publiées, relevé le {horodatage()}).")
    texte = composer("📍", f"{titre} en images", gabarit("mg-titre-reel"), p.get("emoji") or "🎬", paras,
                     gabarit("mg-q-reel-lieu", nom=titre),
                     f"Où dormir et où manger à {titre}" if (h or r) else f"{titre} sur Diako",
                     lien_complet(lien, utm, reel=True), photos, hashtags(titre, p["ou"].split("·")[-1].strip()),
                     musique=credit_musique(m))
    sources = {"photos": f"choisies à l'œil pour la série 1 (choix/{p['cle']}.json)",
               "lieu": f"Supabase {('places' if lien.startswith('/lieu/') else 'attractions')}/{slug}, lu le {horodatage()}",
               "musique": f"{m['fichier']} — {m['licence']}"}
    if h or r:
        sources[f"{h} hôtels, {r} restaurants"] = f"Supabase pages (is_published, {slug} et ses quartiers), lu le {horodatage()}"
    return Pub(cle=cle, type="reel-lieu", lien=lien, texte=texte, images=[], photos=photos, sources=sources,
               gabarits=["mg-titre-reel", "mg-q-reel-lieu"], reel=True, reel_def=r_def, resolveur=None,
               chiffres={"hotels": h, "restaurants": r}, region=region)


@functools.lru_cache(maxsize=1)
def sujets_visuels() -> tuple:
    """Sites et lieux qui ont une couverture libre : la matière des reels « région »."""
    out = []
    lieux = lieux_par_id([a["place_id"] for a in sites_couverts() if a.get("place_id")])
    for a in sites_couverts():
        lieu = lieux.get(a.get("place_id")) or {}
        if not lieu.get("region") or NOMS_ANGLAIS.search(a["name"]) or a["name"].strip().lower() == "madagascar":
            continue
        out.append({"nom": a["name"].strip(), "genre": TYPE_SITE.get(a.get("kind"), "site"), "region": lieu["region"],
                    "pres": lieu.get("name_fr"), "source": a.get("cover_source"), "lien": f"/site/{a['slug']}"})
    for x in lieux_couverts():
        if not x.get("region") or x.get("kind") in ("quartier", "region"):
            continue
        out.append({"nom": x["name_fr"].strip(), "genre": TYPE_LIEU.get(x["kind"], "lieu"), "region": x["region"],
                    "pres": None, "source": x.get("cover_source"), "lien": f"/lieu/{x['slug']}"})
    return tuple(out)


def _photos_valables(sujets: list[dict], interdites: set, mini: int) -> list[dict]:
    titres = [titre_commons(s["source"] or "") for s in sujets]
    infos = infos_photos([t for t in titres if t])
    out, vus = [], set()
    for s, t in zip(sujets, titres):
        if not t or cle_photo(s["source"]) in interdites or cle_photo(s["source"]) in vus:
            continue
        ph, _ = photo_depuis(s["source"], infos.get(t), mini)
        if ph:
            vus.add(ph["cle_photo"])
            out.append({**s, "photo": ph})
    return out


HORIZON_POSTS = 30
HORIZON_SERRE = 10      # dernier recours d'un 20:00 vide : on ne protège plus que le mois qui vient


@functools.lru_cache(maxsize=8)
def reservees_aux_posts(cles_faites: frozenset = frozenset(), horizon: int = HORIZON_POSTS) -> frozenset:
    """Les photos qui n'ont qu'une vie (une couverture par sujet) et dont un post aura besoin : les
    HORIZON_POSTS prochains sites et lieux de leur file (pas encore publiés), les couvertures des villes
    de la série 3, les photos de plats. Mesuré au banc du 28/10 : sans réserve, les reels « région »
    vidaient le vivier de 00:00 dès le 29/11 ; en réservant TOUTE la file, il ne restait que ~5 reels
    région et six 20:00 restaient vides du 28/11 au 03/12. Les 30 prochains (≈ 3 mois de posts) : ~10."""
    out = set()
    for cands in (candidats_site(), candidats_lieu()):
        prochains = [s for c, s in cands if c not in cles_faites][:horizon]
        out |= {cle_photo(s.get("cover_source")) for s in prochains}
    for _, d in candidats_plat():
        out.add(cle_photo(d.get("photo_source")))
    slugs = [s for v in c3.VILLES for s in v[2]]
    for x in lieux_par_slug(slugs):
        out.add(cle_photo(x.get("cover_source")))
    out.discard("")
    return frozenset(out)


@functools.lru_cache(maxsize=1)
def regions() -> tuple[str, ...]:
    return tuple(sorted({s["region"] for s in sujets_visuels()}))


def candidats_reel_region() -> list[tuple[str, dict]]:
    # une région = une file de reels ; le rang (…:1, …:2) se lit dans le registre
    return [(f"diako:reel:region:{slug_sur(r)}", {"region": r}) for r in regions()]


def construire_reel_liste(cle: str, sujets: list[dict], accroche: str, puce: str, fin: str, titre: str,
                          gid_q: str, nom_q: str, emoji: str, lien: str, cta: str, tags: list[str],
                          type_: str, jour: date, para_intro: str) -> Pub:
    m = musique_du_jour(jour)
    photos = [suffixe_photo(s["photo"], i + 1) for i, s in enumerate(sujets)]
    plans = []
    for i, s in enumerate(sujets):
        pl = {"photo": i + 1, "mouv": MOUVEMENTS[i % len(MOUVEMENTS)]}
        if i > 0:
            pl |= {"texte": s["nom"], "sous": s["sous"]}
        plans.append(pl)
    utm = utm_de(cle)
    table = {i + 1: ph for i, ph in enumerate(photos)}

    def resoudre(_cle: str, rang: int):
        ph = table[rang]
        return telecharger(ph, 3840), {"auteur": ph["auteur"], "licence": ph["licence"], "source": ph["source"],
                                       "titre": ph["titre"]}

    r_def = {"cle": utm, "photos": "editeur", "lieu": puce, "accroche": accroche, "musique": m["fichier"],
             "lien": lien, "cta": "", "plans": plans, "fin": {"texte": fin}, "description": "", "hashtags": []}
    ordre = "Dans l'ordre de la vidéo : " + " · ".join(f"{s['nom']} ({s['sous']})" for s in sujets) + "."
    texte = composer("📍", titre, gabarit("mg-titre-reel"), emoji, [para_intro, ordre], gabarit(gid_q, nom=nom_q)
                     if "{nom}" in GABARITS_MG[gid_q][0] else gabarit(gid_q), cta,
                     lien_complet(lien, utm, reel=True), photos, tags, musique=credit_musique(m))
    sources = {"sujets": " · ".join(f"{s['nom']} ({s['lien']})" for s in sujets) + f" — Supabase, lu le {horodatage()}",
               "photos": "couvertures libres de la base, auteur et licence relus sur Commons",
               "musique": f"{m['fichier']} — {m['licence']}"}
    return Pub(cle=cle, type=type_, lien=lien, texte=texte, images=[], photos=photos, sources=sources,
               gabarits=["mg-titre-reel", gid_q], reel=True, reel_def=r_def, resolveur=resoudre, chiffres={})


@functools.lru_cache(maxsize=1)
def pages_regions() -> dict:
    return {x["name_fr"]: x["slug"] for x in rest("places", {"select": "slug,name_fr", "kind": "eq.region",
                                                             "merged_into": "is.null"})}


def construire_reel_region(cle_base: str, d: dict, nature: str, jour: date, interdites: set,
                           registre: Registre | None = None, horizon: int = HORIZON_POSTS) -> Pub | None:
    region = d["region"]
    rang = 1 + (registre.prefixe_regions(cle_base + ":") if registre else 0)
    cle = f"{cle_base}:{rang}"
    sujets = [s for s in sujets_visuels() if s["region"] == region]
    # les couvertures dont les publications de 00:00 et 18:00 ont besoin ne partent pas en reel
    faites = frozenset(c for c in (registre.cles if registre else ()) if not c.startswith("diako:reel:"))
    valables = _photos_valables(sujets, interdites | reservees_aux_posts(faites, horizon), MINI_REEL)
    # les sites (parcs, cascades, plages, patrimoine) avant les villes et les villages, puis la plus grande photo
    rang_genre = {"réserve": 0, "parc": 0, "cascade": 0, "plage": 0, "île": 0, "site patrimonial": 1, "sommet": 1,
                  "grotte": 1, "point de vue": 1, "aire protégée": 0, "zone touristique": 1, "site": 2, "ville": 3}
    valables.sort(key=lambda s: (rang_genre.get(s["genre"], 4),
                                 -(s["photo"]["largeur"] * s["photo"]["hauteur"]), s["lien"]))
    choisis = valables[:5]
    if len(choisis) < 4:
        return None
    for s in choisis:
        s["sous"] = s["genre"] + (f" · {s['pres']}" if s.get("pres") and s["pres"] != s["nom"] else "")
    page_region = pages_regions().get(region)
    lien = f"/lieu/{page_region}" if page_region else choisis[0]["lien"]
    cta = f"La région {region} sur Diako" if page_region else f"{choisis[0]['nom']} sur Diako"
    n = len(choisis)
    # le titre nomme les lieux : deux reels de la même région ne commencent jamais pareil
    pub = construire_reel_liste(
        cle, choisis, accroche=(f"{region} en {n} lieux" if rang == 1 else f"{region}, encore {n} lieux"),
        puce=choisis[0]["nom"], fin="Ces lieux ont leur fiche<br>sur",
        titre=f"{choisis[0]['nom']}, {choisis[1]['nom']}… la région {region} en {n} lieux",
        gid_q="mg-q-reel-region", nom_q=region, emoji="🎬", lien=lien, cta=cta,
        tags=hashtags(region, "Madagascar"), type_="reel-region", jour=jour,
        para_intro=f"{len(choisis)} lieux de la région {region}, en photos libres de Wikimedia Commons. "
                   f"Lequel connaissez-vous ? 🎬")
    pub["region"] = region
    return pub


def candidats_reel_plats() -> list[tuple[str, dict]]:
    return [("diako:reel:plats", {})]


def construire_reel_plats(cle_base: str, d: dict, nature: str, jour: date, interdites: set,
                          registre: Registre | None = None) -> Pub | None:
    rang = 1 + (registre.prefixe_regions(cle_base + ":") if registre else 0)
    cle = f"{cle_base}:{rang}"
    sujets = []
    for _, p in candidats_plat():
        ph = photo_du_plat(p, interdites, MINI_REEL)
        if ph:
            sujets.append({"nom": p["name_fr"].strip(), "sous": (p.get("name_mg") or "").strip() or "cuisine malgache",
                           "photo": ph, "lien": f"/plat/{p['slug']}"})
    vus, choisis = set(), []
    for s in sujets:
        if s["photo"]["cle_photo"] not in vus:
            vus.add(s["photo"]["cle_photo"])
            choisis.append(s)
        if len(choisis) == 5:
            break
    if len(choisis) < 5:
        return None
    return construire_reel_liste(
        cle, choisis, accroche="5 plats malgaches à goûter", puce="Cuisine malgache",
        fin="Ces plats ont leur fiche<br>sur",
        titre=f"{choisis[0]['nom']}, {choisis[1]['nom']}… 5 plats malgaches à goûter", gid_q="mg-q-reel-plats",
        nom_q="", emoji="😋", lien="/plats", cta="Tous les plats malgaches sur Diako",
        tags=hashtags("CuisineMalgache", "Sakafo"), type_="reel-plats", jour=jour,
        para_intro="Cinq plats de la cuisine malgache, en photos libres de Wikimedia Commons. 😋")


# ───────────────────────── choix du contenu ─────────────────────────

FAMILLES = {
    "evenement": (candidats_evenement, construire_evenement),
    "plat": (candidats_plat, construire_plat),
    "site": (candidats_site, construire_site),
    "ville": (candidats_ville, construire_ville),
    "lieu": (candidats_lieu, construire_lieu),
    "site-album": (candidats_site, construire_site_album),
    "reel-lieu": (candidats_reel_lieu, construire_reel_lieu),
    "reel-region": (candidats_reel_region, construire_reel_region),
    "reel-plats": (candidats_reel_plats, construire_reel_plats),
    # banc du 28/10 : avec la réserve de 30, les 20:00 du 02/12 et du 03/12 restaient vides (code 2 =
    # créneau laissé vide par l'éditeur) ; ce recours ne garde que les 10 prochains sujets de posts
    "reel-region-serre": (candidats_reel_region, functools.partial(construire_reel_region, horizon=HORIZON_SERRE)),
}


def tourner(base: list[str], jour: date) -> list[str]:
    k = jour.toordinal() % len(base)
    return base[k:] + base[:k]


def ordre_familles(nature: str, heure: str, jour: date) -> list[str]:
    if nature == "photo" or (nature == "album" and heure < "12:00"):
        return tourner(["evenement", "plat", "site"], jour) + ["lieu"]
    if nature == "album":
        return tourner(["ville", "lieu"], jour) + ["site-album"]
    if nature == "reel":
        # le reel « plats » prend 5 photos de plats d'un coup : en dernier recours seulement
        return tourner(["reel-lieu", "reel-region"], jour) + ["reel-plats", "reel-region-serre"]
    raise Rien(f"nature « {nature} » non prise en charge par la page Di'ako (photo, album, reel)")


REPORTS_MAX = 3


def choisir(nature: str, heure: str, jour: date, registre: Registre) -> Pub:
    raisons = []
    # Rendu du 28/10 : ville d'Antananarivo à 18:00, Rova d'Antananarivo à 20:00, Analamanga le lendemain.
    # Une région montrée la veille, le jour même ou le lendemain passe après les autres (REPORTS_MAX
    # sujets de plus essayés au plus) ; si la famille n'a rien d'autre, elle reste permise.
    proches = registre.regions_proches(jour)
    for fam in ordre_familles(nature, heure, jour):
        cands, construire = FAMILLES[fam]
        reel = fam.startswith("reel")
        interdites = registre.photos_interdites(reel)
        vus = 0
        liste = cands(jour) if fam == "evenement" else cands()
        if fam.startswith("reel-region"):   # la région la moins montrée d'abord, pas toutes les vidéos d'une même région
            liste = sorted(liste, key=lambda cs: (cs[1]["region"] in proches,
                                                  registre.prefixe_regions(cs[0] + ":"), cs[0]))
        repli, reports = None, 0
        for cle, sujet in liste:
            if fam.startswith("reel-region") or fam == "reel-plats":
                pub = construire(cle, sujet, nature, jour, interdites, registre)
            else:
                if cle in registre.cles:
                    continue
                pub = construire(cle, sujet, nature, jour, interdites)
            vus += 1
            if pub and pub["cle"] not in registre.cles:
                pub["famille"] = fam
                if pub.get("region") not in proches:
                    return pub
                repli = repli or pub
                reports += 1
                if reports > REPORTS_MAX:
                    break
        if repli:
            return repli
        raisons.append(f"{fam} : vivier épuisé ({vus} essayé(s))")
    raise Rien("rien de juste pour ce créneau — " + " ; ".join(raisons))


# ───────────────────────── gardes ─────────────────────────

def gardes_texte(pub: Pub, registre: Registre) -> list[str]:
    t = pub["texte"]
    erreurs = []
    if t.split(" ", 1)[0] not in ICONES:
        erreurs.append("le texte ne commence pas par l'icône de sa rubrique")
    if f"{SITE}/" not in t:
        erreurs.append("aucun lien vers diako.fonenako.mg")
    if f"utm_content={utm_de(pub['cle'])}" not in t:
        erreurs.append("utm_content absent ou faux")
    if TEL.search(t):
        erreurs.append(f"numéro de téléphone : {TEL.search(t).group(0)}")
    if MAIL.search(t):
        erreurs.append(f"adresse mail : {MAIL.search(t).group(0)}")
    der = t.splitlines()[-1].split()
    if not der or der[0] != "#Diako" or len(der) != 5 or not all(h.startswith("#") for h in der):
        erreurs.append("la dernière ligne doit porter 5 hashtags, #Diako en tête")
    if re.search(r"\{[^}]*\}", t):
        erreurs.append("gabarit non rempli dans le texte")
    if not 300 <= len(t) <= 2000:
        erreurs.append(f"longueur {len(t)} hors de 300 à 2 000 caractères")
    q = next((l for l in t.splitlines() if l.startswith("🙋")), "")
    if q[2:].strip().startswith("Efa ") and " ve " not in q:
        erreurs.append("question fermée malgache sans « ve »")
    for autre in registre.textes:
        if autre and len(os.path.commonprefix([t, autre])) >= 60:
            erreurs.append("commence comme une publication déjà faite (60 caractères)")
            break
    for ph in pub["photos"]:
        if not (ph.get("auteur") or "").strip() or not (ph.get("licence") or "").strip():
            erreurs.append(f"photo {ph.get('titre')} sans auteur ou licence")
    cps = [ph["cle_photo"] for ph in pub["photos"]]
    if len(cps) != len(set(cps)):
        erreurs.append("une photo deux fois dans la même publication")
    interdites = registre.photos_interdites(pub["reel"])
    reprises = [c for c in cps if c in interdites]
    if reprises:
        erreurs.append(f"photo déjà employée : {reprises}")
    if pub["cle"] in registre.cles:
        erreurs.append(f"clé déjà publiée : {pub['cle']}")
    return erreurs


def passer_verifier(sortie: Path, medias: list[str], pub: Pub, jour: date) -> str:
    """verifier.py en SOUS-PROCESSUS (il lit sys.argv à l'import), sur une copie au format de l'atelier."""
    tmp = Path(tempfile.mkdtemp(prefix="verif-diako-"))
    try:
        d = tmp / f"{jour.isoformat()}-{utm_de(pub['cle'])}"
        d.mkdir()
        for k, m in enumerate(medias):
            shutil.copyfile(sortie / m, d / ("affiche-fil.png" if k == 0 else f"fil-{k + 1}.png"))
        (d / "brouillon.txt").write_text(pub["texte"] + "\n", encoding="utf-8")
        (d / "fiche.json").write_text(json.dumps({"photos": [
            {"rang": ph["rang"], "auteur": ph["auteur"], "licence": ph["licence"], "source": ph["source"]}
            for ph in pub["photos"]]}, ensure_ascii=False), encoding="utf-8")
        r = subprocess.run([sys.executable, str(ICI / "verifier.py"), "--sortie", str(tmp)], capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=300)
        sortie_txt = (r.stdout or "") + (r.stderr or "")
        if r.returncode != 0:
            raise Refus("verifier.py refuse :\n" + sortie_txt.strip()[-1500:])
        ligne = next((l for l in sortie_txt.splitlines() if l.startswith(("OK", "ALERTE"))), "OK")
        return ligne.split()[0] + (" (" + ligne.split("img", 1)[-1].strip() + ")" if "ALERTE" in ligne else "")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def sonder_mp4(f: Path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", str(f)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise Refus(f"ffprobe illisible sur {f.name} : {r.stderr[-300:]}")
    d = json.loads(r.stdout)
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), {})
    return {"video": v.get("codec_name"), "largeur": v.get("width"), "hauteur": v.get("height"),
            "audio": a.get("codec_name"), "duree": float((d.get("format") or {}).get("duration") or 0)}


# ───────────────────────── rendu ─────────────────────────

def avec_fichier(ph: dict) -> dict:
    return {**ph, "fichier": telecharger(ph, 2000)}


def rendre_images(pub: Pub, sortie: Path) -> list[str]:
    from playwright.sync_api import sync_playwright
    logo = f1.b64_logo()
    total = len(pub["images"])
    noms = []
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        for i, spec in enumerate(pub["images"], 1):
            sorte, p = spec[0], spec[1]
            if sorte == "affiche_photo":
                html, att = f2.html_affiche_photo(p, avec_fichier(spec[2]), logo), 300
            elif sorte == "affiche_typo":
                html, att = f2.html_affiche_typo(p, logo), 400
            elif sorte == "affiche_mot":
                html, att = f3.html_affiche_mot(p, spec[2], logo), 400
            elif sorte == "carte":
                html, att = f2.html_carte(p, spec[2], i, total, logo), 300
            elif sorte == "sens":
                html, att = f3.html_carte_sens(p, spec[2], i, total, logo), 300
            elif sorte == "noms":
                html, att = f3.html_carte_noms(p, spec[2], spec[3], i, total, logo), 300
            elif sorte == "chiffres":
                html, att = f3.html_carte_chiffres(p, spec[2], i, total, logo), 300
            elif sorte == "suite":
                html, att = f2.html_photo_suite(p, avec_fichier(spec[2]), i, total, logo), 200
            else:
                raise Refus(f"sorte d'image inconnue : {sorte}")
            dest = sortie / f"{i}.png"
            f2.rendre(page, html, dest, att)
            noms.append(dest.name)
        nav.close()
    from PIL import Image
    for n in noms:
        with Image.open(sortie / n) as im:
            if im.size != (1080, 1350):
                raise Refus(f"{n} mesure {im.size}, attendu 1080×1350")
    return noms


def rendre_reel(pub: Pub, sortie: Path) -> tuple[str, dict]:
    import reel as R  # noqa: E402
    tmp = Path(tempfile.mkdtemp(prefix="reel-diako-"))
    anciens = (R.SORTIE, R.TRAVAIL, R.photo_hd)
    R.SORTIE, R.TRAVAIL = tmp / "sortie", tmp / "travail"
    if pub.get("resolveur"):
        R.photo_hd = pub["resolveur"]
    try:
        dest = R.fabriquer(pub["reel_def"], False)        # musique seule : une voix malgache s'écoute d'abord
    except SystemExit as e:
        raise Refus(f"reel.py a refusé : {e}") from None
    finally:
        R.SORTIE, R.TRAVAIL, R.photo_hd = anciens
    final = sortie / "reel.mp4"
    shutil.move(str(dest), final)
    shutil.rmtree(tmp, ignore_errors=True)
    info = sonder_mp4(final)
    if info["video"] != "h264" or (info["largeur"], info["hauteur"]) != (1080, 1920):
        raise Refus(f"reel : {info} — attendu H.264 1080×1920")
    if info["audio"] != "aac":
        raise Refus("reel sans piste son AAC")
    if not 5 <= info["duree"] <= 90:
        raise Refus(f"reel de {info['duree']:.1f} s (5 à 90 s)")
    return final.name, info


# ───────────────────────── commandes ─────────────────────────

def lire_quand(jour: str, heure: str) -> datetime:
    try:
        return datetime.fromisoformat(f"{jour}T{heure}").replace(tzinfo=TZ)
    except ValueError:
        raise Refus(f"date ou heure illisible : {jour} {heure}") from None


def fabriquer(a: argparse.Namespace) -> int:
    verifier_gabarits()
    jour = date.fromisoformat(a.jour)
    sortie_dt = lire_quand(a.jour, a.heure)
    quand = (datetime.fromisoformat(a.maintenant).replace(tzinfo=TZ) if a.maintenant else maintenant_reel())
    if sortie_dt <= quand:
        raise Refus(f"le créneau {a.jour} {a.heure} est déjà passé (maintenant = {quand:%Y-%m-%d %H:%M})")
    sortie = Path(a.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    if any(sortie.iterdir()):
        raise Refus(f"--sortie n'est pas vide : {sortie}")
    try:
        return _fabriquer(a, jour, sortie_dt, quand, sortie)
    except BaseException:
        # le dossier était vide au départ : rien de ce qu'il contient ne doit faire croire à une publication
        for x in sortie.iterdir():
            if x.is_file():
                x.unlink(missing_ok=True)
            else:
                shutil.rmtree(x, ignore_errors=True)
        raise


def _fabriquer(a: argparse.Namespace, jour: date, sortie_dt: datetime, quand: datetime, sortie: Path) -> int:
    registre = Registre(charger_deja(a.deja), fiches_voisines(sortie))
    pub = choisir(a.nature, a.heure, jour, registre)
    erreurs = gardes_texte(pub, registre)
    if erreurs:
        raise Refus(f"{pub['cle']} : " + " ; ".join(erreurs))
    controles = [f"clé jamais employée sur la page ({len(registre.cles)} au registre) : OK",
                 f"photos jamais employées ({len(pub['photos'])}) : OK",
                 "texte (icône, lien, utm, 5 hashtags, sans téléphone ni mail, « ve », début distinct) : OK",
                 "gabarits malgaches (alphabet, « ve ») : OK"]
    ecart_h = (sortie_dt - quand).total_seconds() / 3600
    if ecart_h > 30:
        controles.append(f"⚠ fabriqué {ecart_h:.0f} h avant la sortie (contrat : 30 h au plus)")
    if pub["reel"]:
        medias = ["reel.mp4"]
        if not a.sans_rendu:
            nom, info = rendre_reel(pub, sortie)
            controles.append(f"reel {info['largeur']}×{info['hauteur']} {info['video']} + {info['audio']}, "
                             f"{info['duree']:.1f} s : OK")
    else:
        medias = [f"{i}.png" for i in range(1, len(pub["images"]) + 1)]
        if not a.sans_rendu:
            medias = rendre_images(pub, sortie)
            controles.append(f"{len(medias)} image(s) 1080×1350 : OK")
            controles.append("verifier.py : " + passer_verifier(sortie, medias, pub, jour))
    if a.sans_rendu:
        controles.append("sans rendu : images et vidéo non fabriquées (noms prévus)")
    fiche = {
        "page": PAGE, "jour": a.jour, "heure": a.heure, "nature": a.nature, "cle": pub["cle"],
        "texte": pub["texte"], "titre": None, "medias": medias,
        "donnees_lues_le": LU_LE.isoformat(), "sources": pub["sources"], "controles": controles,
        "gabarits_mg": pub["gabarits"],
        # propres à ce fournisseur : de quoi garder « une photo, une publication » d'un créneau à l'autre
        "famille": pub["famille"], "lien": pub["lien"], "fabrique_pour": quand.isoformat(),
        "photos": [{"rang": ph.get("rang"), "titre": ph["titre"], "auteur": ph["auteur"], "licence": ph["licence"],
                    "source": ph["source"]} for ph in pub["photos"]],
        "chiffres": pub.get("chiffres") or {}, "sans_rendu": bool(a.sans_rendu),
        "region": pub.get("region"),
    }
    _ecrire_json(sortie / "fiche.json", fiche)
    print(f"{a.jour} {a.heure} {a.nature:6} {pub['famille']:12} {pub['cle']}  ({len(medias)} média(s))")
    return 0


def controler(a: argparse.Namespace) -> int:
    texte = Path(a.texte_fichier).read_text(encoding="utf-8")
    m = re.search(r"utm_content=([\w-]+)", texte)
    if not m:
        print("utm_content absent : je ne sais pas de quelle publication il s'agit")
        return 4
    cle = cle_de_utm(m.group(1))
    quand = datetime.fromisoformat(a.quand).replace(tzinfo=TZ)
    jour = quand.date()
    morceaux = cle.split(":")
    if len(morceaux) < 3 or morceaux[0] != PAGE:
        print(f"clé inconnue : {cle}")
        return 4
    sorte = morceaux[1]
    try:
        if sorte == "reel":
            print("reel : le texte ne porte aucun chiffre périssable")
            return 0
        if sorte == "evenement":
            e = next((x for x in evenements() if slug_sur(x["slug"]) == morceaux[2]), None)
            if not e:
                print("l'événement n'est plus publié dans la base")
                return 3
            raison = evenement_admis(e, jour)
            if raison:
                print(f"l'événement n'est plus juste le {jour} : {raison}")
                return 3
            return 0
        fam = {"plat": "plat", "site": "site", "ville": "ville", "lieu": "lieu"}.get(sorte)
        if not fam:
            print(f"sorte inconnue : {sorte}")
            return 4
        cands, construire = FAMILLES[fam]
        sujet = next((s for c, s in cands() if c == cle), None)
        if sujet is None:
            print("le sujet n'est plus dans la base (ou plus publié)")
            return 3
        pub = construire(cle, sujet, "photo", jour, set())
        if pub is None:
            print("le sujet ne remplit plus les conditions de publication")
            return 3
    except Refus as e:
        print(f"lecture impossible : {e}")
        return 4

    def nombres(t: str) -> list[int]:
        corps = "\n".join(l for l in t.splitlines() if not l.startswith(("👉", "#", "📷", "🎵")))
        corps = re.sub(r"relevé le [\d/]+ à [\d:]+", "", corps)
        return [int(x.replace(" ", "")) for x in re.findall(r"(?<![\d/:])\d{1,3}(?: \d{3})*(?![\d/:])", corps)]

    ancien, neuf = nombres(texte), nombres(pub["texte"])
    if len(ancien) != len(neuf):
        print(f"les chiffres ont changé de forme : {ancien} -> {neuf}")
        return 3
    for x, y in zip(ancien, neuf):
        if abs(x - y) > max(1, round(0.10 * max(x, y))):
            print(f"chiffre périmé : {x} dans le texte, {y} dans la base aujourd'hui")
            return 3
    print("juste : " + (", ".join(f"{x}->{y}" for x, y in zip(ancien, neuf)) or "aucun chiffre"))
    return 0


def planche(a: argparse.Namespace) -> int:
    """Planches contact des photos que l'éditeur pourrait employer, pour les regarder."""
    from PIL import Image, ImageDraw, ImageFont
    sortie = Path(a.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    sujets = [{"nom": s["nom"], "source": s["source"], "groupe": s["region"]} for s in sujets_visuels()]
    sujets += [{"nom": d["name_fr"], "source": d["photo_source"], "groupe": "plats"} for d in plats()
               if d.get("photo_source")]
    sujets += [{"nom": e["title"], "source": e["poster_source"], "groupe": "événements"} for e in evenements()
               if e.get("poster_source")]
    titres = [titre_commons(s["source"] or "") for s in sujets]
    infos = infos_photos([t for t in titres if t])
    bons = []
    for s, t in zip(sujets, titres):
        ph, _ = photo_depuis(s["source"], infos.get(t), MINI_POST) if t else (None, "")
        if ph:
            bons.append({**s, **ph})
    bons.sort(key=lambda s: (s["groupe"], s["nom"]))
    W, H, COL, PAR = 256, 230, 5, 30
    index = []
    try:
        police = ImageFont.truetype("arial.ttf", 13)
    except OSError:
        police = ImageFont.load_default()
    for k in range(0, len(bons), PAR):
        lot = bons[k:k + PAR]
        feuille = Image.new("RGB", (COL * W, ((len(lot) + COL - 1) // COL) * H), "white")
        d = ImageDraw.Draw(feuille)
        for i, s in enumerate(lot):
            n = k + i + 1
            vign = CACHE / "vignettes" / (hashlib.sha1(s["titre"].encode()).hexdigest()[:16] + ".jpg")
            if not vign.exists():
                vign.parent.mkdir(parents=True, exist_ok=True)
                r = commons.api({"action": "query", "titles": s["titre"], "prop": "imageinfo", "iiprop": "url",
                                 "iiurlwidth": 320})
                url = r["query"]["pages"][0]["imageinfo"][0].get("thumburl")
                vign.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=commons.UA),
                                                        timeout=60).read())
            with Image.open(vign) as im:
                im = im.convert("RGB")
                im.thumbnail((W - 6, H - 40))
                x, y = (i % COL) * W, (i // COL) * H
                feuille.paste(im, (x + (W - im.width) // 2, y + 2))
            d.text((x + 3, y + H - 36), f"{n}. {s['nom'][:30]}", fill="black", font=police)
            d.text((x + 3, y + H - 19), f"{s['groupe'][:16]} · {s['largeur']}px", fill="#555", font=police)
            index.append({"n": n, "nom": s["nom"], "groupe": s["groupe"], "cle_photo": s["cle_photo"],
                          "titre": s["titre"]})
        feuille.save(sortie / f"planche-{k // PAR + 1:02d}.jpg", quality=72)
    _ecrire_json(sortie / "planche.json", index)
    print(f"{len(bons)} photos, {(len(bons) + PAR - 1) // PAR} planche(s) dans {sortie}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fournisseur Di'ako de l'éditeur du jour (lecture seule).")
    sous = ap.add_subparsers(dest="commande", required=True)
    f = sous.add_parser("fabriquer")
    f.add_argument("--jour", required=True)
    f.add_argument("--heure", required=True)
    f.add_argument("--nature", required=True, choices=["photo", "album", "video", "reel", "texte"])
    f.add_argument("--sortie", required=True)
    f.add_argument("--deja", required=False)
    f.add_argument("--maintenant")
    f.add_argument("--sans-rendu", action="store_true")
    c = sous.add_parser("controler")
    c.add_argument("--texte-fichier", required=True)
    c.add_argument("--quand", required=True)
    pl = sous.add_parser("planche")
    pl.add_argument("--sortie", required=True)
    a = ap.parse_args(argv)
    try:
        if a.commande == "fabriquer":
            return fabriquer(a)
        if a.commande == "controler":
            return controler(a)
        return planche(a)
    except Rien as e:
        print(f"RIEN : {e}", file=sys.stderr)
        return 2
    except Refus as e:
        print(f"REFUS : {e}", file=sys.stderr)
        return 1 if a.commande != "controler" else 4
    except SystemExit as e:                 # fabriquer3.remplir() et reel.py refusent par SystemExit
        print(f"REFUS : {e}", file=sys.stderr)
        return 1 if a.commande != "controler" else 4
    except Exception:  # noqa: BLE001 — toute erreur imprévue est un refus, jamais un succès muet
        traceback.print_exc()
        return 1 if a.commande != "controler" else 4


if __name__ == "__main__":
    sys.exit(main())
