"""Lecture d'une publication Facebook -> champs Diako.

Rien n'est deviné ici : chaque champ non trouvé reste None et se voit dans
l'interface. C'est la règle n° 1 du projet — **aucune donnée inventée**, pas
même « pour l'exemple ». Un prix plausible mais faux coûte plus cher qu'une
case vide, parce que personne ne vient le corriger.

Deux passes complètent celle-ci :
  - `analyse_llm.py` relit ce que les règles ne savent pas juger (nom d'un
    établissement noyé dans une phrase, plats d'une carte photographiée) ;
  - `diako.py` rapproche les noms trouvés du référentiel réel.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta

# ── Téléphones ──────────────────────────────────────────────────────────────
# Mobiles malgaches : 032 (Orange) 033 (Airtel) 034/038 (Telma) 037 (Blueline).
MOTIF_TEL = re.compile(r"(?:\+?261|0)\s*[-.–]?\s*3[2-9](?:\s*[-.–]?\s*\d){7}")


def sans_accent(texte: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texte or "")
        if unicodedata.category(c) != "Mn"
    ).lower()


def _formater_tel(brut: str) -> str:
    chiffres = re.sub(r"\D", "", brut)
    if chiffres.startswith("261"):
        chiffres = "0" + chiffres[3:]
    if len(chiffres) == 9 and not chiffres.startswith("0"):
        chiffres = "0" + chiffres
    if len(chiffres) != 10:
        return chiffres
    return f"{chiffres[:3]} {chiffres[3:5]} {chiffres[5:8]} {chiffres[8:]}"


def telephones(texte: str) -> list[str]:
    vus, sortie = set(), []
    for m in MOTIF_TEL.finditer(texte):
        numero = _formater_tel(m.group(0))
        if len(re.sub(r"\D", "", numero)) == 10 and numero not in vus:
            vus.add(numero)
            sortie.append(numero)
    return sortie


def whatsapp(texte: str) -> str | None:
    """Le numéro présenté comme WhatsApp, quand le texte le dit."""
    n = sans_accent(texte)
    for m in re.finditer(r"(whatsapp|wa|watsap)[^\d+]{0,20}((?:\+?261|0)[\d\s.\-]{8,14})", n):
        formate = _formater_tel(m.group(2))
        if len(re.sub(r"\D", "", formate)) == 10:
            return formate
    return None


def liens(texte: str) -> dict:
    """Site web et page Facebook cités dans le texte."""
    sortie = {"site_web": None, "page_facebook": None}
    for m in re.finditer(r"(?:https?://)?(?:www\.)?([\w.-]+\.[a-z]{2,})(/[^\s)]*)?", texte, re.I):
        url = m.group(0)
        hote = m.group(1).lower()
        if hote.endswith(("facebook.com", "fb.com", "fb.me")):
            if not sortie["page_facebook"]:
                sortie["page_facebook"] = url if url.startswith("http") else "https://" + url
        elif hote.split(".")[-1] in ("mg", "com", "net", "org", "fr", "io") \
                and not hote.endswith(("instagram.com", "tiktok.com", "youtube.com")):
            if not sortie["site_web"]:
                sortie["site_web"] = url if url.startswith("http") else "https://" + url
    return sortie


def email(texte: str) -> str | None:
    trouve = re.search(r"[\w.+-]+@[\w-]+\.[\w.]{2,}", texte)
    return trouve.group(0) if trouve else None


# ── Montants ────────────────────────────────────────────────────────────────
MULTIPLICATEURS = {
    "million": 1_000_000, "millions": 1_000_000, "tapitrisa": 1_000_000,
    "mille": 1_000, "arivo": 1_000, "k": 1_000,
}
# ⚠ CES MOTS DÉCIDENT DE L'UNITÉ, et l'unité change tout : 80 000 Ar la nuit et
#   80 000 Ar le plat ne décrivent pas le même établissement.
UNITES = [
    ("nuit", r"nuit|nuitee|nuitées?|par nuit|/ ?nuit|la nuit|alina"),
    ("personne", r"par personne|/ ?pers|par pers\b|pax|olona|isaky ny olona"),
    ("plat", r"le plat|par plat|/ ?plat|assiette|portion|sakafo"),
    ("jour", r"par jour|/ ?jour|la journee|journee"),
    ("circuit", r"le circuit|par circuit|le sejour|forfait"),
]

MOTIF_MONTANT = re.compile(
    r"(?P<nombre>\d[\d\s.,  ]*\d|\d)\s*"
    r"(?P<mult>millions?|mille|tapitrisa|arivo|k)?\s*"
    r"(?P<devise>ariary|ariari|\bar\b|\bmga\b|€|euros?|\$|usd)",
    re.I,
)


def _nombre(brut: str) -> float | None:
    brut = brut.replace(" ", " ").replace(" ", " ").strip()
    if re.fullmatch(r"\d{1,3}[.,]\d{1,2}", brut):
        return float(brut.replace(",", "."))
    chiffres = re.sub(r"[^\d]", "", brut)
    return float(chiffres) if chiffres else None


def montants(texte: str) -> list[dict]:
    """Tous les montants en ariary trouvés, avec leur unité et leur contexte.

    ⚠ ON EFFACE D'ABORD LES NUMÉROS DE TÉLÉPHONE. « 034 12 345 67 » ressemble
      énormément à un prix, et c'est l'erreur qui produit des tarifs absurdes.
    """
    propre = MOTIF_TEL.sub(" ", texte)
    normalise = sans_accent(propre)
    trouves = []
    for m in MOTIF_MONTANT.finditer(normalise):
        valeur = _nombre(m.group("nombre"))
        if valeur is None:
            continue
        mult = (m.group("mult") or "").lower()
        if mult == "k" and valeur >= 1000:   # « 15000k » est du bruit
            mult = ""
        valeur *= MULTIPLICATEURS.get(mult, 1)
        devise = m.group("devise").lower()
        if devise in ("€", "euro", "euros"):
            continue   # une devise étrangère se vérifie à la main, on ne convertit pas
        if devise in ("$", "usd"):
            continue
        if valeur < 200:                      # « 5 Ar » n'existe pas
            continue
        avant = normalise[max(0, m.start() - 70):m.start()]
        apres = normalise[m.end():m.end() + 40]
        unite = None
        for code, motif in UNITES:
            if re.search(motif, apres) or re.search(motif, avant[-45:]):
                unite = code
                break
        trouves.append({
            "montant": int(round(valeur)), "unite": unite,
            "avant": avant.strip()[-60:], "position": m.start(),
        })
    return trouves


def prix_principal(texte: str, categories: list[str]) -> dict | None:
    """Le prix d'appel d'un établissement : le plus BAS, pas le plus haut.

    ⚠ Sur Diako, `price_min_ar` répond à « un hôtel à moins de 120 000 Ar la
      nuit à Majunga ». Prendre le plus gros montant d'une publication (la
      suite au lieu de la chambre simple) fausserait tous les filtres budget.
    """
    unite_voulue = "nuit" if "hotel" in categories else (
        "plat" if "restaurant" in categories else None)
    liste = [m for m in montants(texte) if m["montant"] >= 500]
    if not liste:
        return None
    avec_unite = [m for m in liste if m["unite"] == unite_voulue] if unite_voulue else []
    retenus = avec_unite or [m for m in liste if m["unite"]] or liste
    choisi = min(retenus, key=lambda m: m["montant"])
    return {"montant": choisi["montant"], "unite": choisi["unite"] or unite_voulue}


# ── Catégories et nature de la trouvaille ───────────────────────────────────
MOTS_CATEGORIE = {
    "hotel": ("hotel", "hôtel", "bungalow", "lodge", "auberge", "chambre", "nuitee",
              "nuitée", "hebergement", "hébergement", "guest house", "ecolodge",
              "resort", "gite", "gîte", "pension", "dortoir", "camping"),
    "restaurant": ("restaurant", "resto", "gargote", "snack", "menu", "plat", "carte",
                   "cuisine", "sakafo", "brunch", "buffet", "pizzeria", "grillade",
                   "salon de the", "salon de thé", "patisserie", "pâtisserie",
                   "glacier", "bar", "brasserie", "hotely"),
    "agence_voyage": ("agence de voyage", "tour operator", "circuit", "sejour",
                      "séjour", "excursion organisee", "voyagiste"),
    "guide": ("guide touristique", "guide local", "mpitari-dalana"),
    "transporteur": ("transport", "taxi-brousse", "navette", "location de voiture"),
    "location_vehicule": ("location de voiture", "location 4x4", "louer une voiture",
                          "rent a car"),
    "site_attraction": ("parc national", "reserve", "réserve", "musee", "musée",
                        "cascade", "grotte", "tsingy", "lac", "plage", "point de vue",
                        "belvedere", "belvédère", "site touristique"),
    "organisateur_evenement": ("organisateur", "evenementiel", "événementiel"),
}

MOTS_EVENEMENT = (
    "festival", "concert", "soiree", "soirée", "spectacle", "animation", "edition",
    "édition", "programme", "billetterie", "billet", "entree libre", "entrée libre",
    "au programme", "rendez-vous", "vernissage", "exposition", "salon", "foire",
    "marche artisanal", "marché artisanal", "competition", "compétition", "course",
    "carnaval", "kermesse", "fete", "fête", "atelier", "conference", "conférence",
    "live", "dj", "after work", "afterwork", "reveillon", "réveillon",
)

MOTS_CARTE = (
    "menu du jour", "plat du jour", "notre menu", "notre carte", "la carte",
    "au menu", "formule", "entree plat dessert", "entrée plat dessert",
    "menu complet", "nos plats", "sakafo androany", "tarif", "menu", "carte",
)

MOTS_RECIT = (
    "j'ai teste", "j'ai testé", "on a mange", "on a mangé", "week-end", "weekend",
    "escapade", "sejour", "séjour", "voyage", "decouverte", "découverte",
    "je recommande", "je vous conseille", "decu", "déçu", "deception", "déception",
    "excellent", "delicieux", "délicieux", "coup de coeur", "coup de cœur",
    "mon avis", "notre avis", "retour d'experience", "vive", "magnifique",
    "paysage", "randonnee", "randonnée", "balade", "vakansy", "dia",
)

# Le pré-filtre du fil : large exprès. Le tri fin se fait sur le texte entier.
MOTS_TOURISME = MOTS_EVENEMENT + MOTS_RECIT + tuple(
    mot for mots in MOTS_CATEGORIE.values() for mot in mots
) + (
    "voyage", "tourisme", "madagascar", "nosy", "plage", "hotel", "restaurant",
    "ariary", "reservation", "réservation", "ouverture", "decouvrir", "découvrir",
    "visite", "circuit", "guide", "vacances", "vakansy", "tsangatsangana",
)

MOTS_HORS_SUJET = (
    "cherche un emploi", "offre d'emploi", "recrutement", "cv", "a vendre terrain",
    "location appartement", "vente voiture", "priere de", "rip", "condoleances",
    "condoléances", "perdu chien", "perdu chat", "arnaque", "police",
)


def parle_de_tourisme(texte: str, nb_photos: int = 0) -> bool:
    """Pré-filtre du fil, volontairement large.

    Le fil coupe les textes à « En voir plus » : sur 60 caractères, exiger deux
    mots-clés écarte de bonnes publications. Un seul suffit dès qu'il y a une
    photo — de toute façon la vraie sélection se fait ensuite, sur le texte
    entier et avec le rapprochement.
    """
    n = sans_accent(texte)
    if any(mot in n for mot in MOTS_HORS_SUJET):
        return False
    trouves = sum(1 for mot in MOTS_TOURISME if mot in n)
    return trouves >= 2 or (trouves >= 1 and nb_photos >= 1)


def categories(texte: str) -> list[str]:
    """Les catégories Diako reconnues. Un écolodge est hôtel ET restaurant."""
    n = sans_accent(texte)
    trouvees = []
    for code, mots in MOTS_CATEGORIE.items():
        if any(sans_accent(mot) in n for mot in mots):
            trouvees.append(code)
    return trouvees


def classer(texte: str, nb_photos: int, lignes_carte: list, dates: dict) -> str:
    """Nature de la trouvaille : etablissement | carte | evenement | recit.

    L'ordre des tests n'est pas cosmétique. Une carte de restaurant est
    d'abord une carte, même si elle nomme l'établissement ; un événement est
    d'abord un événement, même s'il se tient dans un hôtel. Le récit est le
    cas par défaut : c'est celui qui n'exige rien.
    """
    n = sans_accent(texte)
    cats = categories(texte)
    a_tel = bool(telephones(texte))

    # ① Une carte, c'est plusieurs plats CHIFFRÉS. Un seul prix ne fait pas
    #    une carte : c'est une promo, donc un récit ou une fiche.
    if len(lignes_carte) >= 3:
        return "carte"
    if len(lignes_carte) >= 2 and any(sans_accent(m) in n for m in MOTS_CARTE):
        return "carte"

    # ② Un événement a une DATE. Sans date, « festival » n'est qu'un souvenir.
    points_evt = sum(1 for m in MOTS_EVENEMENT if sans_accent(m) in n)
    if dates.get("debut") and points_evt >= 1:
        return "evenement"
    if points_evt >= 3 and dates.get("periode"):
        return "evenement"

    # ③ Un établissement se reconnaît à ce qu'il propose : une catégorie, un
    #    moyen de le joindre, et de quoi le situer.
    points_etab = sum(1 for m in ("ouverture", "nouveau", "vient d'ouvrir", "bienvenue",
                                  "reservation", "réservation", "nous sommes", "adresse",
                                  "situe", "situé", "contact", "infoline", "chambre",
                                  "nuitee", "nuitée", "disponible")
                      if sans_accent(m) in n)
    if cats and a_tel and points_etab >= 1:
        return "etablissement"
    if cats and points_etab >= 3:
        return "etablissement"

    # ④ Le reste est un récit : une photo, un avis, une mésaventure, un bon plan.
    return "recit"


def genre_de_post(texte: str) -> str:
    """`posts.kind` : recit | assiette | photo | bon_plan | avis | alerte.

    ⚠ Les valeurs viennent de la contrainte `posts_kind_check`. En inventer une
      fait échouer l'INSERT entier, pas seulement le champ.
    """
    n = sans_accent(texte)
    if any(m in n for m in ("attention", "prudence", "fermé", "ferme definitivement",
                            "annule", "annulé", "route coupee", "cyclone")):
        return "alerte"
    if any(m in n for m in ("bon plan", "promo", "reduction", "réduction", "moins cher",
                            "pas cher", "gratuit")):
        return "bon_plan"
    if any(m in n for m in ("mon avis", "notre avis", "je recommande", "decu", "déçu",
                            "deception", "note", "service", "accueil")):
        return "avis"
    if len(texte.strip()) < 140:
        # Une photo de plat a sa propre catégorie sur Diako : c'est le cœur du
        # « goût » dans « voyage, goût et exploration ».
        if any(m in n for m in ("plat", "assiette", "sakafo", "menu", "cuisine",
                                "delicieux", "miam", "gouter", "degustation")):
            return "assiette"
        return "photo"
    return "recit"


# ── Nom de l'établissement ──────────────────────────────────────────────────
BRUIT_NOM = re.compile(
    r"^(bonjour|bonsoir|salama|coucou|hello|attention|urgent|nouveau|nouveauté|"
    r"nouveaute|promo|info|infos|rappel|important|ouverture|ouvert|venez|"
    r"découvrez|decouvrez|voici|nouvelle adresse)\b\s*(?:de|du|des|à|a)?[\s:,!-]*",
    re.I,
)
PREFIXES_NOM = (
    "restaurant", "resto", "hotel", "hôtel", "lodge", "bungalow", "auberge",
    "snack", "bar", "pizzeria", "guest house", "ecolodge", "chez",
)


def nom_etablissement(texte: str, auteur_page: str | None = None) -> str | None:
    """Le nom de l'établissement dont parle la publication.

    Trois pistes, dans l'ordre de fiabilité :
      ① une page Facebook qui parle d'elle-même : son propre nom ;
      ② un nom précédé de son type — « Restaurant Sakamanga », « Chez Mariette » ;
      ③ la première ligne du texte quand elle est courte et sans verbe.

    ⚠ Le nom rendu ici n'est jamais publié tel quel : il sert à CHERCHER dans
      l'annuaire. C'est le rapprochement qui décide, et il se relit à l'écran.
    """
    if auteur_page:
        propre = auteur_page.strip()
        if 2 < len(propre) <= 60:
            return propre

    # ⚠ LE PRÉFIXE EST INSENSIBLE À LA CASSE, LE NOM NE L'EST PAS. « Chez
    #   Mariette » porte une majuscule au C ; un motif entièrement sensible à la
    #   casse le rate, et un motif entièrement insensible attrape « chez nous »
    #   ou « hotel de la ville ». D'où le drapeau porté par le seul préfixe.
    motif = re.compile(
        r"\b(?i:" + "|".join(re.escape(p) for p in PREFIXES_NOM) + r")\s+"
        r"(?P<nom>[A-ZÀ-Ý][\w'’\-]*(?:\s+[A-ZÀ-Ý0-9][\w'’\-]*){0,3})",
    )
    trouve = motif.search(texte)
    if trouve:
        return trouve.group(0).strip(" .,:;–-")

    premiere = BRUIT_NOM.sub("", texte.strip().split("\n")[0]).strip(" .,:;–-—…")
    if 2 < len(premiere) <= 55 and not re.search(
        r"\b(je|nous|on|vous|il|elle|c'est|voici|venez|regardez)\b", premiere, re.I
    ):
        mots = premiere.split()
        if 1 <= len(mots) <= 6 and sum(1 for m in mots if m[:1].isupper()) >= 1:
            return premiere
    return None


# ── Repère et adresse ───────────────────────────────────────────────────────
def repere(texte: str) -> str | None:
    """« en face de la station Jovenna, après le pont ».

    L'adressage normalisé n'existe pas à Madagascar : c'est ce repère qui
    permet réellement de trouver l'endroit. La colonne existe pour ça
    (`pages.landmark`), elle mérite d'être remplie.
    """
    motif = re.compile(
        r"((?:en face|face|a cote|à côté|pres de|près de|derriere|derrière|avant|apres|après|"
        r"au bout|sur la route|route de|non loin|a droite|à droite|a gauche|à gauche)"
        r"[^.\n]{5,90})", re.I
    )
    trouve = motif.search(texte)
    return trouve.group(1).strip(" .,;") if trouve else None


def adresse(texte: str) -> str | None:
    motif = re.compile(
        r"(?:adresse|adr|situe(?:e|es)? (?:a|à)|situé(?:e|es)? (?:a|à)|lot|bp)\s*[:\-]?\s*"
        r"([^\n]{6,110})", re.I
    )
    trouve = motif.search(texte)
    return trouve.group(1).strip(" .,;") if trouve else None


# ── Horaires ────────────────────────────────────────────────────────────────
def horaires(texte: str) -> str | None:
    """Horaires en texte libre. Le découpage jour par jour reste à la main.

    ⚠ On ne fabrique PAS de `page_hours` à partir d'une phrase : « ouvert tous
      les jours sauf le lundi midi » se transforme en sept lignes fausses une
      fois sur deux. Une phrase honnête vaut mieux qu'un tableau inventé.
    """
    # ⚠ « Ouverture de Chez Mariette à Ampefy » N'EST PAS UN HORAIRE. Le mot
    #   « ouverture » annonce aussi bien une inauguration qu'une plage horaire :
    #   sans preuve d'heure ou de jour dans la phrase, on ne retient rien. Vu en
    #   vrai sur la première publication d'essai, où l'horaire annoncé était le
    #   titre du message.
    preuve = re.compile(
        r"\d\s*h|\d{1,2}\s*[:h]\s*\d{2}|lundi|mardi|mercredi|jeudi|vendredi|samedi|"
        r"dimanche|tous les jours|7j/7|week-?end|midi|soir", re.I
    )
    for trouve in re.finditer(
        r"((?:ouvert|ouverture|horaires?|misokatra)[^.\n]{4,90})", texte, re.I
    ):
        phrase = trouve.group(1).strip(" .,;")
        if preuve.search(phrase):
            return phrase
    plage = re.search(
        r"\b(\d{1,2})\s*h(?:\s*\d{2})?\s*(?:a|à|-|–)\s*(\d{1,2})\s*h(?:\s*\d{2})?",
        texte, re.I,
    )
    return plage.group(0) if plage else None


# ── Équipements ─────────────────────────────────────────────────────────────
# Les codes viennent de la table `amenities` : les inventer les rendrait
# invisibles (clé étrangère sur page_amenities).
EQUIPEMENTS = {
    "wifi": ("wifi", "wi-fi", "internet", "fibre", "connexion"),
    "piscine": ("piscine", "dobo filomanosana"),
    "piscine-chauffee": ("piscine chauffee", "piscine chauffée"),
    "climatisation": ("climatisation", "climatise", "climatisé", "clim ", "aircon"),
    "eau-chaude": ("eau chaude", "rano mafana"),
    "moustiquaire": ("moustiquaire",),
    "parking": ("parking", "stationnement", "fiantsonana"),
    "parking-clos": ("parking clos", "parking securise", "parking sécurisé"),
    "restaurant-sur-place": ("restaurant sur place", "restaurant de l'hotel"),
    "bar": ("bar ", "cocktail"),
    "petit-dejeuner": ("petit dejeuner", "petit-déjeuner", "petit déjeuner", "breakfast"),
    "demi-pension": ("demi-pension", "demi pension"),
    "pension-complete": ("pension complete", "pension complète"),
    "livraison": ("livraison", "livrons", "delivery", "fanaterana"),
    "a-emporter": ("a emporter", "à emporter", "take away", "emporter"),
    "menu-vegetarien": ("vegetarien", "végétarien", "vegan"),
    "terrasse": ("terrasse",),
    "jardin": ("jardin", "zaridaina"),
    "vue-mer": ("vue mer", "vue sur mer", "face a la mer", "face à la mer"),
    "vue-lac": ("vue lac", "vue sur le lac"),
    "vue-montagne": ("vue montagne", "vue sur la montagne"),
    "plage-privee": ("plage privee", "plage privée"),
    "massage": ("massage", "spa "),
    "spa": ("spa",),
    "salle-sport": ("salle de sport", "fitness", "musculation"),
    "salle-reunion": ("salle de reunion", "salle de réunion", "seminaire", "séminaire"),
    "plongee": ("plongee", "plongée", "diving"),
    "masque-tuba": ("snorkeling", "masque et tuba", "palmes"),
    "kayak": ("kayak", "canoe", "canoë"),
    "peche": ("peche", "pêche", "fanjonoana"),
    "randonnee": ("randonnee", "randonnée", "trekking", "trek "),
    "quad": ("quad",),
    "vtt": ("vtt", "velo tout terrain", "vélo"),
    "equitation": ("equitation", "équitation", "cheval"),
    "observation-baleines": ("baleine", "trozona", "whale"),
    "excursion-bateau": ("excursion en bateau", "sortie en bateau", "pirogue", "boutre"),
    "guide": ("guide francophone", "guide local", "accompagnateur"),
    "navette-aeroport": ("navette", "transfert aeroport", "transfert aéroport"),
    "mobile-money": ("mobile money",),
    "mvola": ("mvola", "m-vola"),
    "orange-money": ("orange money",),
    "airtel-money": ("airtel money",),
    "carte-bancaire": ("carte bancaire", "visa", "mastercard", "cb accepte"),
    "groupe-electrogene": ("groupe electrogene", "groupe électrogène", "generateur"),
    "panneaux-solaires": ("panneau solaire", "panneaux solaires", "solaire"),
    "animaux": ("animaux acceptes", "animaux acceptés", "pet friendly"),
    "famille": ("famille", "enfants bienvenus", "adapte aux familles"),
    "tv": ("television", "télévision", "tv ", "canal+"),
    "ventilateur": ("ventilateur",),
    "gardien-nuit": ("gardien", "securite 24", "sécurité 24"),
    "reception-24h": ("24h/24", "24/24", "reception 24"),
    "sans-porc": ("sans porc", "halal"),
    "tennis": ("tennis",),
    "billard": ("billard",),
    "feu-de-camp": ("feu de camp", "bivouac"),
    "acces-4x4": ("4x4 necessaire", "4x4 nécessaire", "piste difficile"),
    "acces-bateau": ("accessible en bateau", "acces en bateau"),
}


def equipements(texte: str) -> list[str]:
    n = sans_accent(texte)
    return sorted({
        code for code, mots in EQUIPEMENTS.items()
        if any(sans_accent(mot) in n for mot in mots)
    })


# ── Lignes de carte ─────────────────────────────────────────────────────────
# Une ligne de carte, c'est un nom suivi d'un prix. Les séparateurs varient :
# « Ravitoto — 12 000 Ar », « Ravitoto : 12000ar », « Ravitoto ....... 12 000 ».
MOTIF_LIGNE_CARTE = re.compile(
    r"^[\s\-•·*✨🍽🥘🍛🍜🍲🥗🍰☕🥤]*"
    r"(?P<nom>[^\d\n]{3,60}?)"
    r"[\s:.…\-–—>»]*"
    r"(?P<prix>\d[\d\s.,  ]{2,12})\s*"
    r"(?:ar|ariary|mga)?\s*$",
    re.I | re.M,
)
MOTS_PAS_UN_PLAT = (
    "tel", "contact", "appel", "whatsapp", "adresse", "reservation", "reserver",
    "ouvert", "horaire", "lot", "bp", "route", "rue", "numero", "nombre", "place",
    "personne", "chambre", "nuit", "total", "menu a", "code", "km", "%",
)


def lignes_de_carte(texte: str) -> list[dict]:
    """Les plats chiffrés d'une carte.

    ⚠ UN NOMBRE N'EST PAS UN PRIX. « Chambre 2 » ou « Lot II B 34 » satisfont
      le motif ; le garde-fou est le montant lui-même — sous 500 Ar rien ne se
      vend, au-delà de 500 000 Ar ce n'est plus un plat — et l'exclusion des
      lignes de contact.
    """
    section_courante = None
    trouvees = []
    for ligne_brute in texte.split("\n"):
        ligne = ligne_brute.strip()
        if not ligne:
            continue
        n = sans_accent(ligne)

        # Un intitulé court sans chiffre au-dessus d'une liste, c'est une section.
        if len(ligne) <= 32 and not re.search(r"\d", ligne) and ligne.endswith(":"):
            section_courante = ligne.rstrip(":").strip()
            continue

        trouve = MOTIF_LIGNE_CARTE.match(ligne)
        if not trouve:
            continue
        if any(mot in n for mot in MOTS_PAS_UN_PLAT):
            continue
        if MOTIF_TEL.search(ligne):
            continue
        prix = _nombre(trouve.group("prix"))
        if prix is None or prix < 500 or prix > 500_000:
            continue
        nom = trouve.group("nom").strip(" .:-–—•*")
        if len(nom) < 3 or not re.search(r"[a-zA-ZÀ-ÿ]{3}", nom):
            continue
        trouvees.append({
            "nom": nom, "prix_ar": int(prix), "unite": "portion",
            "section": section_courante,
        })
    return trouvees


# ── Dates d'événement ───────────────────────────────────────────────────────
MOIS = {
    "janvier": 1, "janv": 1, "jan": 1, "fevrier": 2, "fev": 2, "mars": 3,
    "avril": 4, "avr": 4, "mai": 5, "juin": 6, "juillet": 7, "juil": 7,
    "aout": 8, "septembre": 9, "sept": 9, "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11, "decembre": 12, "dec": 12,
    # Malgache
    "janoary": 1, "febroary": 2, "martsa": 3, "aprily": 4, "mey": 5, "jona": 6,
    "jolay": 7, "aogositra": 8, "septambra": 9, "oktobra": 10, "novambra": 11,
    "desambra": 12,
}
MOTS_PERIODE = (
    "chaque annee", "chaque année", "tous les ans", "isan-taona", "saison",
    "de juin a septembre", "tous les samedis", "chaque semaine", "isaky ny",
)


def dates_evenement(texte: str, aujourdhui: date | None = None) -> dict:
    """Date de début, de fin, et récurrence.

    ⚠ ON N'INVENTE PAS L'ANNÉE. « le 14 septembre » sans année désigne le
      prochain 14 septembre — mais si cette date est déjà passée de plus de
      trois mois, c'est probablement l'an prochain. Au-delà de ce raisonnement
      simple, on laisse vide plutôt que de dater à côté.
    """
    aujourdhui = aujourdhui or date.today()
    n = sans_accent(texte)
    resultat = {"debut": None, "fin": None, "periode": None, "recurrent": False}

    resultat["recurrent"] = any(m in n for m in MOTS_PERIODE)

    # « du 12 au 15 septembre 2026 » / « du 12 au 15 septembre »
    plage = re.search(
        r"du\s+(\d{1,2})\s*(?:er)?\s*(?:au|-|–)\s*(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?", n
    )
    if plage and plage.group(3) in MOIS:
        mois = MOIS[plage.group(3)]
        annee = int(plage.group(4)) if plage.group(4) else _annee_probable(
            mois, int(plage.group(1)), aujourdhui)
        try:
            resultat["debut"] = date(annee, mois, int(plage.group(1))).isoformat()
            resultat["fin"] = date(annee, mois, int(plage.group(2))).isoformat()
            return resultat
        except ValueError:
            pass

    # « le 14 septembre 2026 » / « 14 septembre »
    simple = re.search(r"\b(\d{1,2})\s*(?:er)?\s+([a-z]{3,10})\.?\s*(\d{4})?", n)
    if simple and simple.group(2) in MOIS:
        mois = MOIS[simple.group(2)]
        annee = int(simple.group(3)) if simple.group(3) else _annee_probable(
            mois, int(simple.group(1)), aujourdhui)
        try:
            resultat["debut"] = date(annee, mois, int(simple.group(1))).isoformat()
            return resultat
        except ValueError:
            pass

    # « 14/09/2026 » ou « 14-09-26 »
    chiffree = re.search(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b", n)
    if chiffree:
        jour, mois, annee = (int(g) for g in chiffree.groups())
        annee = annee + 2000 if annee < 100 else annee
        try:
            resultat["debut"] = date(annee, mois, jour).isoformat()
            return resultat
        except ValueError:
            pass

    for mot, mois in MOIS.items():
        if re.search(rf"\b{mot}\b", n) and len(mot) > 3:
            resultat["periode"] = mot
            break
    return resultat


def _annee_probable(mois: int, jour: int, aujourdhui: date) -> int:
    """Une date sans année : cette année si elle n'est pas trop passée, sinon la suivante."""
    try:
        candidate = date(aujourdhui.year, mois, jour)
    except ValueError:
        return aujourdhui.year
    if candidate < aujourdhui - timedelta(days=90):
        return aujourdhui.year + 1
    return aujourdhui.year


def titre_evenement(texte: str) -> str | None:
    """La première ligne parlante — c'est presque toujours le nom de l'événement."""
    for ligne in texte.split("\n"):
        propre = BRUIT_NOM.sub("", ligne.strip()).strip(" .,:;–-—…#*")
        propre = re.sub(r"[\U0001F300-\U0001FAFF☀-➿]", "", propre).strip()
        if 6 <= len(propre) <= 90:
            return propre
    return None


# ── Lieu cité dans le texte ─────────────────────────────────────────────────
def lieu_dans_le_texte(texte: str, noms_connus: list[str]) -> str | None:
    """Le premier lieu du référentiel cité, le plus long d'abord.

    ⚠ DU PLUS LONG AU PLUS COURT, sinon « Nosy Be » gagnerait sur « Nosy
      Boraha » dès qu'un texte cite la seconde. C'est exactement la confusion
      qui a rangé six îles distinctes sous une seule fiche lors de l'import des
      photos d'archive.
    """
    n = sans_accent(texte)
    for nom in noms_connus:
        if len(nom) < 4:
            continue
        if re.search(rf"\b{re.escape(sans_accent(nom))}\b", n):
            return nom
    return None


# ── Assemblage ──────────────────────────────────────────────────────────────
def analyser(texte: str, nb_photos: int = 0, auteur_page: str | None = None,
             noms_de_lieux: list[str] | None = None) -> dict:
    """Lecture complète par règles. Le modèle vient corriger ensuite, s'il est actif."""
    cats = categories(texte)
    plats = lignes_de_carte(texte)
    dates = dates_evenement(texte)
    genre = classer(texte, nb_photos, plats, dates)

    tels = telephones(texte)
    adresses = liens(texte)
    prix = prix_principal(texte, cats)

    return {
        "genre": genre,
        "categories": cats,
        "nom_etab": nom_etablissement(texte, auteur_page),
        "lieu_texte": lieu_dans_le_texte(texte, noms_de_lieux or []),
        "adresse": adresse(texte),
        "repere": repere(texte),
        "telephone": tels[0] if tels else None,
        "whatsapp": whatsapp(texte),
        "email": email(texte),
        "site_web": adresses["site_web"],
        "page_facebook": adresses["page_facebook"],
        "horaires": horaires(texte),
        "equipements": equipements(texte),
        "prix_ar": prix["montant"] if prix else None,
        "prix_unite": prix["unite"] if prix else None,
        "lignes_carte": plats,
        "evt_debut": dates["debut"],
        "evt_fin": dates["fin"],
        "evt_recurrent": dates["recurrent"],
        "titre_evt": titre_evenement(texte) if genre == "evenement" else None,
        "post_genre": genre_de_post(texte),
    }
