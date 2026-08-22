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
from pathlib import Path

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
    · "etablissement" : la publication présente un lieu qui accueille du public
      (restaurant, hôtel, lodge, bar, agence, parc) — ouverture, présentation,
      coordonnées, tarifs.
    · "carte" : la publication montre ou liste des PLATS AVEC LEUR PRIX.
    · "evenement" : quelque chose qui a lieu à une DATE (festival, concert,
      soirée, marché, compétition). Sans date ni période, ce n'est pas un
      événement.
    · "recit" : une expérience vécue, un avis, une photo de voyage, un bon plan,
      une mésaventure. C'est le cas par défaut.
    · "rien" : publicité sans objet, recrutement, politique, vente d'objets,
      condoléances, ou hors du champ voyage/goût.

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


def _via_passerelle(systeme: str, contenu, cfg: dict) -> dict:
    """LiteLLM local d'Hermes. Il n'expose que /v1/chat/completions."""
    adresse = (cfg.get("llm_passerelle") or "http://127.0.0.1:4000").rstrip("/")
    try:
        r = requests.post(
            f"{adresse}/v1/chat/completions",
            json={
                "model": cfg.get("llm_modele") or MODELE_PASSERELLE,
                "max_tokens": 3000,
                "messages": [
                    {"role": "system", "content": systeme},
                    {"role": "user", "content": contenu},
                ],
            },
            timeout=int(cfg.get("llm_delai", 120)),
        )
    except requests.RequestException as e:
        raise LLMIndisponible(str(e)[:200]) from e
    if not r.ok:
        raise LLMIndisponible(f"HTTP {r.status_code} — {r.text[:160]}")
    return _extraire_json(r.json()["choices"][0]["message"]["content"])


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
def _image_en_base64(chemin: Path) -> tuple[str, str]:
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


def plats_depuis_carte(lecture: dict) -> list[dict]:
    """Aplatit la transcription d'une carte en lignes prêtes pour la base."""
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
            prix = plat.get("prix_ar")
            prix = int(prix) if isinstance(prix, (int, float)) and 500 <= prix <= 500_000 else None
            lignes.append({
                "nom": nom[:120], "prix_ar": prix,
                "description": (plat.get("description") or "").strip()[:280] or None,
                "unite": "portion", "section": nom_section,
            })
    return lignes


# ── Fusion des deux lectures ────────────────────────────────────────────────
def fusionner(regles: dict, llm: dict) -> dict:
    """Combine la lecture par règles et celle du modèle.

    Le modèle fait autorité sur ce qui demande du jugement (nature de la
    publication, nom de l'établissement, résumé). Les règles gardent la main
    sur le téléphone : le format malgache est rigide, un motif ne s'y trompe
    pas et surtout ne l'invente pas.
    """
    fusion = dict(regles)

    genre = llm.get("genre")
    if genre in ("etablissement", "carte", "evenement", "recit", "rien"):
        fusion["genre"] = genre

    correspondances = {
        "nom_etablissement": "nom_etab", "lieu": "lieu_texte", "adresse": "adresse",
        "repere": "repere", "whatsapp": "whatsapp", "email": "email",
        "site_web": "site_web", "horaires": "horaires", "resume": "resume",
    }
    for cle_llm, cle_nous in correspondances.items():
        valeur = llm.get(cle_llm)
        if valeur not in (None, "", []):
            fusion[cle_nous] = valeur

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
    if isinstance(prix, dict) and prix.get("montant"):
        try:
            fusion["prix_ar"] = int(prix["montant"])
            fusion["prix_unite"] = prix.get("unite") or fusion.get("prix_unite")
        except (TypeError, ValueError):
            pass

    # Les plats du modèle complètent ceux des règles ; les doublons de nom
    # sautent, le prix le plus précis gagne.
    plats_llm = []
    for plat in llm.get("plats") or []:
        nom = (plat.get("nom") or "").strip()
        if not nom:
            continue
        prix_plat = plat.get("prix_ar")
        plats_llm.append({
            "nom": nom[:120],
            "prix_ar": int(prix_plat) if isinstance(prix_plat, (int, float))
            and 500 <= prix_plat <= 500_000 else None,
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
    if isinstance(evenement, dict):
        if evenement.get("titre"):
            fusion["titre_evt"] = evenement["titre"][:160]
        for cle_llm, cle_nous in (("debut", "evt_debut"), ("fin", "evt_fin")):
            valeur = evenement.get(cle_llm)
            if isinstance(valeur, str) and len(valeur) == 10:
                fusion[cle_nous] = valeur
        if evenement.get("organisateur"):
            fusion["organisateur"] = evenement["organisateur"][:120]
        if evenement.get("recurrent") is not None:
            fusion["evt_recurrent"] = bool(evenement["recurrent"])
        if evenement.get("prix_entree"):
            try:
                fusion["prix_ar"] = int(evenement["prix_entree"])
                fusion["prix_unite"] = "personne"
            except (TypeError, ValueError):
                pass

    recit = llm.get("recit")
    if isinstance(recit, dict) and (recit.get("corps") or "").strip():
        fusion["corps"] = recit["corps"].strip()

    fusion["llm_confiance"] = llm.get("confiance")
    fusion["llm_doute"] = (llm.get("doute") or "").strip()
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
