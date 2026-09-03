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
    # `\bwa\b` : « Iwan et Sarah au 032… » donnait un WhatsApp qui n'en est pas un.
    for m in re.finditer(r"(whatsapp|\bwa\b|wa\.me|watsap|wtsp)[^\d+]{0,20}((?:\+?261|0)[\d\s.\-]{8,14})", n):
        formate = _formater_tel(m.group(2))
        if len(re.sub(r"\D", "", formate)) == 10:
            return formate
    return None


MOTIF_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[a-z]{2,})+", re.I)
# Ce qui n'est jamais le site d'un établissement : messageries, réseaux,
# raccourcisseurs. « contact@gmail.com » donnait `site_web = https://gmail.com`
# sur 162 trouvailles, dont 50 publiées (mesuré le 02/09/2026).
HOTES_PAS_UN_SITE = (
    "gmail.com", "hotmail.com", "hotmail.fr", "yahoo.com", "yahoo.fr", "outlook.com",
    "outlook.fr", "icloud.com", "live.com", "live.fr", "free.fr", "moov.mg", "orange.mg",
    "telma.mg", "instagram.com", "tiktok.com", "youtube.com", "youtu.be", "twitter.com",
    "x.com", "wa.me", "m.me", "linktr.ee", "bit.ly", "t.co", "goo.gl", "messenger.com",
    "telegram.me", "t.me", "whatsapp.com", "booking.com", "tripadvisor.com", "airbnb.com",
)


def liens(texte: str) -> dict:
    """Site web et page Facebook cités dans le texte."""
    sortie = {"site_web": None, "page_facebook": None}
    # Les adresses e-mail d'abord : leur domaine n'est pas un site.
    texte = MOTIF_EMAIL.sub(" ", texte or "")
    for m in re.finditer(r"(?:https?://)?(?:www\.)?([\w.-]+\.[a-z]{2,})(/[^\s)]*)?", texte, re.I):
        url = m.group(0)
        hote = m.group(1).lower()
        if hote.endswith(("facebook.com", "fb.com", "fb.me")):
            if not sortie["page_facebook"]:
                sortie["page_facebook"] = url if url.startswith("http") else "https://" + url
        elif hote.split(".")[-1] in ("mg", "com", "net", "org", "fr", "io") \
                and not hote.endswith(HOTES_PAS_UN_SITE):
            if not sortie["site_web"]:
                sortie["site_web"] = url if url.startswith("http") else "https://" + url
    return sortie


def email(texte: str) -> str | None:
    trouve = MOTIF_EMAIL.search(texte or "")
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
    # ⚠ « le jour » et « isan'andro » (« par jour » en malgache) manquaient :
    #   les loueurs de voiture écrivent surtout comme ça, et leurs tarifs
    #   partaient sans unité — donc jamais publiés.
    ("jour", r"par jour|/ ?jour|la journee|journee|le jour|isan[’' -]?andro"),
    ("circuit", r"le circuit|par circuit|le sejour|forfait"),
]

MOTIF_MONTANT = re.compile(
    r"(?P<nombre>\d[\d\s.,  ]*\d|\d)\s*"
    r"(?P<mult>millions?|mille|tapitrisa|arivo|k)?\s*"
    # ⚠ `ar(?![a-z])`, PAS `\bar\b` : la limite de mot à gauche refusait la
    #   devise collée au nombre (« 60 000Ar », « 75.000ar »), soit 41 % des
    #   prix écrits sur Facebook — 172 trouvailles sans prix le 02/09/2026.
    r"(?P<devise>ariary|ariari|ar(?![a-z])|mga(?![a-z])|€|euros?|\$|usd)",
    re.I,
)


# ── Devises étrangères ──────────────────────────────────────────────────────
# ⚠ CE MODULE REFUSAIT LES DEVISES ÉTRANGÈRES, EN SILENCE. Le réflexe était le
#   bon — un montant converti au petit bonheur est un montant faux — mais le
#   silence coûtait cher : sur les 55 chambres sans prix relevées le
#   24/08/2026, 14 ont leur tarif écrit UNIQUEMENT en euros, et
#   `room_types.base_price_ar` est NOT NULL. Sans conversion, ces chambres ne
#   partent jamais ; avec une conversion muette, personne ne peut vérifier le
#   chiffre.
#   Le refus reste donc le défaut (aucun appelant existant ne change de
#   comportement), et la conversion devient EXPLICITE : un taux relevé à la
#   main, daté, remplaçable, et le montant d'origine collé au résultat pour que
#   la fiche publiée dise d'où vient le chiffre.
# Taux RELEVES le 24/08/2026 sur open.er-api.com (source publique,
# mise a jour quotidienne) : 1 EUR = 5 046,46 Ar, 1 USD = 4 286,18 Ar.
# Arrondis a l'entier : un tarif d'hotel converti n'a pas de sens au
# centime, et la note collee a chaque prix dit le taux employe.
TAUX_ARIARY = {"EUR": 5_046, "USD": 4_286}
TAUX_RELEVE_LE = "24/08/2026"

_NOM_DEVISE = {"€": "EUR", "euro": "EUR", "euros": "EUR", "eur": "EUR",
               "$": "USD", "usd": "USD"}

# « € 70.00 », « €403 » : la devise DEVANT le nombre. MOTIF_MONTANT ne lit que
# la forme inverse, et c'est comme ça que les grilles des lodges (Babaomby,
# Tsara Komba) passaient entièrement à travers.
MOTIF_MONTANT_PREFIXE = re.compile(
    r"(?P<devise>€|\$)\s*(?P<nombre>\d[\d\s.,  ]*\d|\d)"
)


def nom_de_devise(brut: str | None) -> str:
    """« € », « euros », « USD » -> 'EUR' / 'USD'. 'MGA' partout ailleurs."""
    return _NOM_DEVISE.get((brut or "").strip().lower(), "MGA")


def convertir_en_ariary(montant: float, devise: str,
                        taux: dict | None = None) -> int | None:
    """Un montant étranger en ariary, ou None si aucun taux ne le couvre.

    ⚠ RENDRE None PLUTÔT QU'UN À-PEU-PRÈS. Une devise sans taux connu
      (la livre, le rand) doit laisser la case vide, pas produire un nombre.
    """
    valeur = (TAUX_ARIARY if taux is None else taux).get((devise or "").upper())
    if not valeur:
        return None
    return int(round(montant * valeur))


def note_de_conversion(montant: float, devise: str,
                       taux: dict | None = None) -> str:
    """La phrase qui accompagne un prix converti — elle part en base avec lui.

    C'est elle qui rend la conversion vérifiable : sans elle, un tarif converti
    est indiscernable d'un tarif relevé en ariary, et plus personne ne sait
    qu'il faut le refaire quand le taux bouge.
    """
    valeur = (TAUX_ARIARY if taux is None else taux).get((devise or "").upper()) or 0
    affiche = int(montant) if float(montant).is_integer() else montant
    symbole = "€" if (devise or "").upper() == "EUR" else "$"
    lisible = f"{valeur:,}".replace(",", " ")
    return (f"Tarif affiché {affiche} {symbole}, converti à 1 {symbole} = "
            f"{lisible} Ar (taux relevé le {TAUX_RELEVE_LE}).")


def _nombre(brut: str) -> float | None:
    brut = brut.replace(" ", " ").replace(" ", " ").strip()
    if re.fullmatch(r"\d{1,3}[.,]\d{1,2}", brut):
        return float(brut.replace(",", "."))
    chiffres = re.sub(r"[^\d]", "", brut)
    return float(chiffres) if chiffres else None


def montants(texte: str, avec_devises: bool = False) -> list[dict]:
    """Tous les montants en ariary trouvés, avec leur unité et leur contexte.

    ⚠ ON EFFACE D'ABORD LES NUMÉROS DE TÉLÉPHONE. « 034 12 345 67 » ressemble
      énormément à un prix, et c'est l'erreur qui produit des tarifs absurdes.

    `avec_devises=True` ajoute les montants en euros et en dollars — TELS
    QUELS, jamais convertis, avec leur devise dans la clé `devise`. Convertir
    est une décision, elle se prend chez l'appelant (`convertir_en_ariary`),
    pas comme effet de bord d'une lecture.
    """
    propre = MOTIF_TEL.sub(" ", texte)
    normalise = sans_accent(propre)

    bruts: list[tuple] = []
    for m in MOTIF_MONTANT.finditer(normalise):
        valeur = _nombre(m.group("nombre"))
        if valeur is None:
            continue
        mult = (m.group("mult") or "").lower()
        if mult == "k" and valeur >= 1000:   # « 15000k » est du bruit
            mult = ""
        valeur *= MULTIPLICATEURS.get(mult, 1)
        bruts.append((m.start(), m.end(), valeur, nom_de_devise(m.group("devise"))))
    if avec_devises:
        for m in MOTIF_MONTANT_PREFIXE.finditer(normalise):
            valeur = _nombre(m.group("nombre"))
            if valeur is not None:
                bruts.append((m.start(), m.end(), valeur,
                              nom_de_devise(m.group("devise"))))

    trouves: list[dict] = []
    pris: list[tuple[int, int]] = []
    for debut, fin, valeur, devise in sorted(bruts):
        # Les deux motifs peuvent tomber sur le même montant : le premier lu
        # gagne, sinon « € 70.00 Ar » compterait deux fois.
        if any(debut < f and d < fin for d, f in pris):
            continue
        pris.append((debut, fin))
        if devise != "MGA":
            if not avec_devises or valeur < 5:
                continue
        elif valeur < 200:                    # « 5 Ar » n'existe pas
            continue
        avant = normalise[max(0, debut - 70):debut]
        apres = normalise[fin:fin + 40]
        unite = None
        for code, motif in UNITES:
            if re.search(motif, apres) or re.search(motif, avant[-45:]):
                unite = code
                break
        ligne = {"montant": int(round(valeur)), "unite": unite,
                 "avant": avant.strip()[-60:], "position": debut}
        if devise != "MGA":
            ligne["devise"] = devise
        trouves.append(ligne)
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
    # ⚠ Les loueurs malgaches écrivent rarement « location de voiture » en
    #   toutes lettres : « location 4x4 », « voiture à louer », « location moto »
    #   sont les formes réelles. Sans elles, 24 trouvailles de loueurs passaient
    #   en « transporteur » et aucune grille tarifaire n'était cherchée.
    "location_vehicule": ("location de voiture", "location voiture",
                          "location de vehicule", "location vehicule",
                          "location 4x4", "location de 4x4", "location moto",
                          "location scooter", "location quad",
                          "louer une voiture", "voiture a louer", "4x4 a louer",
                          "moto a louer", "rent a car", "car rental"),
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


# ── Ce qui n'a pas sa place, et ce qui n'est pas ce qu'il paraît ─────────────
# ⭐ POURQUOI (03/09/2026, décision d'Andry). Le fil de Diako doit porter le
#   VÉCU des voyageurs : un lieu visité, un parc, un plat goûté, une bonne ou
#   mauvaise expérience, une belle photo. Le calendrier doit porter les
#   ÉVÉNEMENTS MALGACHES qui ont un lieu (festival des baleines, Donia,
#   famadihana, salon, foire). Or la collecte rapportait :
#     · des ventes d'objets (« À vendre · Ambondrona », ordinateurs) — 13 fiches
#       d'établissement publiées, 40 rejetées à la main ;
#     · des vœux de fête (« Joyeuse fête nationale », « Joyeux Noël ») publiés
#       comme récits (9) ou événements (4) ;
#     · des voyages organisés d'agence publiés comme événements (« Voyage
#       organisé Tana - Tuléar (8 jours) ») — ce sont des circuits, pas des
#       fêtes ;
#     · des publicités d'établissement (« FLASH PROMO -30 % », « Évadez-vous au
#       Madiro Hôtel ») réécrites en récits : 89 des 418 récits en ligne.
#   Règle : une publication de fête ou une offre venant d'un établissement
#   nourrit SA FICHE (contact, plats, prix) — elle n'est jamais publiée telle
#   quelle. Un vœu sans information ne vaut rien.

MOTS_VENTE_OBJETS = (
    "ordinateur", "laptop", "pc portable", "pc gamer", "iphone", "samsung galaxy",
    "smartphone", "telephone portable", "tablette", "meuble", "canape", "frigo",
    "refrigerateur", "congelateur", "climatiseur", "television", "smart tv",
    "ecran plat", "playstation", "console de jeu", "imprimante", "groupe electrogene",
    "panneau solaire", "destockage", "liquidation", "pieces detachees", "pneus",
    "carrelage", "ciment", "materiaux de construction", "friperie", "vente flash",
    "kidoro", "matelas", "jardinage", "entretien du jardin", "creation du jardin",
    "creations du jardin", "amenagement de jardin", "voiture d'occasion", "moto a vendre",
    "mixeur", "blender", "robot de cuisine", "machine a laver", "lave-linge", "micro-onde",
    "ventilateur", "tapis fourrure", "tapis de salon", "vetements", "tissu tsara",
    "chaussures", "sac a main", "sonorisation", "location sono",
    "bateau de peche", "vedette a vendre", "terrain a vendre",
)
# ⚠ « à vendre », « je vends » ne suffisent pas seuls : un hôtel à vendre est de
#   l'immobilier (déjà filtré), et « amidy »/« mivarotra » en malgache
#   apparaissent dans des récits (« TSY NISY ANTANANARIVO… » passait pour une
#   vente). Ces mots ne comptent qu'en l'absence de tout vocabulaire de voyage.
MOTS_VENTE_SEULE = ("a vendre", "je vends", "on vend", "vends ", "vente flash")
# Les fêtes du calendrier : jamais un événement de Diako. Un restaurant qui
# annonce son menu de réveillon nourrit sa fiche, pas le calendrier.
MOTS_FETES_CALENDAIRES = (
    "noel", "reveillon", "nouvel an", "new year", "saint-valentin", "saint valentin",
    "st valentin", "st-valentin", "paques", "fete nationale", "26 juin", "fete des meres",
    "fete des peres", "halloween", "ramadan", "aid el", "aid-el", "toussaint", "1er mai",
    "8 mars", "journee de la femme", "black friday", "bonne annee", "bonne et heureuse",
    "fetes de fin d'annee", "fin d'annee", "fete de l'independance", "independance",
    "asaramanitra", "krismasy", "taom-baovao", "taombaovao", "arahaba tratry",
    "tratry ny", "joyeuses fetes", "joyeux noel", "meilleurs voeux", "joyeuse fete",
)
# Un voyage organisé a une date de départ, pas une date d'événement : c'est
# une agence qui vend un circuit.
MOTS_VOYAGE_ORGANISE = (
    "voyage organise", "voyages organises", "circuit", "sejour organise", "excursion",
    "evasion", "escapade", "depart le", "depart :", "depart prevu", "places limitees",
    "inscription", "programme du voyage", "itineraire", "jours /", "j /", " j/",
    "pension complete", "demi-pension", "transport aller", "aller-retour", "vakansy",
    "dia miaraka", "fitsangatsanganana", "trekking en groupe", "randonnee en groupe",
    "voyage en groupe", "sortie en groupe", "day trip", "package", "forfait",
)
# Ce qui a lieu en public, à une date, et qui vaut une entrée au calendrier.
MOTS_EVENEMENT_FORT = (
    "festival", "concert", "spectacle", "ceremonie", "fete traditionnelle", "famadihana",
    "fitampoha", "sambatra", "donia", "somaroho", "hira gasy", "hiragasy", "baleine",
    "salon ", "foire", "marche artisanal", "exposition", "vernissage", "tournoi",
    "marathon", "championnat", "carnaval", "kermesse", "gala", "defile", "election miss",
    "trail", "regate", "rallye", "feria", "commemoration", "pelerinage", "olympiade",
    "semaine du", "journee du", "journees du", "fete du", "fete de la", "fete des",
    # malgache : « hetsika » (événement), « lanonana » (cérémonie, fête),
    # « fampirantiana » (exposition), « fampisehoana » (spectacle)
    "hetsika", "lanonana", "fampirantiana", "fampisehoana",
)
MOTS_EVENEMENT_FAIBLE = (
    "edition", "programme", "live", "dj", "soiree", "after work", "afterwork", "atelier",
    "conference", "animation", "course", "competition", "rendez-vous", "billetterie",
    "entree libre", "projection", "cinema", "theatre", "danse", "nuit blanche", "match",
    "fety", "mozika", "dihy", "fanokafana",
)
# Une offre : l'établissement parle de lui pour vendre.
MOTS_OFFRE = (
    "reservez", "reservation", "offre speciale", "offre", "promo", "promotion",
    "a partir de", "profitez", "contactez", "appelez", "nous contacter", "infoline",
    "nous vous accueillons", "nous vous proposons", "venez decouvrir", "venez profiter",
    "venez", "notre hotel", "notre restaurant", "notre etablissement", "nos chambres",
    "nos bungalows", "notre equipe", "disponible", "disponibilites", "tarif", "nuitee",
    "par nuit", "/nuit", "par personne", "/pers", "reduction", "remise", "%",
    "commandez", "sur commande", "ouvert 7j/7", "ouvert tous les jours", "horaires",
    "menu du jour", "plat du jour", "bienvenue", "nouveaute", "ouverture",
    "vient d'ouvrir", "tonga soa", "antsoy", "mandray anao", "afaka manao reservation",
    "vous accueille", "vous propose", "vous attend", "viens decouvrir", "viens profiter",
    "viens celebrer", "viens gouter", "after work", "afterwork", "happy hour", "en mp",
    "par mp", "en inbox", "inbox", "sur commande", "commande", "livraison",
    # ⚠ MALGACHE (03/09/2026) : 18 des 248 récits restés en ligne après le
    #   premier nettoyage étaient des annonces en malgache — « ity tolotra ity »,
    #   « misokatra foana izahay », « zahay mandray vahiny » — que ce vocabulaire
    #   tout français laissait passer pour du vécu.
    "tolotra", "manankery", "misokatra", "mandray vahiny", "mampanofa", "ahofa",
    "hofaina", "hantsoina", "azo antsoina", "tongava", "mila alefa", "hafatra",
    "vidiny", "saran-dalana", "monja", "mitatitra", "raiso", "misy toerana",
    "toerana malalaka", "azo alaina", "andraso", "tongava maro", "ho anareo izay mitady",
    # anglais des agences et des lodges
    "book now", "booking", "contact us", "call us", "dm us", "we offer", "we welcome",
    "escape to", "join us", "special offer", "per night", "per person", "available now",
    "leave the ordinary", "your stay", "your holiday", "your next trip", "book your",
)
# Le vécu : quelqu'un y est allé. Les marqueurs FORTS suffisent seuls ; les
# faibles se comptent à deux (« on a hâte de vous accueillir » n'est pas un vécu).
MOTS_VECU_FORT = (
    "j'ai goute", "j'ai teste", "j'ai dormi", "j'ai visite", "j'ai adore", "j'ai passe",
    "je suis alle", "on a mange", "on a goute", "on a teste", "on a dormi", "on a visite",
    "on a passe", "on est alle", "nous avons mange", "nous avons dormi", "nous avons visite",
    "nous sommes alle", "mon sejour", "notre sejour", "mon week-end", "notre week-end",
    "mes vacances", "nos vacances", "notre passage", "souvenir", "coup de coeur",
    "je recommande", "je vous recommande", "je conseille", "je vous conseille",
    "decu", "deception", "mon avis", "notre avis", "retour d'experience", "premiere fois",
    "nahita", "nandeha", "nitsidika", "nihinana", "nanandrana", "nandry", "niala sasatra",
    "nahafinaritra", "nankafy", "nifaly", "diso fanantenana",
)
# ⚠ « izahay » / « zahay » (nous) étaient des marqueurs FORTS : « misokatra
#   foana izahay » (nous sommes toujours ouverts) passait pour un vécu. Un
#   établissement dit « nous » autant qu'un voyageur : marqueur faible.
MOTS_VECU_FAIBLE = (
    "on a ", "on est ", "nous avons", "j'ai ", "hier", "ce week-end", "la semaine derniere",
    "le mois dernier", "enfin", "tsara be", "mahafinaritra", "faly", "tany ", "teny ", "tao ",
    "magnifique", "superbe", "paysage", "vue ", "coucher de soleil", "lever de soleil",
    "zahay",  # couvre aussi « izahay » — ne pas lister les deux, ils se compteraient double
)
MOTS_MESAVENTURE = (
    "decu", "deception", "mauvais", "jamais plus", "arnaque", "trop cher", "attente",
    "attendu", "froid", "sale", "insalubre", "pas recommande", "a eviter", "mauvaise surprise",
    "honteux", "inadmissible", "catastrophe", "nul", "degueulasse", "diso fanantenana",
    "ratsy", "tsy mety", "nampalahelo", "malahelo", "lafo be", "maloto",
)
MOTS_CULINAIRE = (
    "plat", "assiette", "sakafo", "menu", "cuisine", "delicieux", "miam", "gouter",
    "goute", "degustation", "deguste", "ravitoto", "romazava", "mofo", "laoka", "resto",
    "restaurant", "dejeuner", "diner", "petit dejeuner", "brochette", "poisson grille",
    "crabe", "crevette", "zebu", "fruits de mer", "cafe", "glace", "gateau", "koba",
    "recette", "saveur", "gout", "table", "on a mange", "nihinana", "matsiro", "hena",
)


def _sans_ponctuation(n: str) -> str:
    """« Misy Bateaux A. VENDRE » : le point coupait « a vendre » en deux.

    On cherche dans les DEUX formes — la ponctuation est retirée ici, mais
    certains motifs en contiennent (« /nuit », « ouvert 7j/7 », « % »), et
    ceux-là continuent de se trouver dans le texte d'origine.
    """
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]+", " ", n))


def _compte(mots, n: str) -> int:
    plat = _sans_ponctuation(n)
    return sum(1 for m in mots if m in n or m in plat)


def est_vente_d_objets(texte: str) -> bool:
    """Une petite annonce d'objet — sauf si le texte parle nettement de tourisme."""
    n = sans_accent(texte)
    tourisme = _compte(("hotel", "restaurant", "sejour", "nuitee", "chambre", "menu",
                        "plat", "circuit", "voyage", "excursion", "bungalow", "lodge",
                        "plage", "parc", "guide", "visite", "decouverte", "tsangatsangana",
                        "vakansy", "tourisme"), n)
    if _compte(MOTS_VENTE_OBJETS, n):
        return tourisme < 2
    if _compte(MOTS_VENTE_SEULE, n):
        return tourisme == 0
    return False


def est_fete_calendaire(texte: str) -> bool:
    n = sans_accent(texte)
    return _compte(MOTS_FETES_CALENDAIRES, n) > 0


def est_voyage_organise(texte: str) -> bool:
    n = sans_accent(texte)
    return _compte(MOTS_VOYAGE_ORGANISE, n) >= 1


def est_une_offre(texte: str, auteur_page: str | None = None) -> bool:
    """L'établissement parle de lui pour vendre.

    Un numéro de téléphone compte pour un marqueur : un voyageur raconte, il
    ne donne pas le 034 de l'hôtel — et s'il le fait, son vécu l'emporte de
    toute façon (voir `classer_avec_motif`).
    """
    n = sans_accent(texte)
    seuil = 1 if auteur_page else 2
    return _compte(MOTS_OFFRE, n) + (1 if MOTIF_TEL.search(texte) else 0) >= seuil


def est_un_vecu(texte: str) -> bool:
    n = sans_accent(texte)
    return _compte(MOTS_VECU_FORT, n) >= 1 or _compte(MOTS_VECU_FAIBLE, n) >= 2


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
    if est_vente_d_objets(texte):
        return False
    trouves = sum(1 for mot in MOTS_TOURISME if mot in n)
    return trouves >= 2 or (trouves >= 1 and nb_photos >= 1)


# ── Immobilier : le périmètre de Fonenako, pas celui de Diako ───────────────
# ⭐ POURQUOI CE FILTRE (24/08/2026). Les groupes « bons plans » malgaches
#   mélangent tourisme et petites annonces : sur les 2 217 textes déjà en base,
#   36 sont des ventes de terrain, des villas à vendre ou des logements loués au
#   mois. Ils n'ont rien à faire dans un annuaire de voyage — et Fonenako,
#   l'autre projet de la maison, les traite déjà.
#
# ⚠⚠ LE PIÈGE, ET IL EST PARTOUT : un hôtel écrit « chambre à louer »,
#    « bungalow à louer », « villa meublée pour vos vacances », « location de
#    vacances ». Ce sont des touristes, pas des locataires. La différence n'est
#    JAMAIS le verbe « louer » : c'est la DURÉE et l'INTENTION.
#      · nuitée, séjour, week-end, petit déjeuner -> tourisme, on garde ;
#      · loyer, caution, bail, « par mois »       -> bail, on écarte.
#    Trois textes réels de la base l'illustrent :
#      · « Appartement ahofa eto Mahajanga … PRIX AZO ATAO PAR JOUR (60 000
#        ariary/nuitée) »       -> tourisme, GARDÉ malgré « ahofa » ;
#      · « Je propose des locations de vacances à Foulpointe … Je propose aussi
#        des locations longue durée … Tarif pour une nuitée : 50 euros »
#                               -> tourisme, GARDÉ malgré « longue durée » ;
#      · « trano vato ahofa … loyer: 800 mille fmg tsis caution … 50% Agence
#        immobilier »           -> bail, ÉCARTÉ.

# Ce qui se vend et qui ne bouge pas. « chambre », « bungalow » et « pièce » n'y
# sont PAS : ce sont les mots d'un hôtel autant que ceux d'un logement.
_BIEN = (r"(?<![a-z])(?:villas?|maisons?|trano|tragno|appartements?|appart|studio|"
         r"duplex|terrains?|tany|tokotany|parcelles?|lotissement|immeubles?|"
         r"propriete|hectares?|ares?(?![a-z])|m2|m²|f[1-9](?![a-z0-9])|"
         r"t[1-9](?![a-z0-9])|r\+[0-9])")

# ⚠ « mivarotra » et « hivarotra » NE SONT PAS DANS CETTE LISTE, à dessein. En
#   malgache ils veulent dire « vendre » N'IMPORTE QUOI : sur la base réelle ils
#   attrapaient « Mivarotra VIANDES PRÉPARÉES » (un restaurant), « mpivarotra
#   omby » (un récit d'histoire locale) et jusqu'au nom d'un membre du groupe
#   (« Fah Mivarotra volafotsy ») — six fausses alertes pour zéro vraie.
_VENTE_FR = (r"(?<![a-z])(?:a\s+vendre|a\s+vandre|en\s+vente|mise\s+en\s+vente|"
             r"a\s+ceder|acquereur)")
# « amidy » et « alafo » (à vendre) sont sûrs, MAIS collés au bien : les formes
# réelles sont « TRANO AMIDY », « AMIDY TANY », « Tany alafo ». Au-delà de 30
# caractères on retombe sur « koba amidy » (des gâteaux) — d'où cette fenêtre
# quatre fois plus serrée que celle du français.
_VENTE_MG = r"(?<![a-z])(?:amidy|alafo)(?![a-z])"

MOTIF_VENTE_BIEN = re.compile(
    _VENTE_FR + r"[\s\S]{0,140}?" + _BIEN + r"|" + _BIEN + r"[\s\S]{0,140}?" + _VENTE_FR,
    re.I,
)
MOTIF_VENTE_BIEN_MG = re.compile(
    _VENTE_MG + r"[\s\S]{0,30}?" + _BIEN + r"|" + _BIEN + r"[\s\S]{0,30}?" + _VENTE_MG,
    re.I,
)
# Les papiers d'un terrain. Aucun hôtel ne parle de son titre foncier dans une
# publication ; une vente de terrain, elle, ne parle que de ça.
MOTIF_PAPIER_FONCIER = re.compile(
    r"titre foncier|acte de vente|titree? et bornee?|titree? bornee?|"
    r"bornee? et titree?|terrain domanial|livre foncier|certificat foncier", re.I,
)
# ⚠ AUCUN MOT-DIÈSE ICI. « #tianimmo » signe une agence de Tuléar qui publie
#   AUSSI des séjours en bord de mer et de la location de voitures : l'écarter
#   sur son mot-dièse supprimait deux publications touristiques légitimes.
MOTIF_AGENCE_IMMO = re.compile(
    r"agence immobili|vente immobili|annonce immobili|location immobili", re.I)

# Un loyer se paie au mois, une nuitée à la nuit : la frontière est là.
MOTIF_LOYER = re.compile(
    r"(?<![a-z])(?:loyer|caution|contrat de bail|frais d.agence|isam.bolana|"
    r"par mois|/ ?mois|le mois)", re.I)
MOTIF_LOUER = re.compile(r"(?<![a-z])(?:a\s+louer|ahofa|hofany|location|louer)", re.I)
MOTIF_LOGEMENT = re.compile(
    r"(?<![a-z])(?:villas?|maisons?|trano|tragno|appartements?|appart|studio|"
    r"duplex|local|locaux|magasin|magazay|tsena|bureau|piece|"
    r"f[1-9](?![a-z0-9])|t[1-9](?![a-z0-9]))", re.I)
# Le garde-fou : ce vocabulaire-là dit « on y dort quelques nuits ».
MOTIF_SEJOUR = re.compile(
    r"(?<![a-z])(?:nuitees?|nuits?|/ ?nuit|par nuit|par jour|/ ?jour|sejours?|"
    r"petit dejeuner|demi.pension|pension complete|vacances|hotel|bungalow|"
    r"lodge|resort|check.?in|week.?end|isan.andro|chambre double|reservez|"
    r"a la semaine|par semaine|/ ?semaine|courte duree|location de vacances)", re.I)


def _aplati(texte: str) -> str:
    """Minuscules SANS accent ET sans police fantaisie.

    🔴 NFKD, PAS NFD — la différence coûte une annonce sur trente-six. Les
       annonceurs Facebook écrivent en gras Unicode : « 𝗠𝗔𝗜𝗦𝗢𝗡 INDEPENDENT A
       louer … 𝗧𝗥𝗔𝗚𝗡𝗢 HAFODRO ». `sans_accent()` normalise en NFD, qui laisse
       ces caractères tels quels : le filtre lisait « 𝗠𝗔𝗜𝗦𝗢𝗡 » et n'y voyait
       pas « maison ». NFKD les ramène aux lettres latines ordinaires.
    """
    return "".join(
        c for c in unicodedata.normalize("NFKD", texte or "")
        if unicodedata.category(c) != "Mn"
    ).lower()


def raisons_immobilier(texte: str) -> list[str]:
    """Pourquoi cette publication est une annonce immobilière. Liste vide = elle ne l'est pas.

    Renvoyer les motifs plutôt qu'un booléen permet de les écrire au journal :
    « écartée (vente d'un bien) » se vérifie, « écartée » ne se vérifie pas.
    """
    n = _aplati(texte)
    motifs = []
    if MOTIF_VENTE_BIEN.search(n) or MOTIF_VENTE_BIEN_MG.search(n):
        motifs.append("vente d'un bien")
    if MOTIF_PAPIER_FONCIER.search(n):
        motifs.append("papiers fonciers")
    if MOTIF_AGENCE_IMMO.search(n):
        motifs.append("agence immobilière")
    # Le bail : un loyer, un verbe de location, un logement — et aucun mot de
    # séjour. Les quatre conditions ensemble, jamais une seule.
    if (MOTIF_LOYER.search(n) and MOTIF_LOUER.search(n)
            and MOTIF_LOGEMENT.search(n) and not MOTIF_SEJOUR.search(n)):
        motifs.append("loyer au mois")
    return motifs


def parle_d_immobilier(texte: str) -> bool:
    """Vrai si la publication vend ou loue un logement — le métier de Fonenako."""
    return bool(raisons_immobilier(texte))


def categories(texte: str) -> list[str]:
    """Les catégories Diako reconnues. Un écolodge est hôtel ET restaurant."""
    n = sans_accent(texte)
    trouvees = []
    for code, mots in MOTS_CATEGORIE.items():
        if any(sans_accent(mot) in n for mot in mots):
            trouvees.append(code)
    return trouvees


def classer(texte: str, nb_photos: int, lignes_carte: list, dates: dict,
            auteur_page: str | None = None) -> str:
    """Nature de la trouvaille : etablissement | carte | evenement | recit | rien."""
    return classer_avec_motif(texte, nb_photos, lignes_carte, dates, auteur_page)[0]


CATEGORIES_QUI_ACCUEILLENT = {"hotel", "restaurant", "agence_voyage", "location_vehicule",
                              "guide", "site_attraction", "transporteur"}


def classer_avec_motif(texte: str, nb_photos: int, lignes_carte: list, dates: dict,
                       auteur_page: str | None = None) -> tuple[str, str]:
    """Nature de la trouvaille, et POURQUOI — pour le journal et pour l'écran.

    L'ordre des tests n'est pas cosmétique. Une carte de restaurant est
    d'abord une carte, même si elle nomme l'établissement ; un événement est
    d'abord un événement, même s'il se tient dans un hôtel. Le récit n'est plus
    le cas par défaut : il exige un VÉCU. Ce qu'un établissement dit de lui
    pour vendre nourrit sa fiche ; ce qui n'apprend rien ne va nulle part.
    """
    n = sans_accent(texte)
    cats = categories(texte)
    a_tel = bool(telephones(texte))
    a_info = a_tel or bool(lignes_carte) or bool(liens(texte)["site_web"]) \
        or bool(montants(texte))
    calendaire = est_fete_calendaire(texte)
    accueille = bool(CATEGORIES_QUI_ACCUEILLENT & set(cats))

    # ⓪ Une petite annonce d'objet n'a rien à faire ici.
    if est_vente_d_objets(texte) and not (accueille and a_info):
        return "rien", "vente d'objets"

    # ① Une carte, c'est plusieurs plats CHIFFRÉS. Un menu de réveillon chiffré
    #    reste une carte : on prend les plats et les prix, pas les vœux.
    #    ⚠ Le programme chiffré d'une excursion (« TARIF 160 000 », « SI
    #      ÉTRANGERS + 50 000 ») n'est pas une carte : sans mot de cuisine, un
    #      voyage organisé garde son genre.
    voyage = est_voyage_organise(texte)
    cuisine = any(m in n for m in ("menu", "plat", "sakafo", "notre carte", "au menu",
                                   "formule", "entree", "dessert", "boisson"))
    if not voyage or cuisine:
        if len(lignes_carte) >= 3:
            return "carte", "plats chiffrés" + (" (menu de fête)" if calendaire else "")
        if len(lignes_carte) >= 2 and any(sans_accent(m) in n for m in MOTS_CARTE):
            return "carte", "plats chiffrés" + (" (menu de fête)" if calendaire else "")

    # ② Un ÉVÉNEMENT PUBLIC a une date — jamais une fête du calendrier, jamais
    #    un voyage organisé (c'est une agence qui vend un circuit).
    fort = _compte(MOTS_EVENEMENT_FORT, n)
    faible = _compte(MOTS_EVENEMENT_FAIBLE, n)
    date_ou_periode = bool(dates.get("debut") or dates.get("periode"))
    if not calendaire:
        if fort >= 1 and date_ou_periode and not (voyage and fort < 2):
            return "evenement", "événement public daté"
        if not voyage and faible >= 2 and dates.get("debut"):
            return "evenement", "soirée ou animation datée"

    # ③ Un établissement se reconnaît à ce qu'il propose : une catégorie, un
    #    moyen de le joindre, et de quoi le situer.
    points_etab = sum(1 for m in ("ouverture", "nouveau", "vient d'ouvrir", "bienvenue",
                                  "reservation", "réservation", "nous sommes", "adresse",
                                  "situe", "situé", "contact", "infoline", "chambre",
                                  "nuitee", "nuitée", "disponible")
                      if sans_accent(m) in n)
    if voyage and (accueille or a_info or auteur_page):
        return "etablissement", "voyage organisé : c'est l'agence et ses circuits"
    suffixe = " (fête calendaire)" if calendaire else ""
    if cats and a_tel and points_etab >= 1:
        return "etablissement", "fiche d'établissement" + suffixe
    if cats and points_etab >= 3:
        return "etablissement", "fiche d'établissement" + suffixe

    vecu = est_un_vecu(texte)
    offre = est_une_offre(texte, auteur_page)

    # Vœux de fête : on garde l'établissement s'il y a de quoi remplir sa
    # fiche ; sinon ça ne vaut rien.
    if calendaire and not vecu:
        if accueille or a_info or auteur_page:
            return "etablissement", "fête calendaire : on garde l'établissement, pas les vœux"
        return "rien", "vœux de fête calendaire sans information"

    # Une offre (l'établissement parle de lui pour vendre) nourrit sa fiche.
    if offre and not vecu:
        if accueille or a_info or auteur_page:
            return "etablissement", "offre commerciale : on garde la fiche, pas la publicité"
        return "rien", "offre commerciale sans information"

    # Une page qui parle d'elle sans rien vendre ni raconter : une belle photo
    # passe (« ce qui est magnifique à voir »), un discours non.
    if auteur_page and not vecu:
        if nb_photos >= 1 and len(texte.strip()) < 300:
            return "recit", "photo d'une page"
        if accueille or a_info:
            return "etablissement", "page d'établissement sans vécu"
        return "rien", "publication de page sans vécu ni information"

    # ④ Le vécu d'un voyageur : un lieu, un parc, un plat, une mésaventure.
    return "recit", "vécu" if vecu else "récit"


def genre_de_post(texte: str) -> str:
    """`posts.kind` : recit | assiette | photo | bon_plan | avis | alerte.

    ⚠ Les valeurs viennent de la contrainte `posts_kind_check`. En inventer une
      fait échouer l'INSERT entier, pas seulement le champ.
    """
    n = sans_accent(texte)
    # Dans l'ordre : ce qui prévient, ce qui déçoit, ce qui se mange, ce qui
    # conseille, ce qui se regarde — et le voyage raconté, cas général.
    if any(m in n for m in ("attention", "prudence", "ferme definitivement", "annule",
                            "route coupee", "cyclone", "danger", "vol a", "agression")):
        return "alerte"
    if _compte(MOTS_MESAVENTURE, n) >= 1:
        return "avis"
    if _compte(MOTS_CULINAIRE, n) >= 2 or (len(texte.strip()) < 140
                                           and _compte(MOTS_CULINAIRE, n) >= 1):
        return "assiette"
    if any(m in n for m in ("bon plan", "astuce", "conseil", "pas cher", "moins cher",
                            "gratuit", "bon a savoir")):
        return "bon_plan"
    if any(m in n for m in ("mon avis", "notre avis", "je recommande", "note ", "service",
                            "accueil")):
        return "avis"
    if len(texte.strip()) < 140:
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
    # ⚠ `[ \t]` ET NON `\s` : `\s` traverse les retours à la ligne, et
    #   « Notre restaurant \n Ravitoto sy henakisoa » devenait un établissement
    #   nommé « restaurant Ravitoto ». Un nom ne franchit jamais une ligne.
    motif = re.compile(
        r"\b(?i:" + "|".join(re.escape(p) for p in PREFIXES_NOM) + r")[ \t]+"
        r"(?P<nom>[A-ZÀ-Ý][\w'’\-]*(?:[ \t]+[A-ZÀ-Ý0-9][\w'’\-]*){0,3})",
    )
    trouve = motif.search(texte)
    if trouve:
        return trouve.group(0).strip(" .,:;–-")

    premiere = BRUIT_NOM.sub("", texte.strip().split("\n")[0]).strip(" .,:;–-—…")
    # ⚠ Le chrome de Facebook (« Indicateur de statut En ligne », « Gmail ») et
    #   les lignes de prix (« PRIX : 130.000 ARIARY ») ne sont pas des noms.
    if BRUIT_FIL.match(premiere) or MOTIF_MONTANT.search(premiere) \
            or re.search(r"\b(prix|tarif|gmail|whatsapp)\b", premiere, re.I):
        return None
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
    # ⚠ Une queue SANS CHIFFRE est tolérée après le prix : « 12 000 Ar. »,
    #   « 12 000 Ar (avec riz) », « 12 000 Ar 🔥 ». Ancré en fin de ligne, le
    #   motif perdait 428 lignes de carte sur 762 (mesuré le 02/09/2026) —
    #   même leçon que pour les chambres.
    r"(?:ar|ariary|mga)?(?P<suite>[^\d\n]{0,28})$",
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
        # ⚠ « Nos tarifs 2026 » n'est pas un plat à 2 026 Ar. Un nombre à quatre
        #   chiffres sans séparateur ET sans devise dans la ligne est une année,
        #   pas un prix. Vu sur la page de tarifs d'un hôtel, où il créait un
        #   plat fantôme à chaque passage.
        brut = re.sub(r"\D", "", trouve.group("prix"))
        if re.fullmatch(r"(19|20)\d{2}", brut) and not re.search(
            r"\b(ar|ariary|mga)\b", n
        ):
            continue
        nom = trouve.group("nom").strip(" .:-–—•*")
        if len(nom) < 3 or not re.search(r"[a-zA-ZÀ-ÿ]{3}", nom):
            continue
        trouvees.append({
            "nom": nom, "prix_ar": int(prix), "unite": "portion",
            "section": section_courante,
        })
    return trouvees


# ── Types de chambre ────────────────────────────────────────────────────────
# Une grille de tarifs, sur un site d'hôtel, ressemble à une carte de
# restaurant : un libellé, un prix. Ce qui change, c'est le vocabulaire et
# l'ordre de grandeur.
MOTS_CHAMBRE = (
    "chambre", "bungalow", "suite", "villa", "studio", "appartement", "dortoir",
    "tente", "case", "paillote", "room", "double", "twin", "single", "triple",
    "familiale", "family", "deluxe", "supérieure", "superieure", "standard",
    "junior", "duplex", "lodge",
)
MOTIF_LIGNE_CHAMBRE = re.compile(
    r"^[\s\-•·*]*"
    # ⚠ LE NOM PEUT CONTENIR DES CHIFFRES, contrairement à celui d'un plat :
    #   « Dortoir 6 personnes — 35 000 Ar/pers » est une ligne courante, et
    #   l'interdire faisait sauter tous les dortoirs et les « Chambre 2 lits ».
    #   Le motif étant paresseux, c'est le DERNIER nombre de la ligne qui est
    #   lu comme prix, ce qui est exactement la convention d'une grille.
    r"(?P<nom>[^\n]{3,70}?)"
    r"[\s:.…\-–—>»]*"
    # ⚠ LA DEVISE PEUT PRÉCÉDER LE NOMBRE : « € 70.00 » est la mise en page
    #   d'un site sur deux, et elle passait entièrement à travers.
    r"(?P<avant_devise>[€$])?\s*"
    r"(?P<prix>\d[\d\s.,  ]{2,12})\s*"
    r"(?P<devise>ariary|ar\b|mga|€|\$|euros?|eur\b|usd)?\s*"
    # ⚠ LA QUEUE EST LIBRE, MAIS SANS CHIFFRE. Elle ne sert qu'à lire l'unité
    #   et n'acceptait que « /nuit » ou « pers » : « 50 € HT » et « 180 000 Ar
    #   par chambre » n'atteignaient jamais la fin de ligne et tombaient.
    #   Interdire les chiffres suffit à garder la convention « le dernier
    #   nombre de la ligne est le prix ».
    r"(?P<suite>[^\d\n]{0,28})$",
    re.I | re.M,
)

# Une ligne qui ne porte QUE le prix : « € 70.00 », « 50€ HT », « 180 000 Ar ».
# C'est la mise en page des sites d'hôtel — le libellé de la chambre est un
# titre, le prix vient trois lignes plus bas, et la lecture ligne à ligne les
# perdait tous les deux.
# ⚠ LA DEVISE EST EXIGÉE ICI. Sans elle, « 2026 » ou « 150 » (une année, un
#   nombre de m², un numéro) deviendrait un tarif de chambre.
MOTIF_PRIX_SEUL = re.compile(
    r"^[\s\-•·*]*"
    r"(?:(?:a partir de|des|prix|tarif|from)\s*[:\-–—]?\s*)?"
    r"(?P<avant_devise>[€$])?\s*"
    r"(?P<prix>\d[\d\s.,  ]{1,12})\s*"
    r"(?P<devise>ariary|ar\b|mga|€|\$|euros?|eur\b|usd)?\s*"
    r"(?P<suite>[^\d\n]{0,30})$",
    re.I,
)

MOTS_SAISON = (r"haute saison|basse saison|moyenne saison|saison seche"
               r"|saison des pluies|toute l'annee|high season|low season"
               r"|peak season|rest of the year")

# Un libellé de chambre est un TITRE : court, et il se lit seul. Sans ce
# filtre, « Le Camp Catta vous propose 4 types d'hébergement (Bungalow
# confort, …) » devenait un type de chambre.
MOTS_PAS_UN_LIBELLE = (
    "voir les disponibilit", "reserver", "en savoir plus", "voir la chambre",
    "decouvrir", "nous contacter", "cliquez", "vous propose",
    "nos hebergements", "options d'hebergement",
)


def _prix_de_grille(trouve, taux: dict | None = None,
                    mini: int = 5_000, maxi: int = 5_000_000,
                    ligne: str = "") -> dict | None:
    """Le prix d'une correspondance de grille — ariary direct, ou devise convertie.

    Rend {"prix_ar", "devise", "origine", "note", "nom_court"} ou None. La note
    n'est remplie QUE sur une conversion : elle est la preuve qu'il faudra
    refaire le calcul quand le taux bougera.

    ⚠ L'ARIARY GAGNE TOUJOURS. Quand la ligne donne les deux (« 165 000 Ar /
      35 € »), c'est le montant affiché en ariary qui part en base : une
      conversion, même honnête, reste une estimation.
    """
    valeur = _nombre(trouve.group("prix"))
    if valeur is None:
        return None
    groupes = trouve.groupdict()
    devise = nom_de_devise(groupes.get("devise") or groupes.get("avant_devise"))
    if devise == "MGA":
        if not mini <= valeur <= maxi:
            return None
        return {"prix_ar": int(valeur), "devise": None, "origine": None,
                "note": None, "nom_court": None}

    double = _ariary_de_ligne(ligne, mini, maxi) if ligne else None
    if double:
        montant, debut = double
        return {"prix_ar": montant, "devise": None, "origine": None,
                "note": None,
                "nom_court": ligne[:debut].strip(" .:-–—•*/") or None}

    # Bornes en devise : sous 5 € ce n'est pas une nuit, au-delà de 20 000 € non
    # plus. C'est le garde-fou qui remplace celui des ariary, pas son absence.
    if not 5 <= valeur <= 20_000:
        return None
    ariary = convertir_en_ariary(valeur, devise, taux)
    if ariary is None or not mini <= ariary <= maxi:
        return None
    return {"prix_ar": ariary, "devise": devise, "origine": valeur,
            "note": note_de_conversion(valeur, devise, taux), "nom_court": None}


def _est_un_nom_de_chambre(nom: str) -> bool:
    """Un libellé de chambre nomme un couchage et ne vend pas autre chose."""
    n = sans_accent(nom)
    if len(nom) < 3 or not re.search(r"[a-zA-ZÀ-ÿ]{3}", nom):
        return False
    if any(mot in n for mot in MOTS_PAS_UNE_CHAMBRE):
        return False
    return _nomme_un_couchage(n)
# « Bungalow Saline : 165 000 Ar / 35 € » — le même tarif écrit deux fois. Le
# motif étant paresseux, il lit le DERNIER nombre, donc les 35 €, et publiait
# 178 500 Ar au lieu des 165 000 Ar affichés. L'ariary est ce que le site
# annonce : c'est lui qui gagne, la conversion n'est qu'un pis-aller.
MOTIF_ARIARY_DE_LIGNE = re.compile(
    r"(\d[\d\s.,\u202f\u00a0]{2,12})\s*(?:ariary|ar\b|mga)", re.I
)


def _ariary_de_ligne(ligne: str, mini: int = 5_000,
                     maxi: int = 5_000_000) -> tuple[int, int] | None:
    """(montant, position) du DERNIER montant en ariary de la ligne, ou None."""
    dernier = None
    for m in MOTIF_ARIARY_DE_LIGNE.finditer(ligne):
        valeur = _nombre(m.group(1))
        if valeur is not None and mini <= valeur <= maxi:
            dernier = (int(valeur), m.start())
    return dernier


def _attributs_chambre(n: str, suite: str) -> dict:
    """Unité, capacité, vue, eau chaude — lus dans le libellé et sa queue."""
    suite = sans_accent(suite or "")
    unite = "personne" if ("pers" in suite or "personne" in suite
                           or "per person" in n) else "chambre"
    capacite = None
    chiffre = re.search(r"\b(\d)\s*(?:pers|personne|adulte|pax)", n)
    if chiffre:
        capacite = int(chiffre.group(1))
    elif "double" in n or "twin" in n:
        capacite = 2
    elif "single" in n or "simple" in n:
        capacite = 1
    elif "triple" in n:
        capacite = 3
    return {
        "unite": unite, "capacite": capacite,
        "eau_chaude": bool(re.search(r"eau chaude|hot water", n)),
        "sdb_privee": not bool(re.search(r"sdb commune|salle de bain commune"
                                         r"|shared bathroom", n)),
        "vue": ("mer" if "vue mer" in n else
                "lac" if "vue lac" in n else
                "montagne" if "vue montagne" in n else None),
    }


# ⚠ EN DÉBUT DE MOT, PAS N'IMPORTE OÙ. « détente » contient « tente »,
#   « nécessaire » contient « case » : la recherche par sous-chaîne faisait
#   entrer « offrent tout le confort nécessaire à votre détente » comme type de
#   chambre, avec le prix du bungalow d'à côté. Pas de limite à droite, pour
#   que « bungalows » et « chambres » restent reconnus.
MOTIF_COUCHAGE = re.compile(
    r"\b(?:" + "|".join(sans_accent(m) for m in MOTS_CHAMBRE) + r")s?\b"
)

# Ces libellés portent un mot de couchage sans être une chambre. Sans eux,
# « Petit déjeuner standard : 23 000 Ar » entre comme un type de chambre à
# 23 000 la nuit — c'est le cas que la documentation de la fonction promet
# d'écarter, et « standard » suffisait à le faire passer.
MOTS_PAS_UNE_CHAMBRE = (
    "petit dejeuner", "petit-dejeuner", "demi pension", "demi-pension",
    "pension complete", "taxe", "transfert", "massage", "excursion",
    "location de board", "menu", "diner", "dejeuner", "prix chambre",
    "room price", "number of", "prix de la chambre",
)


def _nomme_un_couchage(n: str) -> bool:
    return bool(MOTIF_COUCHAGE.search(n))


def _est_un_libelle(ligne: str, n: str) -> bool:
    """Cette ligne est-elle le TITRE d'un type de chambre ?

    Un titre est court, se lit seul, et NOMME la chambre dès ses premiers mots.
    Une phrase de brochure de 150 signes qui cite trois hébergements n'en est
    pas un — l'accepter fabriquerait une chambre « Le Camp Catta vous propose
    4 types d'hébergement… ».

    ⚠ ET IL NE COMMENCE PAS PAR UN CHIFFRE. « 1 pièce avec lit double + 1 pièce
      avec Twin » décrit le couchage du bungalow annoncé juste au-dessus ; le
      prendre pour un titre volait son prix au vrai libellé (Couleur Café).
    """
    if not (3 <= len(ligne) <= 70) or len(ligne.split()) > 10:
        return False
    if re.match(r"^[\d+•\-*]", ligne.strip()):
        return False
    if any(mot in n for mot in MOTS_PAS_UN_LIBELLE + MOTS_PAS_UNE_CHAMBRE):
        return False
    # Le mot qui nomme le couchage doit être dans les quatre premiers : au-delà,
    # la ligne parle d'autre chose et le cite en passant.
    return _nomme_un_couchage(" ".join(n.split()[:4]))


def types_de_chambre(texte: str, taux: dict | None = None) -> list[dict]:
    """Les chambres chiffrées d'une grille de tarifs.

    ⚠ LE SEUIL DE PRIX FAIT LE TRI. Une page de tarifs croise des nuitées
      (30 000 à 2 000 000 Ar) et des lignes qui n'en sont pas : « 2 personnes »,
      « chambre 12 », un numéro de téléphone, une année. Sous 5 000 Ar une nuit
      n'existe pas à Madagascar, au-delà de 5 000 000 non plus.

    ⚠ ET LE LIBELLÉ DOIT NOMMER UN COUCHAGE — le libellé, pas la ligne. Le
      test portait sur la ligne entière : « tarif de 250 000 Ar pour la villa »
      créait donc une chambre nommée « tarif de ».

    Trois lectures, dans cet ordre :
      ① la ligne se suffit — « Bungalow vue mer : 180 000 Ar » ;
      ② le libellé est un titre et le prix vient plus bas, seul sur sa ligne.
        C'est la mise en page de tous les sites d'hôtel lus le 24/08/2026
        (Babaomby, Couleur Café), et c'est elle qui laissait 55 chambres sur 94
        sans prix ;
      ③ « Basse Saison : 100 €/nuit » — un tarif de saison, rattaché au dernier
        libellé rencontré.

    `taux` : table de conversion des devises (None = celle du module, {} = ne
    rien convertir). Un prix converti porte sa note dans `description`, pour
    qu'on sache toujours quel chiffre a vraiment été lu sur la page.
    """
    lignes = [l.strip() for l in texte.split("\n")]
    # « === https://…/chambres.html === » est le séparateur de page posé par le
    # collecteur, pas un libellé : il contient tous les mots du métier.
    utiles = [(i, l) for i, l in enumerate(lignes)
              if l and len(l) <= 200 and not l.startswith("===")]

    trouvees: list[dict] = []
    saison = None
    servies: set[int] = set()          # lignes déjà transformées en chambre
    prix_pris: set[int] = set()        # lignes de prix déjà attribuées
    for rang, (i, ligne) in enumerate(utiles):
        if len(ligne) > 160:
            continue
        n = sans_accent(ligne)

        # ── ③ Saisons ───────────────────────────────────────────────────────
        if re.search(MOTS_SAISON, n) and len(ligne) <= 60:
            trouve = MOTIF_LIGNE_CHAMBRE.match(ligne)
            prix = _prix_de_grille(trouve, taux, ligne=ligne) if trouve else None
            if prix is None:
                # Un intitulé de saison nu s'applique aux lignes qui suivent.
                if not re.search(r"\d{4,}", ligne):
                    saison = ligne.strip(" :–—-")
                continue
            # La saison porte elle-même le prix : c'est un TARIF, rattaché au
            # dernier libellé de couchage vu. Pas plus loin que la section
            # courante, sinon on collerait un prix à une chambre d'ailleurs.
            ancre = next(
                (l for k, (_, l) in reversed(list(enumerate(utiles[:rang])))
                 if rang - k <= 25 and _est_un_libelle(l, sans_accent(l))), None
            )
            if not ancre:
                continue
            libelle = ancre.strip(" .:-–—•*")
            etiquette = re.split(r"[:\-–—]", ligne, 1)[0].strip() or None
            trouvees.append({
                "nom": libelle[:120], "prix_ar": prix["prix_ar"],
                "saison": etiquette, "description": prix["note"],
                **_attributs_chambre(sans_accent(libelle), trouve.group("suite")),
            })
            servies.add(i)
            continue

        if MOTIF_TEL.search(ligne):
            continue

        # ── ① La ligne se suffit ────────────────────────────────────────────
        if _nomme_un_couchage(n):
            trouve = MOTIF_LIGNE_CHAMBRE.match(ligne)
            prix = _prix_de_grille(trouve, taux, ligne=ligne) if trouve else None
            if prix is not None:
                nom = trouve.group("nom").strip(" .:-–—•*")
                if prix.get("nom_court"):
                    nom = prix["nom_court"]
                if _est_un_nom_de_chambre(nom):
                    trouvees.append({
                        "nom": nom[:120], "prix_ar": prix["prix_ar"],
                        "saison": saison, "description": prix["note"],
                        **_attributs_chambre(sans_accent(nom), trouve.group("suite")),
                    })
                    servies.add(i)
                    continue

        # ── ② Le libellé est un titre, le prix vient plus bas ───────────────
        if i in servies or not _est_un_libelle(ligne, n):
            continue
        for j, suivante in utiles[rang + 1:rang + 1 + 8]:
            m = sans_accent(suivante)
            # Un autre libellé ouvre le bloc suivant ; un en-tête de saison
            # ouvre une GRILLE à colonnes, qu'une lecture ligne à ligne ne sait
            # pas reconstituer (Tsara Komba : quatre prix, deux chambres, deux
            # occupations). Dans les deux cas on s'arrête au lieu de deviner.
            if _est_un_libelle(suivante, m) or re.search(MOTS_SAISON, m):
                break
            if j in prix_pris or MOTIF_TEL.search(suivante):
                continue
            trouve = MOTIF_PRIX_SEUL.match(m)
            if not trouve or not (trouve.group("devise")
                                  or trouve.group("avant_devise")):
                continue
            prix = _prix_de_grille(trouve, taux, ligne=suivante)
            if prix is None:
                continue
            libelle = ligne.strip(" .:-–—•*")
            trouvees.append({
                "nom": libelle[:120], "prix_ar": prix["prix_ar"],
                "saison": saison, "description": prix["note"],
                **_attributs_chambre(n, trouve.group("suite")),
            })
            # ⚠ UNE LIGNE DE PRIX NE SE DONNE QU'UNE FOIS. Sur une grille
            #   aplatie (Savannah Beach), trois libellés se servaient tour à
            #   tour dans les mêmes quatre prix et fabriquaient douze chambres.
            prix_pris.add(j)
            break

    # Deux fois le même libellé = deux saisons, ou une répétition de mise en
    # page. On garde la première occurrence de chaque couple (nom, prix).
    vus, propres = set(), []
    for chambre in trouvees:
        cle = (chambre["nom"].lower(), chambre["prix_ar"], chambre.get("saison"))
        if cle in vus:
            continue
        vus.add(cle)
        propres.append(chambre)
    return propres
# ── Circuits d'agence ────────────────────────────────────────────
# 🔴 `tours` EST VIDE SUR DIAKO alors que 233 trouvailles sont des agences de
#    voyage. La raison n'est pas l'écriture, c'est la lecture : `lignes_circuit`
#    n'avait qu'UN producteur, `analyse_llm.py`, et la passerelle tombe par
#    vagues. Un circuit se lit pourtant très bien par règles — une durée, un
#    tarif par personne, des étapes, une liste d'inclusions — parce que les
#    agences écrivent toutes de la même façon.
#
# ⚠ LA DURÉE EST LA CLÉ DE VOÛTE. `tours.duration_days` est l'entier sur lequel
#   le site filtre : un circuit sans durée lisible ne sert à rien, et une durée
#   approximative le fait ressortir dans les mauvaises recherches. Sans durée,
#   on ne rend rien.
MOTIFS_DUREE = (
    # « 7 Jours / 6 Nuits », « 2 jours & 1 nuit », « 9 jours / 8 nuits »
    re.compile(r"(?P<jours>\d{1,2})\s*jours?\b[^\d\n]{0,6}(?P<nuits>\d{1,2})\s*nuit"),
    # « 2 nuits / 3 jours »
    re.compile(r"(?P<nuits>\d{1,2})\s*nuits?\b[^\d\n]{0,6}(?P<jours>\d{1,2})\s*jours?"),
    # « 7J/6N » — l'abrégé des brochures
    re.compile(r"(?P<jours>\d{1,2})\s*j\s*/\s*(?P<nuits>\d{1,2})\s*n\b"),
    # « (8 jours) », « circuit de 5 jours », « 2JOURS »
    re.compile(r"(?P<jours>\d{1,2})\s*jours?\b"),
)

# Une agence qui raconte un souvenir n'offre pas un circuit. Sans un de ces
# mots, « on a passé 3 jours à Nosy Be » deviendrait un produit à vendre.
MOTS_OFFRE_CIRCUIT = (
    "circuit", "excursion", "sejour", "voyage organise", "pack", "forfait",
    "tour operateur", "programme", "itineraire", "depart", "reservation",
    "places disponibles", "places limitees", "tarif", "combo", "bivouac",
    "escapade", "safari",
)

# Ces montants ne sont PAS le prix du circuit : l'acompte qui réserve la place,
# le supplément étranger, la remise enfant. Les confondre publierait
# « Ampefy 2 jours à 50 000 Ar » là où le tarif est 160 000.
MOTS_PAS_LE_PRIX = (
    "reservation", "acompte", "arrhes", "caution", "supplement", "si etranger",
    "si etrangers", "en plus", "enfant", "zaza", "reduction", "remise",
    "annulation", "penalite", "gratuit", "+",
)

INCLUSIONS_CIRCUIT = (
    ("pension complète", r"pension complete"),
    ("demi-pension", r"demi[- ]pension"),
    ("petit déjeuner", r"petits? dejeuners?"),
    ("repas", r"\brepas\b|dejeuner|diner|sakafo"),
    ("guide", r"\bguides?\b|guidage"),
    ("transport", r"\btransports?\b|transfert"),
    ("hébergement", r"hebergement|nuitees?\b|bungalow|\bhotel\b|\btentes?\b"),
    ("droits d'entrée", r"tickets? d[’']entree|droits? d[’']entree|frais d[’']entree"),
    ("vol", r"\bvols?\b|\bavion\b"),
    ("boissons", r"boissons?"),
)

TRANSPORTS_CIRCUIT = (
    ("avion", r"\bavion\b|\bvol\b|aerien"),
    ("bateau", r"\bbateau|\bvedette|\bboutre|\bpirogue|\bcatamaran|\bhors[- ]bord"),
    ("4x4", r"4\s?[x*×]\s?4|\bland ?cruiser\b|\bhilux\b|tout[- ]terrain"),
    ("minibus", r"mini[- ]?bus|\bsprinter\b|\bcoaster\b"),
    ("van", r"\bvans?\b|\bstarex\b|\bhiace\b"),
    ("bus", r"\bbus\b|taxi[- ]brousse"),
    ("train", r"\btrain\b|\bfce\b"),
    ("vélo", r"\bvelos?\b|\bvtt\b"),
)

# Le fil Facebook insère ses propres lignes dans le texte copié. Aucune ne
# peut être le titre d'un circuit.
BRUIT_FIL = re.compile(
    r"^(?:·|\+\d+|en ligne|indicateur de statut(?:\s+en ligne)*|contenu ia|voir moins|voir plus"
    r"|suivre|· suivre|ecrivez un commentaire public\.*|tous les commentaires"
    r"|.* · audio d[’']origine|\d+ (?:j|h|min|sem))$", re.I
)


# ⚠ LE CHROME DE FACEBOOK NE TIENT PAS TOUJOURS SA PROPRE LIGNE. `BRUIT_FIL`
#   est ancré (`^…$`) et ne voyait pas « … #photograph #reportage Voir moins… »
#   collé à la fin d'un récit : 105 des 213 récits visibles en ligne le
#   03/09/2026 en portaient, dont « Indicateur de statut En ligne En ligne » en
#   tête de deux d'entre eux. Celui-ci se retire PARTOUT dans le texte.
BRUIT_INLINE = re.compile(
    r"(?i)(?:indicateur de statut(?:\s+en ligne)*"
    r"|contenu ia"
    r"|voir (?:moins|plus)\s*(?:\u2026|\.{2,3})?"
    r"|\u00b7\s*suivre\b"
    r"|\u00e9crivez un commentaire public\s*(?:\u2026|\.{2,3})?"
    r"|ecrivez un commentaire public\s*(?:\u2026|\.{2,3})?"
    r"|tous les commentaires"
    r"|\u00b7\s*audio d[\u2019']origine"
    r"|afficher la traduction)"
)


def sans_bruit_de_fil(texte: str) -> str:
    """Le texte sans le chrome de l'interface, où qu'il se trouve."""
    propre = BRUIT_INLINE.sub(" ", texte or "")
    # Le bruit retiré laisse ses séparateurs : « TL Voyage · · LOCATION ».
    propre = re.sub(r"(?:\s*·\s*){2,}", " · ", propre)
    propre = re.sub(r"[ \t]{2,}", " ", propre)
    propre = re.sub(r"\s*·\s*$", "", propre, flags=re.M)
    return re.sub(r" +\n", "\n", propre).strip()


def duree_de_circuit(texte: str) -> tuple[int | None, int | None, int]:
    """(jours, nuits, position) de la durée annoncée. (None, None, -1) sinon.

    ⚠ UNE DURÉE PLAUSIBLE, PAS N'IMPORTE QUEL NOMBRE SUIVI DE « JOURS ». Au-delà
      de 30 jours ce n'est plus un circuit vendu à Madagascar, et un nombre de
      nuits supérieur au nombre de jours trahit une lecture ratée.

    ⚠ ET LA PLUS TÔT DANS LE TEXTE, pas la mieux formée. Le titre annonce
      « 9 JOURS » et le corps répète « 9 jours / 8 nuits » : privilégier la
      forme riche renvoyait une position au milieu du texte, et le titre du
      circuit devenait la phrase d'ambiance qui la précédait.
    """
    n = sans_accent(texte)
    trouvailles = []
    for motif in MOTIFS_DUREE:
        for trouve in motif.finditer(n):
            groupes = trouve.groupdict()
            jours = int(groupes["jours"])
            nuits = int(groupes["nuits"]) if groupes.get("nuits") else None
            if not 1 <= jours <= 30:
                continue
            if nuits is not None and not jours - 2 <= nuits <= jours:
                continue
            trouvailles.append((trouve.start(), nuits is None, jours, nuits))
    if not trouvailles:
        return None, None, -1
    # À position égale, la forme qui donne aussi les nuits l'emporte.
    debut, _, jours, nuits = min(trouvailles)
    memes = [t for t in trouvailles if t[0] == debut] + [
        t for t in trouvailles if abs(t[0] - debut) <= 12 and t[3] is not None]
    riche = min(memes, key=lambda t: (t[1], t[0]))
    return riche[2], riche[3], riche[0]
# Un pays n'est pas une étape de circuit : « Madagascar » est cité par toutes
# les annonces et arrivait en tête de toutes les listes d'étapes.
LIEUX_TROP_LARGES = ("madagascar", "afrique", "europe", "france", "ocean indien")


def etapes_citees(texte: str, noms_connus: list[str]) -> list[str]:
    """Les lieux du référentiel Diako cités dans le texte, dans l'ordre du récit.

    ⚠ QUATRE LETTRES AU MINIMUM. Le référentiel porte 18 334 lieux, dont des
      milliers de hameaux aux noms de trois lettres : les laisser entrer
      transformerait n'importe quelle syllabe en étape de circuit.

    ⚠ ET PAS DEUX FOIS LE MÊME ENDROIT. Les noms sont essayés du plus long au
      plus court, et la place prise par « Nosy Iranja » est rendue
      indisponible : sans ça, le hameau « Nosy » ressortait à chaque île et la
      liste d'étapes racontait n'importe quoi.
    """
    n = sans_accent(texte)
    pris: list[tuple[int, int]] = []
    vus: dict[str, int] = {}
    for nom in noms_connus or []:
        if len(nom) < 4:
            continue
        cle = sans_accent(nom)
        if cle in vus or cle in LIEUX_TROP_LARGES or cle not in n:
            continue
        for trouve in re.finditer(rf"\b{re.escape(cle)}\b", n):
            if any(trouve.start() < f and d < trouve.end() for d, f in pris):
                continue
            pris.append((trouve.start(), trouve.end()))
            vus[cle] = trouve.start()
            break
    ordonnes = sorted(vus.items(), key=lambda c: c[1])
    # On rend le nom tel qu'il est écrit dans le référentiel, pas sans accents :
    # c'est lui qui sera rapproché ensuite.
    par_cle = {sans_accent(nom): nom for nom in (noms_connus or [])}
    return [par_cle[cle] for cle, _ in ordonnes][:12]
def inclusions(texte: str) -> list[str]:
    """Ce que le tarif comprend, tel que l'annonce le dit.

    Deux formes, et seulement celles-là : une section « INCLUS : » (qui s'arrête
    net à « NON INCLUS » — sans cette borne, on publierait comme inclus tout ce
    que le client doit payer en plus), ou un « X inclus » en toutes lettres.
    """
    lignes = sans_accent(texte).split("\n")
    dedans: list[str] = []
    section = False
    for ligne in lignes:
        nu = ligne.strip(" :–—-*•")
        if re.match(r"^(?:non[- ]inclus|ne comprend pas|non compris|exclus)\b", nu):
            section = False
            continue
        if re.match(r"^(?:inclus|ce qui est inclus|le tarif comprend"
                    r"|comprenant|nos prestations|compris)\b", nu):
            section = True
            continue
        if section and nu:
            dedans.append(nu)
    matiere = "\n".join(dedans)

    trouvees = []
    for etiquette, motif in INCLUSIONS_CIRCUIT:
        if matiere and re.search(motif, matiere):
            trouvees.append(etiquette)
            continue
        # Hors section : le mot doit être collé à « inclus » ou « compris ».
        n = sans_accent(texte)
        if re.search(rf"(?:{motif})[^.\n]{{0,24}}(?:inclus|compris|offert)", n) or \
           re.search(rf"(?:avec|inclus|comprend)[^.\n]{{0,20}}(?:{motif})", n):
            trouvees.append(etiquette)
    return trouvees[:12]


def transports_cites(texte: str) -> list[str]:
    n = sans_accent(texte)
    return [etiquette for etiquette, motif in TRANSPORTS_CIRCUIT
            if re.search(motif, n)][:6]


def prix_de_circuit(texte: str) -> dict | None:
    """Le tarif du circuit — PAR PERSONNE, annoncé comme tel, et le plus bas.

    ⚠ DEUX CONDITIONS, PAS UNE. L'unité (« par personne ») ne suffit pas : une
      annonce de circuit cite l'acompte, le supplément étranger, le prix d'une
      sortie en bateau — tous « par personne ». Le montant doit AUSSI être
      présenté comme le tarif du voyage, sinon on publie une excursion à
      50 000 Ar là où le séjour en vaut cinq cent mille.
    """
    candidats = []
    for m in montants(texte):
        if m["unite"] not in ("personne", "circuit"):
            continue
        if not 10_000 <= m["montant"] <= 50_000_000:
            continue
        if any(mot in m["avant"] for mot in MOTS_PAS_LE_PRIX):
            continue
        if not re.search(r"tarif|prix|pack|forfait|circuit|sejour|voyage",
                         m["avant"]):
            continue
        candidats.append(m)
    if not candidats:
        return None
    choisi = min(candidats, key=lambda m: m["montant"])
    return {"montant": choisi["montant"],
            "unite": "personne" if choisi["unite"] == "personne" else "circuit"}
def _titre_de_circuit(texte: str, position: int) -> str | None:
    """Le titre : la ligne qui porte la durée, ou la première ligne qui nomme.

    ⚠ LA LIGNE DE DURÉE N'EST PAS TOUJOURS UN TITRE. Mesuré sur les annonces
      réelles : « 2 jours • 1 nuit • Une expérience inoubliable », « 10 Septembre
      au 17 Septembre 2026 (8 jours) », « À seulement 475 000 Ar par personne »
      — une durée, une date, un prix. Aucune ne dit OÙ l'on va, et c'est le
      titre qui devient le nom du circuit sur Diako et son adresse web. Le nom
      est alors juste au-dessus.
    """
    lignes = texte.split("\n")
    debuts, curseur = [], 0
    for ligne in lignes:
        debuts.append(curseur)
        curseur += len(ligne) + 1
    indice = max((k for k, d in enumerate(debuts) if d <= position), default=0)

    def parlante(k: int) -> str | None:
        if not 0 <= k < len(lignes):
            return None
        ligne = lignes[k].strip(" .:–—-•*")
        if not (3 < len(ligne) <= 160) or BRUIT_FIL.match(sans_accent(ligne)):
            return None
        return ligne

    def nomme_le_voyage(ligne: str) -> bool:
        """Une ligne qui nomme : assez longue, sans date, sans prix, sans mot-dièse."""
        n = sans_accent(ligne)
        if len(n.replace(" ", "")) < 8:
            return False
        if re.match(r"^[#@]|^en #", n):
            return False
        if re.match(r"^\d|^(?:tarif|prix|date|du \d|le \d)\b", n):
            return False
        return not re.search(r"\d[\d\s.,]*\s*(?:ar\b|ariary|mga|€|euros?)", n)

    ligne = parlante(indice)
    # Une ligne trop courte pour nommer quoi que ce soit — « 9 jours / 8 nuits »
    # — ou qui donne la date ou le tarif : le nom est au-dessus.
    if ligne and (len(sans_accent(ligne).replace(" ", "")) <= 24
                  or not nomme_le_voyage(ligne)):
        for k in range(indice - 1, max(-1, indice - 6), -1):
            au_dessus = parlante(k)
            if au_dessus and nomme_le_voyage(au_dessus):
                return au_dessus[:160]
    if ligne:
        return ligne[:160]
    for k in range(len(lignes)):
        ligne = parlante(k)
        if ligne:
            return ligne[:160]
    return None
def circuits(texte: str, noms_de_lieux: list[str] | None = None) -> list[dict]:
    """Le circuit vendu par une agence, lu par règles. [] si le texte n'en vend pas.

    UN circuit par publication, jamais plus : une annonce qui cite deux durées
    (« 3 jours à Nosy Be, ou 5 jours avec Nosy Iranja ») ne dit pas quel tarif
    va avec laquelle, et fabriquer les deux mettrait un prix faux sur l'une.
    """
    jours, nuits, position = duree_de_circuit(texte)
    if not jours:
        return []
    # ⚠ UNE OFFRE ANNONCE SA DURÉE D'ENTRÉE DE JEU. Mesuré sur les 233 agences
    #   du 24/08/2026 : « Au-delà de 7 jours les prix seront adaptés » (une note
    #   de bas de page d'un lodge) et « Ai-je besoin d'un visa… 15 jours » (une
    #   FAQ) fabriquaient des circuits de 7 et 15 jours. Aucune vraie annonce ne
    #   cache sa durée au-delà des premières lignes.
    if position > 400:
        return []
    n = sans_accent(texte)
    if not any(mot in n for mot in MOTS_OFFRE_CIRCUIT):
        return []
    titre = _titre_de_circuit(texte, position)
    if not titre:
        return []

    etapes = etapes_citees(texte, noms_de_lieux or [])
    prix = prix_de_circuit(texte)
    inclus = inclusions(texte)

    depart = None
    explicite = re.search(r"depart\s*[:–—-]\s*([^\n]{3,60})", n)
    if explicite:
        # « Départ : INSTAT ANOSY 7h00 » — l'heure n'est pas le lieu.
        depart = re.sub(r"\s*\d{1,2}\s*h\s*\d{0,2}\s*$", "",
                        explicite.group(1)).strip(" .,;–—-")
    elif len(etapes) >= 2:
        depart = etapes[0]
    arrivee = etapes[-1] if len(etapes) >= 2 and etapes[-1] != depart else None

    morceaux = [f"{jours} jour(s)" + (f" / {nuits} nuit(s)" if nuits else "")]
    if etapes:
        morceaux.append("Étapes : " + " → ".join(etapes[:8]))
    if inclus:
        morceaux.append("Inclus : " + ", ".join(inclus))
    return [{
        "titre": titre,
        "resume": ". ".join(morceaux)[:600],
        "jours": jours,
        "nuits": nuits,
        "prix_ar": prix["montant"] if prix else None,
        "prix_unite": prix["unite"] if prix else "personne",
        "base_personnes": None,
        "depart": depart,
        "arrivee": arrivee,
        "transports": transports_cites(texte),
        "inclus": inclus,
    }]


# ── Location de véhicules ───────────────────────────────────────────────────
# Un loueur publie une grille comme un hôtel : un libellé, un prix. Ce qui
# change, c'est l'unité (le jour, jamais la nuit) et le vocabulaire (chauffeur,
# carburant, caution).
#
# ⚠ LES CLÉS SONT EXACTEMENT LES VALEURS DE LA CONTRAINTE
#   `vehicle_offers.vehicle_type` (migration 0114). En inventer une ferait
#   échouer l'INSERT ENTIER côté Diako, pas seulement la ligne fautive.
# ⚠ MESURÉ SUR LES 58 ANNONCES DU 24/08/2026 : pas une seule ne produisait
#   d'offre. Trois causes, toutes de vocabulaire — « 4×4 » et « 4*4 » écrits
#   avec une étoile ou un signe multiplier, « SUV 4WD » qui ne dit jamais
#   « 4x4 », et « voiture »/« véhicule » tout court, qui est la façon normale
#   d'annoncer une location à Madagascar.
TYPES_VEHICULE = {
    "4x4": (r"4\s?[x*×]\s?4", r"pick[ -]?up", r"tout[- ]terrain", r"4\s?wd",
            r"\bsuv\b"),
    "berline": (r"berlines?",),
    "citadine": (r"citadines?",),
    "minibus": (r"mini[- ]?bus",),
    "van": (r"\bvans?\b", r"fourgons?"),
    "moto": (r"\bmotos?\b", r"scooters?"),
    "quad": (r"\bquads?\b",),
    "bateau": (r"bateaux?", r"vedettes?", r"hors[- ]bord"),
    "velo": (r"\bvelos?\b", r"\bvtt\b", r"bicyclettes?"),
    "camion": (r"camions?",),
    # ⚠ EN DERNIER, TOUJOURS. `_type_vehicule` rend le premier type qui
    #   correspond : placé plus haut, « voiture » raflerait les 4x4 et les
    #   minibus, qui sont aussi des voitures. 'autre' est une valeur de la
    #   contrainte `vehicle_offers_vehicle_type`, pas un bouche-trou.
    "autre": (r"\bvoitures?\b", r"\bautos?\b", r"\bvehicules?\b",
              r"tete de cortege"),
}

# Un nom de modèle connu sert deux fois : il remplit `model`, et il dit le type
# quand la ligne ne le dit pas — « Hilux 250 000 Ar/jour » EST un 4x4, même si
# le mot « 4x4 » n'apparaît pas sur la ligne.
MODELES_VEHICULE = {
    "hilux": "4x4", "land cruiser": "4x4", "landcruiser": "4x4", "prado": "4x4",
    "pajero": "4x4", "defender": "4x4", "ranger": "4x4", "navara": "4x4",
    "everest": "4x4", "sprinter": "minibus", "crafter": "minibus",
    "coaster": "minibus", "starex": "van",
    # Relevés dans les annonces réelles : ce sont EUX que les loueurs citent,
    # bien plus souvent que le mot « 4x4 ».
    "sorento": "4x4", "santa fe": "4x4", "tucson": "4x4", "galloper": "4x4",
    "terios": "4x4", "rav4": "4x4", "duster": "4x4", "jimny": "4x4",
    "patrol": "4x4", "x-trail": "4x4", "captiva": "4x4",
    "picanto": "citadine",
    "hiace": "minibus",
}

# « 250 000 Ar/jour », « 250 000 par jour », « 250 000 Ar isan'andro ». La
# devise est optionnelle ICI seulement : le contexte (un véhicule + « par
# jour ») est assez fort pour qu'un montant nu soit un prix, pas une année.
MOTIF_PRIX_JOUR = re.compile(
    r"(?P<nombre>\d[\d\s.,  ]{2,12})\s*(?:ar\b|ariary|mga)?\s*"
    r"(?:/\s?j(?:our)?\b|par jour|le jour|la journee|isan[’' -]?andro)"
)


def _type_vehicule(n: str) -> tuple[str | None, str | None]:
    """(type, modèle) lus dans un fragment normalisé. (None, None) si rien de sûr.

    ⚠ « AUTRE » NE DOIT JAMAIS ÉCRASER UN MODÈLE CONNU. Le mot « véhicule »
      apparaît dans presque toutes les annonces : sans cette règle, un
      « Hyundai Tucson avec chauffeur privé » sortait en type 'autre' alors que
      le modèle dit clairement un 4x4.

    ⚠ ET UN MODÈLE D'UN AUTRE TYPE N'EST PAS LE MODÈLE DE CE VÉHICULE.
      « Starex, 4*4, bus et tête de cortège » énumère une flotte : coller
      « Starex » (un van) sur le type 4x4 fabriquerait un véhicule qui n'existe
      pas. Dans le doute, on garde le type et on lâche le modèle.
    """
    modele, type_du_modele = None, None
    for nom, type_deduit in MODELES_VEHICULE.items():
        if re.search(rf"\b{re.escape(nom)}\b", n):
            modele, type_du_modele = nom.title(), type_deduit
            break
    for code, motifs in TYPES_VEHICULE.items():
        if any(re.search(motif, n) for motif in motifs):
            if code == "autre" and type_du_modele:
                return type_du_modele, modele
            return code, (modele if type_du_modele in (None, code) else None)
    return (type_du_modele, modele) if type_du_modele else (None, None)
def _prix_par_jour(fragment: str) -> int | None:
    """Le prix journalier d'un fragment, ou None. Jamais un montant sans « jour »."""
    n = sans_accent(MOTIF_TEL.sub(" ", fragment))
    trouve = MOTIF_PRIX_JOUR.search(n)
    if trouve:
        valeur = _nombre(trouve.group("nombre"))
        if valeur and 3_000 <= valeur <= 5_000_000:
            return int(valeur)
    # « Tarif par jour : 250 000 Ar » — le mot « jour » précède le montant.
    # `montants()` regarde une fenêtre avant ET après : on le laisse trancher.
    par_jour = [m for m in montants(fragment) if m["unite"] == "jour"
                and 3_000 <= m["montant"] <= 5_000_000]
    return par_jour[0]["montant"] if par_jour else None


def _attributs_vehicule(n: str) -> dict:
    """Chauffeur, carburant, caution, places, km — lus dans un fragment normalisé.

    ⚠ CHAQUE ATTRIBUT NON DIT RESTE None. `vehicle_offers.with_driver` a un
      défaut en base (true — c'est la norme à Madagascar) : c'est à la base de
      l'appliquer, pas à nous d'écrire « avec chauffeur » qu'on n'a pas lu.
    """
    sortie: dict = {"avec_chauffeur": None, "carburant_inclus": None,
                    "caution_ar": None, "places": None, "km_par_jour": None}
    avec = bool(re.search(r"avec chauffeur", n))
    sans = bool(re.search(r"sans chauffeur|auto[- ]conduite|self[- ]?drive", n))
    # ⚠ « disponibles avec chauffeur OU sans chauffeur » : les deux sont vrais,
    #   donc aucun ne l'est. Le premier test gagnait, et Locamad Nosy Be
    #   partait en base « avec chauffeur » alors qu'il propose les deux.
    if avec and not sans:
        sortie["avec_chauffeur"] = True
    elif sans and not avec:
        sortie["avec_chauffeur"] = False

    # 🔴 LA NÉGATION D'ABORD. « Carburant non inclus » contient
    #    « carburant … inclus » : le test positif gagnait, et TL Voyage partait
    #    en base carburant compris alors que son annonce dit l'inverse.
    if re.search(r"(?:hors|sans)\s+(?:carburant|essence|gasoil)"
                 r"|(?:carburant|essence|gasoil|gazole|fuel)[^.\n]{0,14}"
                 r"(?:non inclus|non compris|en sus|a (?:votre |la )?charge)", n):
        sortie["carburant_inclus"] = False
    elif re.search(r"(?:carburant|essence|gasoil|gazole|fuel)[^.\n]{0,14}"
                   r"(?:inclus|compris)", n):
        sortie["carburant_inclus"] = True

    caution = re.search(
        r"(?:caution|depot de garantie|garantie)\D{0,14}"
        r"(\d[\d\s.,  ]{2,12})\s*(?:ar\b|ariary|mga)?", n
    )
    if caution:
        valeur = _nombre(caution.group(1))
        if valeur and 10_000 <= valeur <= 50_000_000:
            sortie["caution_ar"] = int(valeur)

    places = re.search(r"(\d{1,2})\s*places", n)
    if places and 1 <= int(places.group(1)) <= 70:
        sortie["places"] = int(places.group(1))

    km = re.search(r"(\d{2,4})\s*km\s*(?:/|par)?\s*jour", n)
    if km:
        sortie["km_par_jour"] = int(km.group(1))
    return sortie


# Le mot qui dit que le tarif est journalier. Il n'est presque jamais sur la
# même ligne que le montant : « 100 000 Ar en ville » puis, deux lignes plus
# bas, « (Journée de 8h à 18h) ».
MOTS_JOURNEE = (r"journee|par jour|/\s?jour|le jour|isan[’' -]?andro"
                r"|24\s?h\s?/\s?24|jour et nuit")

# Un loueur qui ne chiffre pas dit quand même quelque chose du prix. C'est
# `vehicle_offers.price_note`, et c'est mieux qu'une fiche vide : « tarif à
# discuter » se lit, « NULL » ne se lit pas.
MOTIFS_NOTE_PRIX = (
    r"tarifs?[^.\n]{0,30}(?:a discuter|negociable|sur demande|sur devis|abordable)",
    r"prix[^.\n]{0,34}(?:abordable|negociable|a discuter|sur demande|sur devis)",
    r"a partir de\s*\d[\d\s.,\u202f\u00a0]{2,12}\s*(?:ar\b|ariary|mga)",
)


def _note_de_prix(texte: str) -> str | None:
    """Ce que l'annonce dit du prix quand elle ne le chiffre pas.

    ⚠ « À PARTIR DE 155 000 AR » SE LIT LIGNE PAR LIGNE, ET SUR UNE LIGNE QUI
      PARLE DE VÉHICULE. Mesuré : la même tournure ouvre un tarif de bungalow
      chez un écolodge et un pack voyage d'études à 235 000 Ar par personne.
      Les deux entraient dans `vehicle_offers`. Un tarif par personne n'est
      jamais une location de véhicule : elle se loue au véhicule.
    """
    for brute in texte.split("\n"):
        ligne = brute.strip()
        if not ligne or len(ligne) > 200:
            continue
        n = sans_accent(ligne)
        for rang, motif in enumerate(MOTIFS_NOTE_PRIX):
            trouve = re.search(motif, n)
            if not trouve:
                continue
            if rang == 2:                       # « à partir de X Ar »
                if re.search(r"\bpers\b|personne|adulte|enfant", n):
                    continue
                if not _type_vehicule(n)[0]:
                    continue
            brut = (ligne[trouve.start():trouve.end()] if len(n) == len(ligne)
                    else trouve.group(0))
            return brut.strip(" .;:-")[:200]
    return None
def _grille_en_bloc(texte: str) -> tuple[int | None, str | None]:
    """Les tarifs listés sous « Nos tarifs », le mot « jour » étant ailleurs.

    🔴 C'EST LA MISE EN PAGE LA PLUS COURANTE DES LOUEURS, et elle ne donnait
       rien : `montants()` ne cherche l'unité que dans les 40 signes qui
       entourent le montant, or « (Journée de 8h à 18h) » arrive deux lignes
       plus bas. On accepte donc le journalier au niveau du TEXTE, à condition
       que chaque ligne retenue ne soit qu'un montant et son étiquette.

    Rend (prix le plus bas, note reprenant toutes les lignes).
    """
    n = sans_accent(texte)
    if not re.search(MOTS_JOURNEE, n):
        return None, None
    retenues = []
    for brute in texte.split("\n"):
        ligne = brute.strip()
        if not ligne or len(ligne) > 120 or MOTIF_TEL.search(ligne):
            continue
        # Un tarif « par personne » est une excursion, pas une location : un
        # véhicule se loue au véhicule. Sans ce tri, « Adulte : 95 000 Ar /
        # personne » devenait le prix journalier d'un bateau.
        if re.search(r"\bpers\b|personne|adulte|enfant",
                     sans_accent(ligne)):
            continue
        trouve = re.fullmatch(
            r"[^\d]{0,20}(\d[\d\s.,\u202f\u00a0]{2,12})\s*"
            r"(?:ar\b|ariary|mga)[^\d]{0,30}", sans_accent(ligne)
        )
        if not trouve:
            continue
        valeur = _nombre(trouve.group(1))
        if valeur and 3_000 <= valeur <= 5_000_000:
            retenues.append((int(valeur), ligne))
    if not retenues:
        return None, None
    return min(v for v, _ in retenues), " ; ".join(l for _, l in retenues)[:200]


def lignes_vehicule(texte: str) -> list[dict]:
    """La grille tarifaire d'un loueur : un type de véhicule, un prix PAR JOUR.

    Même discipline que les chambres : un montant sans « jour » à côté n'est pas
    un tarif de location — c'est peut-être le prix de vente du véhicule, et le
    confondre mettrait 45 000 000 Ar la journée sur une fiche.

    ⚠ LE TÉLÉPHONE EST EFFACÉ D'ABORD, comme partout : « 034 12 345 67 »
      ressemble à un prix, et les annonces de loueurs en portent toujours un.

    Quatre passes, de la plus sûre à la plus large :
      ① ligne par ligne — « 4x4 Hilux avec chauffeur : 250 000 Ar/jour » ;
      ② tout le texte — beaucoup d'annonces décrivent UN véhicule en prose,
        avec le prix trois lignes plus bas. On n'accepte ce repli que si le
        texte ne parle que d'UN type : deux types et un seul prix, on ne sait
        pas à qui il va ;
      ③ la grille en bloc — « Nos tarifs : à partir de / 100 000 Ar en ville /
        250 000 Ar en province / (Journée de 8h à 18h) » ;
      ④ la fiche de flotte sans tarif. `price_day_ar` est NULLABLE en prod :
        un loueur avec son modèle, ses places et « tarif à discuter » vaut
        mieux qu'un loueur absent — et c'est ce que dit l'annonce.
    """
    propre = MOTIF_TEL.sub(" ", texte)
    trouvees = []
    for ligne_brute in propre.split("\n"):
        ligne = ligne_brute.strip()
        if not ligne or len(ligne) > 220:
            continue
        n = sans_accent(ligne)
        type_v, modele = _type_vehicule(n)
        if not type_v:
            continue
        prix = _prix_par_jour(ligne)
        if prix is None:
            continue
        trouvees.append({
            "type_vehicule": type_v, "modele": modele,
            "prix_jour_ar": prix, **_attributs_vehicule(n),
        })

    n_texte = sans_accent(propre)
    types_presents = {
        code for code, motifs in TYPES_VEHICULE.items()
        if any(re.search(motif, n_texte) for motif in motifs)
    }
    type_v, modele = _type_vehicule(n_texte)
    un_seul_type = type_v and len({t for t in types_presents if t != "autre"}) <= 1
    # ⚠ « VÉHICULE » TOUT SEUL N'EST PAS UN ANCRAGE. Mesuré : un voyage
    #   organisé « à partir de 1 450 000 Ariary » entrait dans `vehicle_offers`
    #   parce que son texte disait « véhicule » quelque part. Sur les passes
    #   larges, il faut un type précis ou un modèle nommé.
    ancre_sure = un_seul_type and (type_v != "autre" or modele)
    # Et le texte doit parler de LOUER. Un hôtel qui emmène ses clients en
    # bateau ne loue pas de bateau : c'est une excursion, pas une flotte.
    loue = bool(re.search(r"\blouer\b|\blocation|\blou(?:e|ons|ez)\b"
                          r"|\brent(?:al|-a-car)?\b", n_texte))

    if not trouvees and ancre_sure:
        en_prose = _prix_par_jour(propre)
        en_bloc, note = _grille_en_bloc(propre)
        # ⚠ LE PLUS BAS DES DEUX, comme partout ailleurs. « 100 000 Ar en ville /
        #   250 000 Ar en province » : la lecture en prose attrapait 250 000
        #   (le seul montant collé au mot « journée ») et affichait le tarif le
        #   plus cher comme prix d'appel du loueur.
        candidats = [p for p in (en_prose, en_bloc) if p is not None]
        if candidats:
            trouvees.append({
                "type_vehicule": type_v, "modele": modele,
                "prix_jour_ar": min(candidats),
                "note_prix": note if en_bloc is not None else None,
                **_attributs_vehicule(n_texte),
            })

    if not trouvees and type_v and loue and (type_v != "autre" or modele):
        attributs = _attributs_vehicule(n_texte)
        note = _note_de_prix(propre)
        # ⚠ PAS DE FICHE VIDE. Sans modèle, sans places et sans un mot sur le
        #   prix, il ne reste que « quelqu'un loue un véhicule » — ça n'aide
        #   personne et ça encombre la fiche du loueur.
        if modele or attributs.get("places") or note:
            trouvees.append({
                "type_vehicule": type_v, "modele": modele, "prix_jour_ar": None,
                "note_prix": note, **attributs,
            })

    # Les attributs écrits une fois pour toute l'annonce (« toutes nos voitures
    # partent avec chauffeur ») valent pour les lignes qui ne disent rien.
    if trouvees:
        globaux = _attributs_vehicule(n_texte)
        for ligne in trouvees:
            for cle in ("avec_chauffeur", "carburant_inclus", "caution_ar"):
                if ligne.get(cle) is None:
                    ligne[cle] = globaux[cle]

    # Deux fois le même couple (type, prix) = une répétition de mise en page.
    vus, propres = set(), []
    for ligne in trouvees:
        cle = (ligne["type_vehicule"], ligne.get("modele"), ligne["prix_jour_ar"])
        if cle in vus:
            continue
        vus.add(cle)
        propres.append(ligne)
    return propres
# ── Droits d'entrée d'un site ou d'un parc ──────────────────────────────────
# `attractions` porte fee_resident_ar / fee_nonresident_ar / guide_required /
# guide_fee_group_ar — toutes vides aujourd'hui. C'est ici qu'on les lit.
_FRAIS = r"(\d[\d\s.,  ]{2,10})\s*(?:ar\b|ariary|mga)?"
# ⚠ LE SÉPARATEUR NE PEUT PAS ÊTRE UN « + ». « (étranger + 20.000 Ar) » est le
#   supplément payé par un vazaha sur un forfait, pas son droit d'entrée : lu
#   comme un tarif, il donnait un parc à 20 000 Ar pour les étrangers et rien
#   pour les résidents.
_SEPARATEUR = r"[^\w+]{0,12}"

# Un prix annoncé au milieu d'une offre n'est pas un droit d'entrée : il
# comprend le bateau, le guide et le déjeuner. Ces mots disqualifient la ligne.
MOTS_PAS_UN_DROIT = (r"excursion|transfert|tout compris|\bpack\b|circuit"
                     r"|sejour|pension|hebergement|bungalow|forfait")

# 🔴 ET LE CHAPEAU DISQUALIFIE TOUT CE QUI SUIT. « Voici le tarif de nos
#    excursions (par personne) » ouvre une liste d'îles ; trois lignes plus bas,
#    « Komba et Tanikely : Malagasy 110.000ar / étranger 155.000ar » ne dit plus
#    qu'il s'agit d'une sortie en bateau déjeuner compris. C'était la SEULE
#    lecture de droits d'entrée du corpus, et elle était fausse.
MOTIF_OFFRE_VENDUE = re.compile(
    r"tarifs?\s+(?:de\s+)?(?:nos|notre|des|du)\s+"
    r"(?:excursions?|circuits?|sejours?|packs?|forfaits?|voyages?)"
    r"|prix\s+(?:de\s+)?(?:nos|notre)\s+(?:excursions?|circuits?|sejours?)"
)
_MOTS_NONRESIDENT = r"(?:vazaha|etranger(?:e|s|es)?|non[- ]residents?|touristes? etrangers?)"
_MOTS_RESIDENT = r"(?:residents?|malagasy|malgaches?|\bgasy\b|nationaux)"


def _frais_valide(brut: str, mini: int = 500, maxi: int = 1_000_000) -> int | None:
    valeur = _nombre(brut)
    if valeur is None or not mini <= valeur <= maxi:
        return None
    # « Édition 2026 » n'est pas un droit d'entrée à 2 026 Ar.
    if re.fullmatch(r"(19|20)\d{2}", re.sub(r"\D", "", brut)):
        return None
    return int(valeur)


def droits_entree(texte: str, nom_du_site: str = "") -> dict:
    """Droits d'entrée et guide d'un parc, tels que le texte les donne.

    Rend {"resident_ar", "nonresident_ar", "guide_obligatoire", "guide_groupe_ar"} —
    chaque champ None quand le texte ne le dit pas.

    ⚠ UN PRIX SANS ÉTIQUETTE VA AUX RÉSIDENTS, et c'est un choix assumé : sur
      les pages malgaches, le tarif écrit sans précision est celui de tout le
      monde ou des locaux, et le tarif vazaha est TOUJOURS étiqueté quand il
      diffère (c'est l'argument de vente inverse). L'écriture en base ne
      remplit de toute façon qu'une colonne NULL — une erreur se corrige, elle
      n'écrase rien.

    🔴 ET UNE LISTE DE PLUSIEURS PARCS NE SE LIT PAS AU HASARD. Mesuré le
       24/08/2026 sur les 361 trouvailles rapprochées d'un site : la seule qui
       donnait deux tarifs était « Iranja : Malagasy 110.000ar / étranger
       155.000ar » suivi de deux autres îles à des prix différents, écrite sur
       la fiche du parc de Nosy Tanikely. On cherche donc d'abord la ligne qui
       NOMME le site ; à défaut, on n'accepte qu'un texte qui ne donne qu'un
       seul tarif — sinon on ne sait pas lequel appartient à qui.
    """
    if MOTIF_OFFRE_VENDUE.search(sans_accent(texte)):
        return {"resident_ar": None, "nonresident_ar": None,
                "guide_obligatoire": None, "guide_groupe_ar": None}
    lignes = [l for l in MOTIF_TEL.sub(" ", texte).split("\n") if l.strip()]

    # ① La ligne qui nomme le site : c'est la seule lecture non ambiguë.
    jetons = [j for j in re.split(r"\W+", sans_accent(nom_du_site)) if len(j) >= 4]
    if jetons:
        for ligne in lignes:
            n = sans_accent(ligne)
            if any(j in n for j in jetons) and re.search(r"\d{3}", n):
                lu = _tarifs_du_fragment(n)
                if lu["resident_ar"] or lu["nonresident_ar"]:
                    lu.update(_guide_du_texte(sans_accent(texte)))
                    return lu

    # ② Sinon le texte entier, mais seulement s'il ne parle que d'un tarif.
    n_texte = sans_accent(MOTIF_TEL.sub(" ", texte))
    sortie = _tarifs_du_fragment(n_texte)
    for cle, mots in (("resident_ar", _MOTS_RESIDENT),
                      ("nonresident_ar", _MOTS_NONRESIDENT)):
        valeurs = set()
        for trouve in re.finditer(rf"{mots}{_SEPARATEUR}{_FRAIS}", n_texte):
            valeur = _frais_valide(trouve.group(1))
            if valeur:
                valeurs.add(valeur)
        if len(valeurs) > 1:
            sortie[cle] = None
    sortie.update(_guide_du_texte(n_texte))
    return sortie


def _tarifs_du_fragment(n: str) -> dict:
    """Les deux tarifs d'un fragment déjà normalisé. Ni guide, ni ambiguïté."""
    sortie = {"resident_ar": None, "nonresident_ar": None,
              "guide_obligatoire": None, "guide_groupe_ar": None}
    # 🔴 MESURÉ : la seule trouvaille qui donnait deux tarifs de parc était
    #    « voici le tarif de nos excursions (par personne) : Iranja malagasy
    #    110.000ar / étranger 155.000ar ». C'est le prix d'une sortie en bateau
    #    déjeuner compris, pas le droit d'entrée du parc — et il serait parti
    #    dans `attractions.fee_resident_ar`.
    if re.search(MOTS_PAS_UN_DROIT, n):
        return sortie

    # « vazaha : 55 000 Ar » et la forme inverse « 55 000 Ar pour les vazaha ».
    pour = re.search(rf"{_MOTS_NONRESIDENT}{_SEPARATEUR}{_FRAIS}", n) or \
        re.search(rf"{_FRAIS}\s*(?:ar\b|ariary|mga)?[^.\n]{{0,16}}{_MOTS_NONRESIDENT}", n)
    if pour:
        sortie["nonresident_ar"] = _frais_valide(pour.group(1))

    local = re.search(rf"{_MOTS_RESIDENT}{_SEPARATEUR}{_FRAIS}", n) or \
        re.search(rf"{_FRAIS}\s*(?:ar\b|ariary|mga)?[^.\n]{{0,16}}{_MOTS_RESIDENT}", n)
    if local:
        sortie["resident_ar"] = _frais_valide(local.group(1))

    # « Droit d'entrée : 10 000 Ar » sans distinction. La devise est EXIGÉE ici :
    # sans elle, « entrée 2 » (une deuxième entrée au menu) ferait un tarif.
    if sortie["resident_ar"] is None and sortie["nonresident_ar"] is None:
        generique = re.search(
            r"(?:droits? d[’']entree|frais d[’']entree|ticket d[’']entree|entree)"
            r"\s*[:\-–—]?\s*(\d[\d\s.,\u202f\u00a0]{2,10})\s*(?:ar\b|ariary|mga)", n
        )
        if generique:
            sortie["resident_ar"] = _frais_valide(generique.group(1))
    return sortie


def _guide_du_texte(n: str) -> dict:
    """Ce que le texte dit du guide. Vaut pour tout le parc, pas pour une ligne."""
    sortie: dict = {}
    if re.search(r"guide (?:local |accompagnateur )?(?:est |y est )?obligatoire"
                 r"|avec guide obligatoire", n):
        sortie["guide_obligatoire"] = True
    guide = re.search(rf"(?:frais de )?guide\b[^.\n\d]{{0,24}}{_FRAIS}", n)
    if guide:
        valeur = _frais_valide(guide.group(1), 1_000, 2_000_000)
        if valeur:
            sortie["guide_groupe_ar"] = valeur
    return sortie
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
# ⚠ « saison » seul n'y est plus : « en haute saison nos bungalows sont à
#   200 000 Ar » rendait un événement ANNUEL (36 événements marqués récurrents
#   le 02/09/2026). Une saison se dit « de juin à septembre ».
MOTS_PERIODE = (
    "chaque annee", "chaque année", "tous les ans", "isan-taona", "chaque saison",
    "de juin a septembre", "tous les samedis", "chaque semaine", "isaky ny",
    "edition annuelle", "annuel",
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

    # ⚠ TOUS LES CANDIDATS, pas le premier. « Nous fêtons nos 10 ans le 20
    #   septembre » : `re.search` s'arrêtait sur « 10 ans », qui n'est pas un
    #   mois, et la vraie date était perdue.
    # « du 12 au 15 septembre 2026 » / « du 12 au 15 septembre »
    for plage in re.finditer(
        r"du\s+(\d{1,2})\s*(?:er)?\s*(?:au|-|–)\s*(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?", n
    ):
        if plage.group(3) not in MOIS:
            continue
        mois = MOIS[plage.group(3)]
        annee = int(plage.group(4)) if plage.group(4) else _annee_probable(
            mois, int(plage.group(1)), aujourdhui)
        try:
            resultat["debut"] = date(annee, mois, int(plage.group(1))).isoformat()
            resultat["fin"] = date(annee, mois, int(plage.group(2))).isoformat()
            resultat["annee_devinee"] = not plage.group(4)
            return resultat
        except ValueError:
            continue

    # « le 14 septembre 2026 » / « 14 septembre »
    for simple in re.finditer(r"\b(\d{1,2})\s*(?:er)?\s+([a-z]{3,10})\.?\s*(\d{4})?", n):
        if simple.group(2) not in MOIS:
            continue
        mois = MOIS[simple.group(2)]
        annee = int(simple.group(3)) if simple.group(3) else _annee_probable(
            mois, int(simple.group(1)), aujourdhui)
        try:
            resultat["debut"] = date(annee, mois, int(simple.group(1))).isoformat()
            resultat["annee_devinee"] = not simple.group(3)
            return resultat
        except ValueError:
            continue

    # « 14/09/2026 » ou « 14-09-26 »
    for chiffree in re.finditer(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b", n):
        jour, mois, annee = (int(g) for g in chiffree.groups())
        annee = annee + 2000 if annee < 100 else annee
        try:
            resultat["debut"] = date(annee, mois, jour).isoformat()
            return resultat
        except ValueError:
            continue

    # « le 12/09 » sans année
    for courte in re.finditer(r"\b(\d{1,2})[/\-](\d{1,2})(?![/\-.\d])", n):
        jour, mois = int(courte.group(1)), int(courte.group(2))
        if not (1 <= mois <= 12 and 1 <= jour <= 31):
            continue
        try:
            resultat["debut"] = date(_annee_probable(mois, jour, aujourdhui), mois, jour).isoformat()
            resultat["annee_devinee"] = True
            return resultat
        except ValueError:
            continue

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
    # ⚠ NFKD ET TRAITS D'UNION APLANIS DES DEUX CÔTÉS : « Nosy-Be », « Sainte
    #   Marie » et « 𝗡𝗢𝗦𝗬 𝗕𝗘 » ne trouvaient pas « Nosy Be » ni « Sainte-Marie »
    #   — 236 trouvailles sans lieu alors que le texte le citait (02/09/2026).
    #   Et `cle in n` AVANT la regex : 11 000 `re.search` par publication
    #   coûtaient 300 ms, le pré-test divise par vingt.
    n = _norme_lieu(texte)
    for nom in noms_connus:
        cle = _norme_lieu(nom)
        if len(cle) < 4 or cle in LIEUX_TROP_LARGES_POUR_UN_LIEU or cle not in n:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(cle)}(?![a-z0-9])", n):
            return nom
    return None


LIEUX_TROP_LARGES_POUR_UN_LIEU = {"madagascar", "madagasikara", "mada"}


def _norme_lieu(texte: str) -> str:
    plat = "".join(
        c for c in unicodedata.normalize("NFKD", texte or "")
        if unicodedata.category(c) != "Mn"
    ).lower()
    return re.sub(r"\s+", " ", re.sub(r"[-'’.]+", " ", plat)).strip()


# ── Assemblage ──────────────────────────────────────────────────────────────
def analyser(texte: str, nb_photos: int = 0, auteur_page: str | None = None,
             noms_de_lieux: list[str] | None = None) -> dict:
    """Lecture complète par règles. Le modèle vient corriger ensuite, s'il est actif."""
    cats = categories(texte)
    plats = lignes_de_carte(texte)
    dates = dates_evenement(texte)
    genre, motif = classer_avec_motif(texte, nb_photos, plats, dates, auteur_page)

    tels = telephones(texte)
    adresses = liens(texte)
    prix = prix_principal(texte, cats)

    # La grille d'un loueur ne se cherche que chez un loueur : sur un récit de
    # voyage, « on a loué un 4x4 à 400 000 Ar la journée » est un prix vécu,
    # pas une offre — le mettre dans `vehicle_offers` inventerait un loueur.
    vehicules = lignes_vehicule(texte) if any(
        c in cats for c in ("location_vehicule", "transporteur")
    ) else []

    # ⭐ LES CIRCUITS D'AGENCE, PAR RÈGLES. `lignes_circuit` n'avait qu'un seul
    #   producteur, `analyse_llm.py` : passerelle en panne = zéro circuit, et
    #   `tours` est restée vide. Même garde que pour les véhicules — on ne
    #   cherche un circuit que chez une agence, sinon un récit de vacances
    #   (« trois jours à Nosy Be ») deviendrait un produit à vendre.
    tours = circuits(texte, noms_de_lieux or []) if "agence_voyage" in cats else []

    return {
        "genre": genre,
        "motif_classement": motif,
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
        "lignes_circuit": tours,
        "lignes_vehicule": vehicules,
        "evt_debut": dates["debut"],
        "evt_fin": dates["fin"],
        "evt_recurrent": dates["recurrent"],
        "titre_evt": titre_evenement(texte) if genre == "evenement" else None,
        "post_genre": genre_de_post(texte),
    }


def analyser_site(texte: str, titre_page: str = "", nom_connu: str = "",
                  noms_de_lieux: list[str] | None = None,
                  taux: dict | None = None) -> dict:
    """Lecture d'un SITE d'établissement. Toujours un établissement, jamais un récit.

    La différence avec Facebook n'est pas le vocabulaire, c'est la nature de
    l'objet : un site officiel décrit **un** établissement, celui à qui il
    appartient. On ne se demande donc pas si c'est un récit ou un événement —
    on cherche ce que Diako n'a pas : les tarifs, la carte, le contact.

    ⚠ Le nom vient de la fiche quand on la connaît déjà (source rattachée), pas
      du `<title>` : « Accueil | Hôtel ★★★ Bienvenue » n'est pas un nom.
    """
    cats = categories(texte)
    if not cats:
        # Un site d'hôtel qui ne dit jamais « hôtel » reste un hôtel s'il vend
        # des nuits. Le titre de la page tranche souvent.
        cats = categories(titre_page)

    chambres = types_de_chambre(texte, taux)
    plats = _plats_hors_chambres(lignes_de_carte(texte), chambres)
    if chambres and "hotel" not in cats:
        cats = cats + ["hotel"]
    if plats and "restaurant" not in cats:
        cats = cats + ["restaurant"]

    # Un site de loueur affiche sa grille comme un hôtel ses chambres.
    vehicules = lignes_vehicule(texte) if any(
        c in cats for c in ("location_vehicule", "transporteur")
    ) else []
    if vehicules and "location_vehicule" not in cats:
        cats = cats + ["location_vehicule"]
    tours = circuits(texte, noms_de_lieux or []) if "agence_voyage" in cats else []

    tels = telephones(texte)
    adresses = liens(texte)
    prix = prix_principal(texte, cats)
    # Sur un site, le prix d'appel le plus juste est la chambre la moins chère.
    # ⚠ MAIS PAS N'IMPORTE LAQUELLE : un lit en dortoir à 35 000 Ar *par
    #   personne* n'est pas « une nuit à partir de 35 000 ». On prend la moins
    #   chère des chambres facturées à la chambre ; à défaut seulement, on
    #   bascule sur le par-personne, et on le dit dans l'unité.
    if chambres:
        par_chambre = [c for c in chambres if c["unite"] == "chambre"]
        moins_chere = min(par_chambre or chambres, key=lambda c: c["prix_ar"])
        prix = {"montant": moins_chere["prix_ar"],
                "unite": "nuit" if moins_chere["unite"] == "chambre" else "personne"}
    elif plats and not prix:
        chiffres = [p for p in plats if p.get("prix_ar")]
        if chiffres:
            prix = {"montant": min(p["prix_ar"] for p in chiffres), "unite": "plat"}

    # Le titre d'un site nomme l'établissement plus sûrement que son corps de
    # page, qui parle de tout — le contraire de Facebook.
    nom = ((nom_connu or "").strip() or _nom_depuis_titre(titre_page)
           or nom_etablissement(texte))

    return {
        "genre": "etablissement",
        "categories": cats,
        "nom_etab": nom,
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
        "lignes_chambre": chambres,
        "lignes_circuit": tours,
        "lignes_vehicule": vehicules,
        "evt_debut": None, "evt_fin": None, "evt_recurrent": False,
        "titre_evt": None, "post_genre": "photo",
    }


def _plats_hors_chambres(plats: list[dict], chambres: list[dict]) -> list[dict]:
    """Une grille de tarifs n'est pas une carte de restaurant.

    🔴 SANS CE FILTRE, LA PAGE « NOS TARIFS » D'UN HÔTEL ENTRE DANS `menu_items`.
       Les deux lectures tournent sur le même texte : « Bungalow vue mer
       180 000 Ar » satisfait aussi bien le motif d'un plat que celui d'une
       chambre. Publier ça mettrait des bungalows dans la carte du restaurant —
       et `menu_items` est justement la table qu'on essaie de remplir
       proprement (4 lignes sur tout le site).
    """
    if not plats:
        return []
    deja = {(c["nom"].strip().lower(), c["prix_ar"]) for c in chambres}
    mots = tuple(sans_accent(m) for m in MOTS_CHAMBRE)
    gardes = []
    for plat in plats:
        if (plat["nom"].strip().lower(), plat.get("prix_ar")) in deja:
            continue
        if any(mot in sans_accent(plat["nom"]) for mot in mots):
            continue
        # Un « plat » à plus de 60 000 Ar sur un site d'hôtel est une nuitée mal
        # lue neuf fois sur dix. Le doute profite à la fiche, pas à la carte.
        if (plat.get("prix_ar") or 0) > 60_000:
            continue
        gardes.append(plat)
    return gardes


MOTS_SANS_VALEUR = re.compile(
    r"^(accueil|home|bienvenue|welcome|index|site officiel|official site"
    r"|page d'accueil)$", re.I
)


def _nom_depuis_titre(titre: str) -> str | None:
    """Le nom de l'établissement dans le `<title>` d'un site.

    ⚠ ON DÉCOUPE, ON NE ROGNE PAS. Les titres réels sont des phrases entières :
      « Camp Catta Voyage Madagascar : voyage séjour ecotourisme circuit
      découverte RN7 » ou « Hôtel Zomatel | Restaurant à Fianarantsoa —
      Madagascar ». Un simple test de longueur les rejetait tous les deux, et le
      bot retombait sur le corps de la page, où il lisait « Restaurant
      Snack-Bar ». Le nom, c'est le premier segment.
    """
    if not titre:
        return None
    segments = [s.strip(" |·–—-,") for s in re.split(r"\s*[|·–—:]\s*|\s+[-–]\s+", titre)]
    for segment in segments:
        if not segment or MOTS_SANS_VALEUR.match(segment):
            continue
        # Un segment de dix mots est une phrase de référencement, pas un nom.
        if 2 < len(segment) <= 60 and len(segment.split()) <= 6:
            return segment
    return None
