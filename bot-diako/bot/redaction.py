"""Fabrication déterministe des textes publiés sur Diako.

Le modèle écrit mieux, mais il n'est pas toujours là — et surtout il n'est pas
obligé d'écrire deux fois pareil. Ce module donne le filet : un texte
reproductible, fabriqué à partir des seuls champs réellement lus, pour que
cent fiches importées se lisent toutes de la même façon.

Trois règles de Diako s'appliquent ici, et elles ne sont pas négociables :

  ⚠ **Aucune donnée inventée.** Rien n'est écrit qui ne vienne d'un champ
    rempli. Pas de « cadre chaleureux » ni de « idéal en famille ».
  ⚠ **Le prix ne voyage jamais seul** : montant + unité + date de relevé, dans
    un seul bloc. Sans la date, un tarif de l'an dernier passe pour actuel.
  ⚠ **Aucun vocabulaire de réservation.** « Demander », jamais « Réserver » ni
    « Payer » : Diako met en relation, il ne vend pas.
"""
from __future__ import annotations

import re
from datetime import date, datetime

INSECABLE = " "

LIBELLE_UNITE = {
    "nuit": "la nuit",
    "plat": "le plat",
    "personne": "par personne",
    "jour": "la journée",
    "circuit": "le circuit",
}

LIBELLE_CATEGORIE = {
    "hotel": "Hébergement",
    "restaurant": "Restaurant",
    "agence_voyage": "Agence de voyage",
    "guide": "Guide",
    "transporteur": "Transport",
    "location_vehicule": "Location de véhicule",
    "site_attraction": "Site à visiter",
    "organisateur_evenement": "Organisateur d'événements",
}

LIBELLE_EQUIPEMENT = {
    "wifi": "WiFi", "piscine": "piscine", "piscine-chauffee": "piscine chauffée",
    "climatisation": "climatisation", "eau-chaude": "eau chaude",
    "moustiquaire": "moustiquaire", "parking": "parking",
    "parking-clos": "parking clos", "restaurant-sur-place": "restaurant sur place",
    "bar": "bar", "petit-dejeuner": "petit déjeuner", "demi-pension": "demi-pension",
    "pension-complete": "pension complète", "livraison": "livraison",
    "a-emporter": "à emporter", "menu-vegetarien": "menu végétarien",
    "terrasse": "terrasse", "jardin": "jardin", "vue-mer": "vue mer",
    "vue-lac": "vue lac", "vue-montagne": "vue montagne",
    "plage-privee": "plage privée", "massage": "massages", "spa": "spa",
    "salle-sport": "salle de sport", "salle-reunion": "salle de réunion",
    "plongee": "plongée", "masque-tuba": "masque et tuba", "kayak": "kayak",
    "peche": "pêche", "randonnee": "randonnée", "quad": "quad", "vtt": "VTT",
    "equitation": "équitation", "observation-baleines": "observation des baleines",
    "excursion-bateau": "excursion en bateau", "guide": "guide francophone",
    "navette-aeroport": "navette aéroport", "mobile-money": "Mobile Money",
    "mvola": "Mvola", "orange-money": "Orange Money", "airtel-money": "Airtel Money",
    "carte-bancaire": "carte bancaire", "groupe-electrogene": "groupe électrogène",
    "panneaux-solaires": "panneaux solaires", "animaux": "animaux acceptés",
    "famille": "adapté aux familles", "tv": "télévision", "ventilateur": "ventilateur",
    "gardien-nuit": "gardien de nuit", "reception-24h": "réception 24 h/24",
    "sans-porc": "sans porc", "tennis": "tennis", "billard": "billard",
    "feu-de-camp": "feu de camp", "acces-4x4": "accès 4x4 nécessaire",
    "acces-bateau": "accessible en bateau",
}


def montant(valeur) -> str:
    """1500000 -> « 1 500 000 » avec des espaces insécables, comme le site."""
    return f"{int(valeur):,}".replace(",", INSECABLE)


def _jour(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return iso[:10]


def bloc_prix(t: dict) -> str:
    """Le prix, son unité et la date à laquelle il a été vu. Jamais l'un sans l'autre.

    ⚠ « RELEVÉ LE » ET « LU LE » NE DISENT PAS LA MÊME CHOSE. « Relevé le »
      date le tarif : il suppose qu'on connaît la date de la publication. Quand
      celle-ci manque — `date_post` est vide depuis le 24/08/2026 dès que
      Facebook n'a pas livré de date — on ne dispose que du jour où le bot a lu
      le texte, et la phrase le dit. Écrire « relevé le 24/08/2026 » sous un
      tarif tiré d'un post de 2019 serait un mensonge publié.
    """
    if not t.get("prix_ar"):
        return ""
    unite = LIBELLE_UNITE.get(t.get("prix_unite") or "", "")
    date_du_prix = t.get("prix_vu_le") or t.get("date_post")
    vu_le = _jour(date_du_prix or t.get("collecte_le"))
    morceaux = [f"{montant(t['prix_ar'])} Ar"]
    if unite:
        morceaux.append(unite)
    ligne = " ".join(morceaux)
    if not vu_le:
        return ligne
    return (f"{ligne} — relevé le {vu_le}" if date_du_prix
            else f"{ligne} — lu le {vu_le} (date de publication inconnue)")


def titre(t: dict) -> str:
    """Le titre affiché dans l'interface du bot. Purement local, jamais publié."""
    genre = t.get("genre")
    if genre == "evenement":
        return (t.get("titre") or "Événement sans titre")[:120]
    nom = (t.get("nom_etab") or "").strip()
    lieu = (t.get("lieu_nom") or t.get("lieu_texte") or "").strip()
    if genre == "carte":
        base_titre = f"Carte — {nom}" if nom else "Carte de restaurant"
    elif genre == "etablissement":
        base_titre = nom or "Établissement sans nom"
    else:
        premiere = (t.get("texte") or "").strip().split("\n")[0]
        premiere = re.sub(r"\s+", " ", premiere)[:80]
        base_titre = premiere or "Récit"
    return f"{base_titre} · {lieu}"[:120] if lieu and lieu not in base_titre else base_titre[:120]


def resume_fiche(t: dict) -> str:
    """`pages.short_desc` — une phrase, seulement à partir de champs remplis.

    ⚠ Un résumé écrit par le modèle prime toujours : il est meilleur. Celui-ci
      est le filet quand le modèle n'a pas tourné.
    """
    if (t.get("resume") or "").strip():
        return t["resume"].strip()[:280]

    quoi = [LIBELLE_CATEGORIE[c] for c in (t.get("categories") or [])
            if c in LIBELLE_CATEGORIE]
    lieu = (t.get("lieu_nom") or t.get("lieu_texte") or "").strip()
    morceaux = []
    if quoi:
        morceaux.append(" et ".join(quoi[:2]).lower().capitalize())
    if lieu:
        morceaux.append(f"à {lieu}")
    if not morceaux:
        return ""
    phrase = " ".join(morceaux) + "."
    prix = bloc_prix(t)
    if prix:
        phrase += f" À partir de {prix}."
    return phrase[:280]


def presentation(t: dict) -> str:
    """`pages.long_desc` — le texte d'origine, nettoyé, plus ce qu'on a relevé.

    On garde le texte de l'établissement : c'est lui qui décrit le mieux. On y
    ajoute les seuls faits vérifiés, chacun sur sa ligne, pour qu'ils se lisent
    sans être noyés.
    """
    corps = nettoyer(t.get("texte") or "")
    lignes = [corps] if corps else []

    faits = []
    if t.get("repere"):
        faits.append(f"🧭 {t['repere']}")
    if t.get("adresse"):
        faits.append(f"📍 {t['adresse']}")
    if t.get("horaires"):
        faits.append(f"🕑 {t['horaires']}")
    prix = bloc_prix(t)
    if prix:
        faits.append(f"💰 {prix}")
    equipements = [LIBELLE_EQUIPEMENT.get(e, e) for e in (t.get("equipements") or [])]
    if equipements:
        faits.append("✨ " + ", ".join(equipements[:12]))
    if faits:
        lignes.append("\n".join(faits))

    source = ligne_source(t)
    if source:
        lignes.append(source)
    return "\n\n".join(lignes).strip()[:4000]


def corps_recit(t: dict) -> str:
    """`posts.body` — ce que Diako publie sur son fil.

    ⚠ ON NE RECOPIE PAS LE TEXTE DE QUELQU'UN D'AUTRE. Republier tel quel le
      récit d'un membre d'un groupe sous le compte Diako, c'est se
      l'approprier. Le modèle réécrit ; sans lui, on s'en tient aux faits et on
      dit d'où ça vient.
    """
    if (t.get("corps") or "").strip():
        corps = t["corps"].strip()
    else:
        corps = _corps_de_secours(t)

    pied = []
    prix = bloc_prix(t)
    if prix:
        pied.append(f"💰 {prix}")
    if t.get("telephone"):
        pied.append(f"📞 {t['telephone']}")
    source = ligne_source(t)
    if source:
        pied.append(source)
    if pied:
        corps = corps.rstrip() + "\n\n" + "\n".join(pied)
    return corps.strip()[:4000]


def _corps_de_secours(t: dict) -> str:
    """Sans modèle : des faits, dans l'ordre, et rien d'autre."""
    lieu = (t.get("lieu_nom") or t.get("lieu_texte") or "").strip()
    nom = (t.get("nom_etab") or "").strip()
    entete = f"📍 {nom}" if nom else ""
    if lieu:
        entete = f"{entete} — {lieu}" if entete else f"📍 {lieu}"

    lignes = [entete] if entete else []
    if t.get("resume"):
        lignes.append(t["resume"].strip())
    elif t.get("texte"):
        # Les trois premières phrases du texte d'origine, mises entre
        # guillemets : c'est une citation, pas notre prose.
        extrait = re.sub(r"\s+", " ", nettoyer(t["texte"]))[:400].strip()
        if extrait:
            lignes.append(f"« {extrait}… »")
    if t.get("repere"):
        lignes.append(f"🧭 {t['repere']}")
    return "\n\n".join(l for l in lignes if l)


def resume_evenement(t: dict) -> str:
    """`events.summary` — ce qui se passe, où, quand. Rien de plus."""
    if (t.get("resume") or "").strip():
        return t["resume"].strip()[:280]
    lieu = (t.get("lieu_nom") or t.get("lieu_texte") or "").strip()
    quand = _periode_lisible(t)
    morceaux = [m for m in (quand, f"à {lieu}" if lieu else "") if m]
    return (", ".join(morceaux) + ".")[:280] if morceaux else ""


def _periode_lisible(t: dict) -> str:
    debut, fin = t.get("evt_debut"), t.get("evt_fin")
    if debut and fin and debut != fin:
        return f"Du {_jour(debut)} au {_jour(fin)}"
    if debut:
        return f"Le {_jour(debut)}"
    return ""


def ligne_source(t: dict) -> str:
    """D'où vient l'information. Toujours, sans exception.

    C'est ce qui distingue une reprise honnête d'un recopiage : le lecteur voit
    la provenance, et l'auteur d'origine reste nommé.
    """
    qui = (t.get("auteur") or t.get("source_nom") or "").strip()
    quand = _jour(t.get("date_post") or t.get("collecte_le"))
    if not qui:
        return ""
    morceaux = [f"Vu sur Facebook — {qui}"]
    if quand:
        morceaux.append(f"le {quand}")
    return " ".join(morceaux)


def source_pour_base(t: dict) -> str:
    """La chaîne rangée dans `pages.source` / `events.source`.

    Le site en pose déjà de cette forme (« Wikivoyage (CC BY-SA) · https://… ») :
    on suit la même convention, avec le permalien quand il existe.
    """
    qui = (t.get("auteur") or t.get("source_nom") or "Facebook").strip()
    morceaux = [f"Facebook · {qui}"]
    if t.get("permalien"):
        morceaux.append(t["permalien"])
    quand = _jour(t.get("date_post") or t.get("collecte_le"))
    if quand:
        morceaux.append(f"relevé le {quand}")
    return " · ".join(morceaux)[:400]


MOTS_RESEAU = re.compile(
    r"^\s*(?:#\w+\s*)+$|^\s*(?:j'aime|like|partagez?|abonnez[- ]vous|suivez[- ]nous|"
    r"taguez|tag |commentez|mp |dm |inbox)\b.*$",
    re.I | re.M,
)


def nettoyer(texte: str) -> str:
    """Retire ce qui n'appartient qu'à Facebook : appels au partage, forêts de mots-dièse.

    ⚠ Et le CHROME de l'interface : « Indicateur de statut En ligne », « Voir
      plus », « Écrivez un commentaire public… » se retrouvaient dans le corps
      de récits publiés (vu en ligne le 03/09/2026 sur « Hôtel de la Mer »).
    """
    from .extraction import BRUIT_FIL

    lignes = [l for l in (texte or "").split("\n") if not BRUIT_FIL.match(l.strip())]
    propre = MOTS_RESEAU.sub("", "\n".join(lignes))
    propre = re.sub(r"(?i)indicateur de statut\s*(en ligne)?", "", propre)
    propre = re.sub(r"\n{3,}", "\n\n", propre)
    return propre.strip()


def aujourdhui() -> str:
    return date.today().isoformat()
