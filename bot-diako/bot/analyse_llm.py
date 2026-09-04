"""Relecture d'une publication par un modèle — couche OPTIONNELLE mais décisive.

Les règles d'`extraction.py` sont fiables sur le mécanique : numéro malgache,
montant avec devise, mots-clés, dates écrites en toutes lettres. Elles butent
sur deux choses que le voyage impose et que l'immobilier n'imposait pas :

  ① **Le texte libre.** « On a fini la soirée chez Mariette, la crevette au
     coco valait largement les 18 000 » — aucune expression régulière ne sort
     de là un établissement, un plat et un prix. Le modèle, si.

  ② **Les cartes photographiées.** À Madagascar, une carte de restaurant est
     publiée en PHOTO, presque jamais tapée. Diako a 4 lignes de carte pour
     1 862 restaurants : sans lecture d'image, le bot ne comblera jamais ce
     trou. C'est pour ça que `lire_carte()` existe — et c'est le seul endroit
     où le modèle n'est pas un bonus mais la condition de la récolte.

Deux chemins, réglables dans l'interface :
  - « passerelle » : le LiteLLM local d'Hermes (modèle `claude-abo`), coût
    marginal nul, mais c'est un service maison qui tombe parfois ;
  - « anthropic »  : l'API Claude officielle (Sonnet 5), payante mais stable.

Une panne du modèle ne casse jamais la collecte : on retombe sur la lecture par
règles, et la trouvaille est simplement marquée non relue.
"""
from __future__ import annotations

import base64
import json
import re
from datetime import date as _date
from pathlib import Path

from . import extraction

import requests

from .config import CLE_ANTHROPIC, CLE_ANTHROPIC_REPLI

MODELE_ANTHROPIC = "claude-sonnet-5"
MODELE_PASSERELLE = "claude-abo"

# ⚠ PROMPT VOLONTAIREMENT STABLE : c'est ce qui permet la mise en cache côté
#   API (le tarif du cache est ~10 % du plein). Ne jamais y coller une date ni
#   un compteur — le cache serait invalidé à chaque appel.
SYSTEME = """Tu lis une publication Facebook malgache qui parle de voyage, de
restauration, d'hébergement, de sortie ou de découverte, et tu en extrais les
informations pour Diako — le réseau social malgache du voyage et du goût.
Tu réponds UNIQUEMENT par un objet JSON, sans texte autour.

Champs attendus :

- genre : "etablissement" | "carte" | "evenement" | "recit" | "rien"
    · "etablissement" : la publication présente OU VEND un lieu qui accueille du
      public (restaurant, hôtel, lodge, bar, agence, loueur, parc) — ouverture,
      présentation, coordonnées, tarifs, promotion, menu de fête, voyage
      organisé ou circuit proposé par une agence. ⚠ Une publicité, une offre,
      un « réservez », un menu de Noël ou de Saint-Valentin, un « joyeuse fête
      nationale » qui viennent d'un établissement sont des ÉTABLISSEMENTS : on
      garde ses informations, ses plats et ses prix, jamais le texte de la
      publicité ni les vœux.
    · "carte" : la publication montre ou liste des PLATS AVEC LEUR PRIX — même
      dans un menu de réveillon.
    · "evenement" : un ÉVÉNEMENT PUBLIC MALGACHE qui a lieu à une DATE et dans
      un LIEU — festival (baleines, Donia, Sômarôho…), fête traditionnelle
      (famadihana, fitampoha, sambatra), concert, salon, foire, exposition,
      compétition. ⚠ JAMAIS une fête du calendrier (Noël, réveillon, nouvel an,
      Saint-Valentin, Pâques, fête nationale, fête des mères…), JAMAIS un
      voyage organisé, un circuit ou une excursion vendus par une agence (c'est
      un établissement avec ses circuits), JAMAIS la retransmission d'un match.
    · "recit" : le VÉCU d'un voyageur — un lieu visité, un parc, un plat goûté,
      une bonne ou une mauvaise expérience, une belle photo de ce qu'il a vu.
      Écrit par quelqu'un qui y est allé, pas par l'établissement qui se vend.
    · "rien" : vente d'objets (ordinateur, téléphone, meuble…), recrutement,
      politique, condoléances, simples vœux de fête sans aucune information, ou
      hors du champ voyage/goût.

- nature_recit : si genre = "recit", l'une de : "voyage" (un déplacement, un
  séjour), "parc" (un parc, une réserve, un site naturel), "endroit" (un lieu
  visité, une ville, une plage), "culinaire" (un plat, un restaurant goûté),
  "mesaventure" (une mauvaise expérience, un avis négatif), "photo" (surtout une
  belle image, peu de texte), "bon_plan" (un conseil pratique vécu), "alerte"
  (danger, fermeture, route coupée). Sinon null.

- nom_etablissement : le nom exact de l'établissement, ou null. N'invente pas de
  nom à partir d'une description ("un petit resto sympa" -> null).
- categories : liste parmi ["hotel","restaurant","agence_voyage","guide",
  "transporteur","location_vehicule","site_attraction","organisateur_evenement"]
- lieu : la localité citée ("Nosy Be", "Ampefy", "Antananarivo"), ou null.
- adresse : l'adresse écrite, ou null.
- repere : le repère qui permet de trouver l'endroit ("en face de la station
  Jovenna, après le pont"), ou null. C'est un champ précieux à Madagascar.
- telephone, whatsapp, email, site_web : ou null.
- horaires : la phrase d'ouverture telle qu'écrite, ou null.
- resume : UNE phrase de 20 mots maximum décrivant l'établissement, en français,
  sans superlatif publicitaire. null si la publication ne dit rien de concret.
- equipements : liste de mots-clés simples observés (wifi, piscine, terrasse,
  climatisation, vue mer, parking, livraison, plage privée...), ou [].

- prix : {"montant": entier en ariary, "unite": "nuit"|"plat"|"personne"|"jour"|
  "circuit"} ou null. C'est le prix D'APPEL, donc le PLUS BAS annoncé.
  ⚠ Ne confonds pas le prix d'une nuit et celui d'un plat.
  ⚠ N'additionne rien, ne convertis aucune devise étrangère : si le prix est en
    euros ou en dollars, mets null et signale-le dans "doute".

- plats : liste de {"nom", "prix_ar", "description", "section"} pour chaque plat
  chiffré. [] si la publication n'en liste aucun. Recopie les noms tels quels,
  y compris en malgache.

- evenement : {"titre", "debut": "AAAA-MM-JJ"|null, "fin": "AAAA-MM-JJ"|null,
  "recurrent": booléen, "organisateur": texte|null, "prix_entree": entier|null}
  ou null. ⚠ Ne devine JAMAIS une année : si le texte ne la donne pas et que le
  contexte ne la donne pas, mets la date à null et écris la période dans "doute".

- circuits : liste de {"titre", "resume", "jours", "nuits", "prix_ar",
  "prix_unite", "base_personnes", "depart", "arrivee", "transports", "inclus"}
  pour chaque voyage organisé décrit — « Ampefy 2 jours 350 000 Ar/personne »,
  « circuit RN7 8 jours ». [] si la publication n'en décrit aucun.
  ⚠ `jours` est un ENTIER. Un circuit dont la durée n'est pas dite reste sans
    durée (null) : ne la déduis pas d'un itinéraire.
  ⚠ `prix_unite` vaut "personne", "groupe" ou "vehicule". Un tarif « à partir de
    350 000 Ar » sans base de personnes garde base_personnes à null.
  ⚠ N'invente PAS un circuit à partir d'une simple photo de paysage : il faut
    qu'un déroulé, une durée ou un tarif soit décrit.

- vehicules : liste de {"type": "4x4"|"berline"|"citadine"|"minibus"|"van"|
  "moto"|"quad"|"bateau"|"velo"|"camion"|"autre", "modele": texte|null,
  "places": entier|null, "avec_chauffeur": booléen|null,
  "carburant_inclus": booléen|null, "km_par_jour": entier|null,
  "prix_jour_ar": entier|null, "caution_ar": entier|null,
  "note_prix": texte court|null}
  pour chaque véhicule PROPOSÉ À LA LOCATION avec son tarif — « 4x4 Hilux avec
  chauffeur 250 000 Ar/jour, carburant en sus ». [] si la publication n'en
  propose aucun.
  ⚠ Uniquement les offres d'un LOUEUR. « On a loué un 4x4 à 400 000 » dans un
    récit de voyage n'est pas une offre.
  ⚠ `prix_jour_ar` est le prix PAR JOUR en ariary. Un prix au trajet ou au
    circuit ne va pas ici — mets-le dans "note_prix" en toutes lettres.
  ⚠ `avec_chauffeur` et `carburant_inclus` restent null si le texte ne le dit
    pas. Ne déduis rien des usages.

- recit : {"corps"} — un texte de 3 à 6 phrases en français, à la première
  personne du pluriel ("on"), qui raconte ce que la publication apprend d'utile
  à un voyageur : ce qu'on y mange, ce qu'on y voit, ce que ça coûte, comment
  on y va. ⚠ N'INVENTE AUCUN DÉTAIL. Tu n'as le droit d'écrire que ce que la
  publication dit. Pas de superlatif, pas de note, pas d'horaire supposé.
  N'utilise pas de première personne du singulier : Diako ne s'approprie pas le
  vécu de quelqu'un d'autre.

- confiance : 0 à 100, ta confiance dans cette lecture.
- doute : une phrase courte sur ce qui reste incertain, ou "".

N'INVENTE RIEN. Tout champ que le texte ne dit pas reste null. Mieux vaut un
champ vide qu'une valeur plausible mais fausse : personne ne viendra la
corriger."""

SYSTEME_CARTE = """Tu lis la PHOTO d'une carte (menu) de restaurant malgache et
tu la transcris. Tu réponds UNIQUEMENT par un objet JSON, sans texte autour.

{
  "est_une_carte": booléen — false si l'image n'est pas une carte lisible
                   (photo de plat, affiche, façade, capture floue),
  "sections": [{"nom": "Entrées", "plats": [
      {"nom": "...", "prix_ar": entier|null, "description": "..."|null}
  ]}],
  "devise": "Ar" | "autre",
  "confiance": 0 à 100,
  "doute": "" ou ce qui est illisible
}

RÈGLES :
- Recopie les noms EXACTEMENT comme ils sont écrits, malgache compris.
- Un prix illisible vaut null. Ne devine JAMAIS un chiffre à moitié caché.
- Si les prix sont en milliers sous-entendus ("12" pour 12 000), ne convertis
  pas : mets null et dis-le dans "doute".
- N'ajoute aucun plat qui ne figure pas sur l'image."""

SYSTEME_SITE = """Tu lis le SITE OFFICIEL d'un établissement malgache (hôtel,
lodge, restaurant, agence) : plusieurs pages de ce site t'ont été mises bout à
bout, séparées par des lignes « === adresse === ». Tu en extrais ce que
l'établissement dit de lui-même pour l'annuaire Diako.
Tu réponds UNIQUEMENT par un objet JSON, sans texte autour.

{
  "nom": le nom de l'établissement, ou null,
  "categories": liste parmi ["hotel","restaurant","agence_voyage","guide",
     "transporteur","location_vehicule","site_attraction","organisateur_evenement"],
  "lieu": la localité ("Nosy Be", "Ampefy"), ou null,
  "adresse": ou null,  "repere": le repère pour trouver l'endroit, ou null,
  "telephone": ou null, "whatsapp": ou null, "email": ou null,
  "horaires": la phrase d'ouverture telle qu'écrite, ou null,
  "resume": UNE phrase de 25 mots maximum, factuelle, sans superlatif, ou null,
  "equipements": liste de mots-clés observés (wifi, piscine, eau chaude,
     moustiquaire, restaurant sur place, navette aéroport...), ou [],

  "chambres": [{
     "nom": "Bungalow vue mer",
     "prix_ar": entier en ariary ou null,
     "unite": "chambre" | "personne",
     "capacite": entier ou null,
     "saison": libellé de saison si le site en distingue, sinon null,
     "eau_chaude": booléen, "sdb_privee": booléen,
     "vue": "mer"|"lac"|"montagne"|null,
     "description": texte court ou null
  }],

  "plats": [{"nom", "prix_ar", "description", "section"}],

  "vehicules": [{
     "type": "4x4"|"berline"|"citadine"|"minibus"|"van"|"moto"|"quad"|
             "bateau"|"velo"|"camion"|"autre",
     "modele": texte ou null, "places": entier ou null,
     "avec_chauffeur": booléen ou null, "carburant_inclus": booléen ou null,
     "km_par_jour": entier ou null, "prix_jour_ar": entier en ariary ou null,
     "caution_ar": entier ou null, "note_prix": texte court ou null
  }] — la grille d'un loueur de véhicules, [] sinon. `prix_jour_ar` est le
  prix PAR JOUR ; un tarif au circuit va dans "note_prix", pas ici.

  "devise": "Ar" | "EUR" | "USD" | "melange",
  "confiance": 0 à 100,
  "doute": phrase courte, ou ""
}

RÈGLES, ET ELLES COMPTENT :

⚠ NE CONVERTIS AUCUNE DEVISE. Beaucoup de sites malgaches affichent en euros
  pour les étrangers. Si un prix n'est pas en ariary, mets prix_ar à null,
  indique la devise dans "devise" et dis-le dans "doute". Un taux de change
  inventé est une donnée fausse qui se propage.

⚠ NE MÉLANGE PAS LA NUIT ET LA PERSONNE. « 45 € par personne en demi-pension »
  et « 180 000 Ar la chambre » ne se comparent pas. L'unité est obligatoire.

⚠ N'INVENTE AUCUNE CHAMBRE. Si la page des tarifs n'a pas été lue, rends une
  liste vide plutôt que des types plausibles.

⚠ IGNORE LES PRIX BARRÉS, LES PROMOTIONS DATÉES ET LES « à partir de » sans
  objet : on veut le tarif courant d'un type de chambre nommé.

N'INVENTE RIEN. Tout champ que le site ne donne pas reste null."""

CHAMPS_LLM = (
    "nom_etablissement", "categories", "lieu", "adresse", "repere", "telephone",
    "whatsapp", "email", "site_web", "horaires", "resume", "equipements",
)


class LLMIndisponible(Exception):
    """Le modèle n'a pas répondu. Jamais fatal : la lecture par règles reste valable."""


def _extraire_json(contenu: str) -> dict:
    debut, fin = contenu.find("{"), contenu.rfind("}")
    if debut < 0 or fin < debut:
        raise LLMIndisponible("réponse sans JSON")
    try:
        return json.loads(contenu[debut:fin + 1])
    except json.JSONDecodeError as e:
        raise LLMIndisponible(f"JSON illisible : {e}") from e


def _cle_anthropic() -> str | None:
    for chemin in (CLE_ANTHROPIC, CLE_ANTHROPIC_REPLI):
        if chemin.exists():
            valeur = chemin.read_text(encoding="utf-8-sig").strip()
            if valeur:
                return valeur
    return None


def _via_anthropic(systeme: str, contenu, cfg: dict) -> dict:
    """API Claude officielle, avec mise en cache du prompt système."""
    try:
        import anthropic
    except ImportError as e:
        raise LLMIndisponible("paquet `anthropic` absent (pip install anthropic)") from e

    cle = _cle_anthropic()
    client = anthropic.Anthropic(api_key=cle) if cle else anthropic.Anthropic()
    try:
        reponse = client.messages.create(
            model=cfg.get("llm_modele") or MODELE_ANTHROPIC,
            max_tokens=3000,
            system=[{"type": "text", "text": systeme,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": contenu}],
        )
    except Exception as e:  # réseau, quota, clé absente…
        raise LLMIndisponible(str(e)[:200]) from e
    return _extraire_json(
        "".join(b.text for b in reponse.content if getattr(b, "type", "") == "text")
    )


# Les pannes qui valent la peine d'un second essai : surcharge (429), erreur
# interne (500) ou passerelle à terre (502/503). Une 400 ou une 401, elles,
# reviendraient à l'identique — les rejouer ne ferait que payer deux fois.
CODES_A_REESSAYER = {429, 500, 502, 503}


def _requete_passerelle(adresse: str, modele: str, systeme: str, contenu,
                        delai: int) -> dict:
    """UN appel à la passerelle. `LLMIndisponible.reessayable` dit si ça vaut
    la peine de retenter avec un autre modèle."""
    try:
        r = requests.post(
            f"{adresse}/v1/chat/completions",
            json={
                "model": modele,
                # ⚠ 3000 ET PAS MOINS : gemini-flash (le secours) consomme plus
                #   de jetons de sortie que Claude pour le même JSON ; plus bas,
                #   il se fait couper au milieu et rend `content: null`.
                "max_tokens": 3000,
                "messages": [
                    {"role": "system", "content": systeme},
                    {"role": "user", "content": contenu},
                ],
            },
            timeout=delai,
        )
    except requests.RequestException as e:
        # Réseau coupé ou délai dépassé : la passerelle va peut-être mieux dans
        # une seconde, et le modèle de secours est souvent plus rapide.
        erreur = LLMIndisponible(str(e)[:200])
        erreur.reessayable = True
        raise erreur from e
    if not r.ok:
        erreur = LLMIndisponible(f"HTTP {r.status_code} — {r.text[:160]}")
        erreur.reessayable = r.status_code in CODES_A_REESSAYER
        raise erreur
    contenu_rendu = r.json()["choices"][0]["message"]["content"]
    # 🔴 gemini-flash SUR CETTE PASSERELLE REND PARFOIS `content: null` quand il
    #    dépasse sa longueur de sortie. Sans ce test, `.find()` sur None lève un
    #    TypeError qui remonte comme un bug du bot — alors que c'est un échec
    #    du modèle, à traiter proprement comme les autres.
    if not contenu_rendu:
        raise LLMIndisponible(f"{modele} : réponse vide (content null — "
                              "probablement sortie trop longue)")
    return _extraire_json(contenu_rendu)


def _via_passerelle(systeme: str, contenu, cfg: dict) -> dict:
    """LiteLLM local d'Hermes. Il n'expose que /v1/chat/completions.

    ⭐ UN SEUL RE-ESSAI, SUR LE MODÈLE DE SECOURS. `claude-abo` tombe par vagues
       (16 × HTTP 500 et 15 × HTTP 429 relevés le 23/08/2026) et chaque échec
       laissait une trouvaille « non relue ». Plutôt que d'insister sur le même
       modèle — la vague dure plus qu'un retry —, on bascule une fois sur
       `llm_modele_secours` (gemini-flash), qui passe par un autre fournisseur.
    """
    adresse = (cfg.get("llm_passerelle") or "http://127.0.0.1:4000").rstrip("/")
    modele = cfg.get("llm_modele") or MODELE_PASSERELLE
    delai = int(cfg.get("llm_delai", 120))
    try:
        return _requete_passerelle(adresse, modele, systeme, contenu, delai)
    except LLMIndisponible as e:
        secours = (cfg.get("llm_modele_secours") or "").strip()
        if not secours or secours == modele or not getattr(e, "reessayable", False):
            raise
        from . import base
        base.logguer(
            f"Passerelle en échec sur {modele} ({e}) — nouvel essai avec "
            f"{secours}.", "avert",
        )
        return _requete_passerelle(adresse, secours, systeme, contenu, delai)


def _appeler(systeme: str, contenu_anthropic, contenu_passerelle, cfg: dict) -> dict:
    transport = cfg.get("llm_transport", "passerelle")
    if transport == "anthropic":
        return _via_anthropic(systeme, contenu_anthropic, cfg)
    try:
        return _via_passerelle(systeme, contenu_passerelle, cfg)
    except LLMIndisponible:
        if not cfg.get("llm_repli_anthropic"):
            raise
        return _via_anthropic(systeme, contenu_anthropic, dict(cfg, llm_modele=None))


def relire(texte: str, cfg: dict) -> dict:
    """Fait relire une publication. Lève LLMIndisponible en cas d'échec."""
    if not texte.strip():
        raise LLMIndisponible("texte vide")
    return _appeler(SYSTEME, texte, texte, cfg)


# Un site entier ne tient pas dans une fenêtre utile, et les pages « à propos »
# n'apportent rien : on garde les 24 000 premiers caractères, qui contiennent
# l'accueil et les deux ou trois pages les mieux notées (tarifs, chambres, carte).
TAILLE_SITE_MAX = 24_000


def relire_site(texte: str, cfg: dict) -> dict:
    """Fait lire le site d'un établissement. Rend chambres et plats structurés."""
    if not texte.strip():
        raise LLMIndisponible("site vide")
    return _appeler(SYSTEME_SITE, texte[:TAILLE_SITE_MAX], texte[:TAILLE_SITE_MAX], cfg)


TYPES_VEHICULE_VALIDES = ("4x4", "berline", "citadine", "minibus", "van",
                          "moto", "quad", "bateau", "velo", "camion", "autre")


def _vehicules_valides(llm: dict) -> list[dict]:
    """Nettoie les offres de véhicule rendues par le modèle.

    ⚠ Le type est ramené aux valeurs de la contrainte `vehicle_offers` : un
      type inventé (« SUV », « pickup ») ferait échouer l'INSERT ENTIER en
      prod. On le range en « autre » plutôt que de perdre la ligne.
    """
    lignes = []
    for v in llm.get("vehicules") or []:
        if not isinstance(v, dict):
            continue
        type_v = (v.get("type") or "").strip().lower()
        if type_v not in TYPES_VEHICULE_VALIDES:
            type_v = "autre"
        prix = v.get("prix_jour_ar")
        prix = int(prix) if isinstance(prix, (int, float)) \
            and 3_000 <= prix <= 5_000_000 else None
        caution = v.get("caution_ar")
        caution = int(caution) if isinstance(caution, (int, float)) \
            and 10_000 <= caution <= 50_000_000 else None
        modele = (v.get("modele") or "").strip()[:120] or None
        note = (v.get("note_prix") or "").strip()[:280] or None
        if not (prix or modele or note):
            continue   # une ligne sans rien de concret n'apporte rien
        lignes.append({
            "type_vehicule": type_v,
            "modele": modele,
            "places": v.get("places") if isinstance(v.get("places"), int) else None,
            "avec_chauffeur": v.get("avec_chauffeur")
            if isinstance(v.get("avec_chauffeur"), bool) else None,
            "carburant_inclus": v.get("carburant_inclus")
            if isinstance(v.get("carburant_inclus"), bool) else None,
            "km_par_jour": v.get("km_par_jour")
            if isinstance(v.get("km_par_jour"), int) else None,
            "prix_jour_ar": prix,
            "note_prix": note,
            "caution_ar": caution,
        })
    return lignes


def _cle_chambre(nom: str, saison: str | None = None) -> tuple[str, str]:
    """(libellé, saison) normalisés — pour reconnaître la même chambre des deux côtés."""
    def propre(texte: str | None) -> str:
        return re.sub(r"[^a-z0-9]+", " ", extraction.sans_accent(texte or "")).strip()

    return propre(nom), propre(saison)


def _prix_repris_des_regles(du_modele: list[dict], des_regles: list[dict]) -> list[dict]:
    """Rend les chambres du modèle, complétées des prix lus par les règles.

    ⚠ TROIS FAÇONS DE RECONNAÎTRE LA MÊME CHAMBRE, de la plus sûre à la moins :
      le libellé ET la saison, le libellé seul, puis deux mots en commun — le
      modèle reformule (« Location de la villa (jusqu'à 6 personnes) » là où la
      page écrit « Location de villa exclusive avec service hotelier »).

    ⚠ ET AUCUN PRIX N'EST INVENTÉ : une chambre que les règles n'ont pas
      chiffrée reste sans prix, comme avant.
    """
    chiffrees = [c for c in des_regles if c.get("prix_ar")]
    if not chiffrees:
        return du_modele

    def mots(nom: str) -> set:
        # Le pluriel ne fait pas deux chambres : la page annonce
        # « Bungalows de luxe », le modele rend « Bungalow de luxe ».
        return {m.rstrip("s") for m in _cle_chambre(nom)[0].split() if len(m) >= 4}

    def meme_saison(a: str, b: str) -> bool:
        # Le modele recopie les dates avec l'etiquette : « Basse Saison
        # (05/01-31/03) » est bien la « Basse Saison » lue sur la page.
        return a == b or (bool(a) and bool(b) and (a in b or b in a))

    utilisees = set()
    sortie = []
    for chambre in du_modele:
        if chambre.get("prix_ar"):
            sortie.append(chambre)
            continue
        cle = _cle_chambre(chambre["nom"], chambre.get("saison"))
        jumelle = next(
            (c for i, c in enumerate(chiffrees) if i not in utilisees
             and _cle_chambre(c["nom"], c.get("saison")) == cle),
            None,
        ) or next(
            (c for i, c in enumerate(chiffrees) if i not in utilisees
             and _cle_chambre(c["nom"])[0] == cle[0]),
            None,
        ) or next(
            (c for i, c in enumerate(chiffrees) if i not in utilisees
             and meme_saison(_cle_chambre(c["nom"], c.get("saison"))[1], cle[1])
             and len(mots(c["nom"]) & mots(chambre["nom"])) >= 2),
            None,
        )
        if jumelle is not None:
            utilisees.add(chiffrees.index(jumelle))
            chambre = dict(chambre, prix_ar=jumelle["prix_ar"],
                           description=chambre.get("description")
                           or jumelle.get("description"))
        sortie.append(chambre)

    # Une chambre chiffrée que le modèle n'a pas vue vaut mieux qu'un trou.
    for i, chambre in enumerate(chiffrees):
        if i not in utilisees:
            sortie.append(chambre)
    return sortie


def fusionner_site(regles: dict, llm: dict) -> dict:
    """Combine la lecture d'un site par règles et par modèle.

    ⚠ LE MODÈLE FAIT AUTORITÉ SUR LES CHAMBRES. Une grille de tarifs est un
      tableau HTML mis à plat : les règles y lisent des lignes, le modèle y lit
      une structure (saison, capacité, pension). Mais s'il rend une liste vide
      alors que les règles ont trouvé des chambres, on garde celles des règles :
      une lecture partielle vaut mieux qu'un trou.
    """
    fusion = dict(regles)

    for cle_llm, cle_nous in (
        ("nom", "nom_etab"), ("lieu", "lieu_texte"), ("adresse", "adresse"),
        ("repere", "repere"), ("telephone", "telephone"), ("whatsapp", "whatsapp"),
        ("email", "email"), ("horaires", "horaires"), ("resume", "resume"),
    ):
        valeur = llm.get(cle_llm)
        if valeur not in (None, "", []):
            fusion[cle_nous] = valeur

    if llm.get("categories"):
        valides = [c for c in llm["categories"] if c in (
            "hotel", "restaurant", "agence_voyage", "guide", "transporteur",
            "location_vehicule", "site_attraction", "organisateur_evenement")]
        if valides:
            fusion["categories"] = valides

    devise = (llm.get("devise") or "Ar").strip()
    chambres = []
    for chambre in llm.get("chambres") or []:
        nom = (chambre.get("nom") or "").strip()
        prix = chambre.get("prix_ar")
        if not nom:
            continue
        if not isinstance(prix, (int, float)) or not 5_000 <= prix <= 5_000_000:
            prix = None
        chambres.append({
            "nom": nom[:120], "prix_ar": int(prix) if prix else None,
            "unite": chambre.get("unite") if chambre.get("unite") in ("chambre", "personne")
            else "chambre",
            "capacite": chambre.get("capacite") if isinstance(chambre.get("capacite"), int)
            else None,
            "saison": (chambre.get("saison") or "").strip() or None,
            "eau_chaude": bool(chambre.get("eau_chaude")),
            "sdb_privee": bool(chambre.get("sdb_privee", True)),
            "vue": chambre.get("vue") if chambre.get("vue") in ("mer", "lac", "montagne")
            else None,
            "description": (chambre.get("description") or "").strip()[:280] or None,
        })
    if chambres:
        # 🔴 C'EST ICI QUE LES 55 CHAMBRES PERDAIENT LEUR PRIX. Le prompt
        #    interdit au modèle de convertir une devise (à raison), donc sur un
        #    site affiché en euros il rend des chambres bien nommées et SANS
        #    PRIX — puis sa liste remplaçait celle des règles. Or
        #    `room_types.base_price_ar` est NOT NULL : ces chambres ne
        #    partaient jamais. Le modèle garde la main sur la structure, les
        #    règles lui prêtent le chiffre qu'elles ont su lire.
        chambres = _prix_repris_des_regles(chambres, regles.get("lignes_chambre") or [])
        fusion["lignes_chambre"] = chambres

    plats = []
    for plat in llm.get("plats") or []:
        nom = (plat.get("nom") or "").strip()
        if not nom:
            continue
        prix = plat.get("prix_ar")
        plats.append({
            "nom": nom[:120],
            "prix_ar": int(prix) if isinstance(prix, (int, float))
            and 500 <= prix <= 500_000 else None,
            "description": (plat.get("description") or "").strip()[:280] or None,
            "unite": "portion",
            "section": (plat.get("section") or "").strip() or None,
        })
    if plats:
        fusion["lignes_carte"] = plats

    # Comme pour les chambres : le modèle fait autorité s'il a lu des offres,
    # mais une liste vide ne fait pas oublier celles des règles.
    vehicules = _vehicules_valides(llm)
    if vehicules:
        fusion["lignes_vehicule"] = vehicules

    # Le prix d'appel se recalcule sur ce que le modèle a rendu.
    chiffrees = [c["prix_ar"] for c in fusion.get("lignes_chambre") or [] if c["prix_ar"]]
    if chiffrees:
        fusion["prix_ar"], fusion["prix_unite"] = min(chiffrees), "nuit"

    fusion["devise_site"] = devise
    fusion["llm_confiance"] = llm.get("confiance")
    doute = (llm.get("doute") or "").strip()
    if devise not in ("Ar", ""):
        doute = (f"prix affichés en {devise} — non convertis. " + doute).strip()
    fusion["llm_doute"] = doute
    fusion["lu_par_llm"] = True
    return fusion


# ── Lecture d'une carte photographiée ───────────────────────────────────────
def _image_en_base64(chemin: Path, cote_max: int = 1600) -> tuple[str, str]:
    """L'image, réduite à `cote_max` px et recompressée avant l'envoi.

    ⚠ Une photo Facebook pleine taille pèse quatre à huit fois la version
      1 600 px : c'était le poste de coût le plus lourd du bot, pour une carte
      que le modèle lit aussi bien en petit.
    """
    try:
        from PIL import Image, ImageOps
        import io
        with Image.open(chemin) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            if max(img.size) > cote_max:
                img.thumbnail((cote_max, cote_max), Image.LANCZOS)
            tampon = io.BytesIO()
            img.save(tampon, "JPEG", quality=82, optimize=True)
            return "image/jpeg", base64.b64encode(tampon.getvalue()).decode()
    except Exception:
        octets = chemin.read_bytes()
        suffixe = chemin.suffix.lower()
        type_mime = "image/png" if suffixe == ".png" else "image/jpeg"
        return type_mime, base64.b64encode(octets).decode()


def lire_carte(chemins: list[Path], cfg: dict) -> dict:
    """Transcrit une carte de restaurant depuis ses photos.

    ⚠ DEUX IMAGES AU MAXIMUM par appel. Au-delà, la réponse se dégrade et le
      coût grimpe pour rien : une carte tient presque toujours en un ou deux
      clichés, et les suivants sont des photos de plats.
    """
    lot = [c for c in chemins if c.exists()][:2]
    if not lot:
        raise LLMIndisponible("aucune photo à lire")

    contenu_anthropic = []
    contenu_passerelle = []
    for chemin in lot:
        type_mime, donnees = _image_en_base64(chemin)
        contenu_anthropic.append({
            "type": "image",
            "source": {"type": "base64", "media_type": type_mime, "data": donnees},
        })
        contenu_passerelle.append({
            "type": "image_url",
            "image_url": {"url": f"data:{type_mime};base64,{donnees}"},
        })
    consigne = "Transcris cette carte."
    contenu_anthropic.append({"type": "text", "text": consigne})
    contenu_passerelle.append({"type": "text", "text": consigne})

    return _appeler(SYSTEME_CARTE, contenu_anthropic, contenu_passerelle, cfg)


# ── Ce qui n'est pas un plat ────────────────────────────────────────────────
# Un mot qui étiquette un prix sur une affiche, pris pour le nom du plat qu'il
# annonce. Mesuré le 04/09/2026 : quatre lignes de carte de Diako s'appellent
# « Prix », dont une à 400 000 Ar sur la fiche « Tragno afondro ».
ETIQUETTES_DE_PRIX = {
    "prix", "tarif", "tarifs", "prix unitaire", "montant", "total", "pack",
    "adult rate", "child rate", "journee", "journée", "demi journee",
    "demi-journée", "forfait", "menu", "offre", "promo",
}

# 🔴 LE PLAFOND D'UN PLAT, MESURÉ ET NON SUPPOSÉ. Sur les 72 lignes de carte
#    tarifées de Diako au 04/09/2026 : médiane 25 000 Ar, et le plus cher plat
#    RÉEL est un « Grand Buffet Complet » à 80 000 Ar. Tout ce qui dépassait
#    était une erreur de lecture — « frites » à 250 000 Ar chez Airtchiry Mada
#    Tech, « Adult rate » à 300 000 Ar (le forfait journée d'un hôtel-spa, pas
#    une assiette). L'ancien plafond de 500 000 Ar laissait tout passer, et la
#    base promouvait ensuite ce montant en prix d'appel de la fiche : le site
#    affichait « Vanila Hotel & Spa — à partir de 300 000 Ar le plat ».
#    120 000 Ar laisse la marge d'un banquet au-dessus du maximum observé.
PRIX_PLAT_MAX = 120_000
PRIX_PLAT_MIN = 500


def plats_depuis_carte(lecture: dict) -> list[dict]:
    """Aplatit la transcription d'une carte en lignes prêtes pour la base.

    Un montant hors des bornes n'emporte pas le plat : le nom reste, le prix
    tombe. Le prix ne voyage jamais seul, et un plat sans prix vaut mieux qu'un
    plat au prix faux.
    """
    if not lecture.get("est_une_carte"):
        return []
    if (lecture.get("devise") or "Ar") != "Ar":
        return []
    lignes = []
    for section in lecture.get("sections") or []:
        nom_section = (section.get("nom") or "").strip() or None
        for plat in section.get("plats") or []:
            nom = (plat.get("nom") or "").strip()
            if not nom:
                continue
            # « Prix » n'est pas un plat : c'est l'étiquette du montant voisin.
            if nom.lower().strip(" :.-") in ETIQUETTES_DE_PRIX:
                continue
            prix = plat.get("prix_ar")
            plausible = (isinstance(prix, (int, float))
                         and PRIX_PLAT_MIN <= prix <= PRIX_PLAT_MAX)
            lignes.append({
                "nom": nom[:120], "prix_ar": int(prix) if plausible else None,
                "description": (plat.get("description") or "").strip()[:280] or None,
                "unite": "portion", "section": nom_section,
            })
    return lignes


# ── Fusion des deux lectures ────────────────────────────────────────────────
UNITES_CONNUES = {"nuit", "plat", "portion", "personne", "jour", "circuit", "chambre",
                  "entree", "groupe", "vehicule", "trajet"}


def _chiffres(texte: str) -> str:
    return re.sub(r"\D", "", texte or "")


def montant_dans_le_texte(montant, texte: str) -> bool:
    """Le montant rendu par le modèle figure-t-il dans le texte source ?

    🔴 LE MODÈLE NE DOIT RIEN INVENTER, et le prompt le lui dit. Mais rien ne
       le vérifiait : un « 25 000 Ar » plausible et absent de la publication
       passait les bornes et partait en base. On exige que les chiffres du
       montant apparaissent dans le texte (« 25 000 », « 25.000 », « 25000 »,
       « 25k »). Sans texte, on fait confiance (relecture à la main).
    """
    if not texte:
        return True
    try:
        n = int(montant)
    except (TypeError, ValueError):
        return False
    if n <= 0:
        return False
    chiffres = _chiffres(texte)
    if str(n) in chiffres:
        return True
    if n % 1000 == 0 and re.search(rf"(?<!\d){n // 1000}\s*k(?![a-z])", texte, re.I):
        return True
    # « 1,5 million », « 1.5M »
    if n % 100_000 == 0 and re.search(
        rf"(?<!\d){n // 1_000_000}[.,]?{(n % 1_000_000) // 100_000 or ''}\s*(m|millions?)(?![a-z])",
        texte, re.I,
    ):
        return True
    return False


def fusionner(regles: dict, llm: dict, texte: str = "", cfg: dict | None = None) -> dict:
    """Combine la lecture par règles et celle du modèle.

    Le modèle fait autorité sur ce qui demande du jugement (nature de la
    publication, nom de l'établissement, résumé). Les règles gardent la main
    sur le téléphone : le format malgache est rigide, un motif ne s'y trompe
    pas et surtout ne l'invente pas.

    ⚠ DEUX GARDE-FOUS AJOUTÉS LE 02/09/2026, parce qu'aucun n'existait :
      - un montant ou une date que le texte ne contient pas est ÉCARTÉ (voir
        `montant_dans_le_texte`) ;
      - sous `llm_confiance_min`, on ne reprend du modèle que le genre, le
        résumé et les catégories — les chiffres restent aux règles. Le
        réglage existait dans la configuration et n'était lu nulle part.
    """
    fusion = dict(regles)
    doutes: list[str] = []

    confiance = llm.get("confiance")
    mini = int((cfg or {}).get("llm_confiance_min", 55) or 0)
    peu_sur = isinstance(confiance, (int, float)) and confiance < mini

    genre = llm.get("genre")
    if genre in ("etablissement", "carte", "evenement", "recit", "rien"):
        fusion["genre"] = genre
    # 🔴 LES RÈGLES ONT LE DERNIER MOT SUR CE QUI NE VA PAS AU FIL NI AU
    #    CALENDRIER : vente d'objets, vœux de fête, offre commerciale, voyage
    #    organisé. Le modèle lit bien, mais « Joyeuse fête nationale » lui
    #    ressemble à un récit et « Voyage organisé Tana-Tuléar » à un événement.
    motif = regles.get("motif_classement") or ""
    if fusion.get("genre") in ("recit", "evenement") and any(
        m in motif for m in ("vente d'objets", "vœux", "calendaire", "offre", "voyage organisé")
    ):
        fusion["genre"] = regles.get("genre") or fusion["genre"]
        doutes.append(f"genre tenu par les règles ({motif})")

    NATURES = {"voyage": "recit", "parc": "recit", "endroit": "recit", "culinaire": "assiette",
               "mesaventure": "avis", "photo": "photo", "bon_plan": "bon_plan",
               "alerte": "alerte"}
    nature = llm.get("nature_recit")
    if fusion.get("genre") == "recit" and nature in NATURES:
        fusion["post_genre"] = NATURES[nature]

    correspondances = {
        "nom_etablissement": "nom_etab", "lieu": "lieu_texte", "adresse": "adresse",
        "repere": "repere", "whatsapp": "whatsapp", "email": "email",
        "site_web": "site_web", "horaires": "horaires", "resume": "resume",
    }
    for cle_llm, cle_nous in correspondances.items():
        valeur = llm.get(cle_llm)
        if valeur in (None, "", []):
            continue
        # ⚠ LE LIEU DES RÈGLES EST UN NOM DU RÉFÉRENTIEL (donc rapprochable) ;
        #   celui du modèle est du texte libre (« Majunga », « Dubai »). Il ne
        #   remplace pas ce que les règles ont déjà reconnu — 104 trouvailles
        #   bloquées « sans lieu » venaient de là (02/09/2026).
        if cle_nous == "lieu_texte" and regles.get("lieu_texte"):
            continue
        if peu_sur and cle_nous not in ("resume", "nom_etab", "lieu_texte"):
            continue
        fusion[cle_nous] = valeur

    if peu_sur:
        doutes.append(f"confiance {confiance}/100 sous le seuil {mini} : chiffres laissés aux règles")

    if llm.get("categories"):
        fusion["categories"] = [
            c for c in llm["categories"]
            if c in ("hotel", "restaurant", "agence_voyage", "guide", "transporteur",
                     "location_vehicule", "site_attraction", "organisateur_evenement")
        ] or regles.get("categories") or []

    # Le téléphone : les règles d'abord, le modèle en secours seulement.
    if not fusion.get("telephone") and llm.get("telephone"):
        fusion["telephone"] = llm["telephone"]

    prix = llm.get("prix")
    if isinstance(prix, dict) and prix.get("montant") and not peu_sur:
        try:
            montant = int(prix["montant"])
        except (TypeError, ValueError):
            montant = None
        if montant and not montant_dans_le_texte(montant, texte):
            doutes.append(f"prix {montant} Ar rendu par le modèle, absent du texte : écarté")
        elif montant:
            fusion["prix_ar"] = montant
            unite = (prix.get("unite") or "").strip().lower()
            fusion["prix_unite"] = unite if unite in UNITES_CONNUES else fusion.get("prix_unite")

    # Les plats du modèle complètent ceux des règles ; les doublons de nom
    # sautent, le prix le plus précis gagne.
    plats_llm = []
    for plat in (llm.get("plats") or []) if not peu_sur else []:
        nom = (plat.get("nom") or "").strip()
        if not nom:
            continue
        prix_plat = plat.get("prix_ar")
        prix_ok = isinstance(prix_plat, (int, float)) and 500 <= prix_plat <= 500_000
        if prix_ok and not montant_dans_le_texte(int(prix_plat), texte):
            doutes.append(f"prix du plat « {nom[:30]} » absent du texte : laissé vide")
            prix_ok = False
        plats_llm.append({
            "nom": nom[:120],
            "prix_ar": int(prix_plat) if prix_ok else None,
            "description": (plat.get("description") or "").strip()[:280] or None,
            "unite": "portion",
            "section": (plat.get("section") or "").strip() or None,
        })
    if plats_llm:
        connus = {p["nom"].lower() for p in plats_llm}
        fusion["lignes_carte"] = plats_llm + [
            p for p in (regles.get("lignes_carte") or [])
            if p["nom"].lower() not in connus
        ]

    evenement = llm.get("evenement")
    if isinstance(evenement, dict) and not peu_sur:
        if evenement.get("titre"):
            fusion["titre_evt"] = evenement["titre"][:160]
        for cle_llm, cle_nous in (("debut", "evt_debut"), ("fin", "evt_fin")):
            valeur = evenement.get(cle_llm)
            if not (isinstance(valeur, str) and len(valeur) == 10):
                continue
            try:
                jour = _date.fromisoformat(valeur)
            except ValueError:
                doutes.append(f"date « {valeur} » illisible : écartée")
                continue
            # L'année doit être écrite quelque part dans le texte, ou être
            # celle des règles : le prompt l'exige, on le vérifie enfin.
            if texte and str(jour.year) not in texte and regles.get(cle_nous) != valeur:
                doutes.append(f"date {valeur} : année absente du texte, écartée")
                continue
            fusion[cle_nous] = valeur
        if evenement.get("organisateur"):
            fusion["organisateur"] = evenement["organisateur"][:120]
        if evenement.get("recurrent") is not None:
            fusion["evt_recurrent"] = bool(evenement["recurrent"])
        if evenement.get("prix_entree"):
            try:
                entree = int(evenement["prix_entree"])
            except (TypeError, ValueError):
                entree = None
            if entree and montant_dans_le_texte(entree, texte):
                fusion["prix_ar"] = entree
                fusion["prix_unite"] = "personne"
            elif entree:
                doutes.append(f"prix d'entrée {entree} Ar absent du texte : écarté")

    # ⭐ LES CIRCUITS D'AGENCE. `tours` est vide sur Diako alors que les agences
    #   ne racontent que ça. Un circuit sans durée n'entre pas : `duration_days`
    #   est l'entier sur lequel on filtre, et un « 8 jours » approximatif ferait
    #   ressortir le circuit dans les mauvaises recherches.
    circuits = []
    for circuit in llm.get("circuits") or []:
        titre = (circuit.get("titre") or "").strip()
        jours = circuit.get("jours")
        if not titre or not isinstance(jours, int) or not 1 <= jours <= 60:
            continue
        prix = circuit.get("prix_ar")
        unite = circuit.get("prix_unite")
        circuits.append({
            "titre": titre[:160],
            "resume": (circuit.get("resume") or "").strip()[:600] or None,
            "jours": jours,
            "nuits": circuit.get("nuits") if isinstance(circuit.get("nuits"), int) else None,
            "prix_ar": int(prix) if isinstance(prix, (int, float))
            and 10_000 <= prix <= 50_000_000 else None,
            "prix_unite": unite if unite in ("personne", "groupe", "vehicule") else "personne",
            "base_personnes": circuit.get("base_personnes")
            if isinstance(circuit.get("base_personnes"), int) else None,
            "depart": (circuit.get("depart") or "").strip() or None,
            "arrivee": (circuit.get("arrivee") or "").strip() or None,
            "transports": [t for t in (circuit.get("transports") or []) if isinstance(t, str)][:6],
            "inclus": [i for i in (circuit.get("inclus") or []) if isinstance(i, str)][:12],
        })
    if circuits:
        fusion["lignes_circuit"] = circuits

    # ⭐ LA GRILLE D'UN LOUEUR. 24 trouvailles `location_vehicule` ne
    #   produisaient AUCUN tarif : les règles ne lisent que les lignes
    #   « type + prix/jour », le modèle lit aussi la prose.
    vehicules = _vehicules_valides(llm)
    if vehicules:
        fusion["lignes_vehicule"] = vehicules

    recit = llm.get("recit")
    if isinstance(recit, dict) and (recit.get("corps") or "").strip():
        fusion["corps"] = recit["corps"].strip()

    fusion["llm_confiance"] = llm.get("confiance")
    fusion["llm_doute"] = " · ".join(
        [d for d in [(llm.get("doute") or "").strip()] if d] + doutes
    )[:600]
    fusion["lu_par_llm"] = True
    return fusion


def tester(cfg: dict) -> dict:
    """Vérifie que le chemin choisi répond — utilisé par le bouton des réglages."""
    exemple = (
        "Ouverture de Chez Mariette à Ampefy, en face de la station Jovenna. "
        "Ravitoto sy henakisoa 12 000 Ar, romazava 10 000 Ar. "
        "Ouvert tous les jours de 11h à 21h. Réservation 034 12 345 67."
    )
    lecture = relire(exemple, cfg)
    transport = cfg.get("llm_transport", "passerelle")
    return {
        "ok": True,
        "transport": transport,
        "modele": cfg.get("llm_modele")
        or (MODELE_ANTHROPIC if transport == "anthropic" else MODELE_PASSERELLE),
        "genre_lu": lecture.get("genre"),
        "nom_lu": lecture.get("nom_etablissement"),
        "plats_lus": len(lecture.get("plats") or []),
        "confiance": lecture.get("confiance"),
    }
