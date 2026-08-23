"""Ce que Diako contient DÉJÀ — et ce qui lui manque.

Ce module fait trois choses, et c'est le cœur de la différence avec le bot
immobilier :

  1. il **charge le référentiel** (3 356 fiches d'établissement, 22 707 lieux,
     95 plats) dans le cache local, une fois par demi-journée ;
  2. il **rapproche** une trouvaille d'une fiche existante — parce que le
     travail n'est pas de créer la fiche n° 3 357, mais de remplir les 3 356
     qui sont vides ;
  3. il mesure **ce qui manque** au site, pour que le tableau de bord dise où
     porter l'effort au lieu de compter des publications.

🔴 POURQUOI LE RAPPROCHEMENT EST LE POINT DÉLICAT. Poser une photo, un numéro
   ou une carte sur la MAUVAISE fiche est pire que ne rien poser : personne ne
   vient corriger. Deux garde-fous, tous deux payés cher ailleurs dans ce
   projet :

   ⚠ Le rapprochement se fait sur les mots DISTINCTIFS, jamais sur les mots de
     catégorie. Comparer « Restaurant Sakamanga » à l'annuaire rend, en
     similarité brute, une fiche nommée « restaurant » tout court à 0,52 — plus
     haut que le vrai Sakamanga. `scripts/photos_archives.py` a connu la même
     chose avec « Nosy » : six îles distinctes rangées sous « Nosy Be ».

   ⚠ Le cache se charge EN ENTIER ou pas du tout. Un référentiel tronqué ne
     rate pas bruyamment : il fait croire qu'une fiche n'existe pas, et le bot
     en crée un doublon.
"""
from __future__ import annotations

import difflib
import re
import threading
import time
import unicodedata

import requests

from . import base
from .config import API_SUPABASE, JETON_SUPABASE, JETON_SUPABASE_REPLI, lire_secret

CLE_REFERENTIEL = "referentiel_charge_le"
DUREE_MANQUES = 600  # secondes — le site ne change pas toutes les minutes

_cache_manques: dict = {"quand": 0.0, "valeur": {}}
_verrou = threading.Lock()

# Mots qui ne distinguent RIEN. Ils restent dans le nom affiché, mais ne
# peuvent jamais à eux seuls rapprocher deux fiches.
# ⚠ CETTE LISTE EST VOLONTAIREMENT COURTE. N'y mettre QUE des mots de catégorie
#   — ceux que les imports collent devant un nom. Y ajouter des mots ordinaires
#   fait des dégâts dans l'autre sens : avec « table » déclaré générique,
#   « Chez Mariette » et « La Table de Mariette » ne partagent plus que
#   « Mariette » et montent à 0,86, assez pour un rattachement automatique sur
#   le mauvais établissement. Mesuré sur l'annuaire réel.
GENERIQUES = {
    "restaurant", "resto", "restau", "hotel", "hôtel", "lodge", "bungalow",
    "bungalows", "auberge", "snack", "bar", "cafe", "café", "pizzeria",
    "guesthouse", "motel", "gite", "gîte", "residence", "résidence",
    "camping", "chambre", "chambres", "hebergement", "hébergement",
    "chalet", "ecolodge", "chez",
    "de", "du", "des", "la", "le", "les", "l", "d", "et", "a", "au",
    "aux", "ny", "sy", "amin", "of", "and", "the",
    # 🔴 LES GÉNÉRIQUES GÉOGRAPHIQUES, ET C'EST LA LEÇON LA PLUS CHÈRE DU PROJET.
    #    « Nosy » (île) est commun à Nosy Be, Nosy Komba, Nosy Iranja, Nosy
    #    Mitsio, Nosy Sakatia, Nosy Tanikely et Nosy Boraha : le rapprochement
    #    par sous-chaîne avait rangé SIX ÎLES DISTINCTES sous Nosy Be
    #    (scripts/photos_archives.py). Même famille : parc, lac, baie, mont.
    "nosy", "ile", "iles", "lac", "parc", "reserve", "baie", "plage", "mont",
    "montagne", "cap", "pointe", "vallee", "riviere", "national", "communautaire",
    # Les titres de sites web ajoutent le pays : « Nature Lodge Madagascar ».
    # Sans lui ici, deux établissements sans rapport partageraient un mot fort.
    "madagascar", "mada", "madagasikara",
    # ⚠ MOTS FRANÇAIS TROP COURANTS POUR DÉSIGNER QUOI QUE CE SOIT. Ils entrent
    #   dans des noms de sites (« Parc de l'Est », « Grande Cascade ») et
    #   déclenchaient sur n'importe quelle phrase qui les contient.
    "est", "ouest", "nord", "sud", "grand", "grande", "petit", "petite",
    "beau", "belle", "vieux", "vieille", "nouveau", "nouvelle", "haut", "haute",
    "bas", "basse", "vue", "point", "site", "centre", "village", "ville",
    "passe", "route", "pont", "port", "eau", "sable", "sacre", "sacree",
}

ARTICLES = {"de", "du", "des", "la", "le", "les", "l", "d", "et", "a", "au",
            "aux", "ny", "sy", "the", "of", "and", "en"}


def sans_accent(texte: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texte or "")
        if unicodedata.category(c) != "Mn"
    )


def jetons(texte: str) -> list[str]:
    """Mots normalisés d'un nom, articles retirés."""
    propre = re.sub(r"[^a-z0-9 ]+", " ", sans_accent(texte).lower())
    return [m for m in propre.split() if len(m) > 1 and m not in ARTICLES]


def jeu(texte: str) -> str:
    """Représentation stable d'un nom, telle qu'elle est rangée en cache."""
    return " ".join(sorted(set(jetons(texte))))


def _forts(mots) -> set[str]:
    return {m for m in mots if m not in GENERIQUES}


def similitude(a: str, b: str) -> float:
    """Note de 0 à 1 entre deux noms d'établissement.

    ⚠ ZÉRO SI AUCUN MOT DISTINCTIF N'EST COMMUN. « Restaurant Sakamanga » et
      « Restaurant Sak'Malao » partagent « restaurant » et rien d'autre : ce
      n'est pas un rapprochement, c'est une catégorie commune.
    """
    ja, jb = set(jetons(a)), set(jetons(b))
    if not ja or not jb:
        return 0.0
    fa, fb = _forts(ja), _forts(jb)
    if not fa or not fb:
        # Les deux noms ne sont QUE des mots de catégorie (« restaurant »,
        # « hotel ») : ils ne désignent personne. On ne rapproche pas.
        return 0.0
    communs = fa & fb
    if not communs:
        return 0.0

    jaccard = len(communs) / len(fa | fb)
    # La ressemblance de chaîne rattrape les orthographes proches
    # (« Sakamanga » / « Sakamanga Hôtel », « Mad'Zebu » / « Mad Zebu »).
    chaine = difflib.SequenceMatcher(
        None, " ".join(sorted(ja)), " ".join(sorted(jb))
    ).ratio()
    return round(0.65 * jaccard + 0.35 * chaine, 4)


# ── Accès Supabase ──────────────────────────────────────────────────────────
def executer_sql(requete: str, delai: int = 90) -> list:
    """Requête SQL sur la base Diako, via l'API Management.

    Le jeton est celui du COMPTE Supabase : celui posé pour Fonenako ouvre
    aussi ce projet. On préfère `~/.diako-secrets/supabase_token.txt` s'il
    existe, pour qu'une révocation reste séparable.
    """
    jeton = lire_secret(JETON_SUPABASE, JETON_SUPABASE_REPLI)
    r = requests.post(
        API_SUPABASE,
        headers={"Authorization": f"Bearer {jeton}", "Content-Type": "application/json"},
        json={"query": requete},
        timeout=delai,
    )
    if not r.ok:
        raise RuntimeError(f"Supabase a refusé : HTTP {r.status_code} — {r.text[:300]}")
    try:
        donnees = r.json()
    except ValueError:
        return []
    return donnees if isinstance(donnees, list) else []


def _txt(valeur) -> str:
    if valeur is None or valeur == "":
        return "NULL"
    return "'" + str(valeur).replace("'", "''") + "'"


# ── Chargement du référentiel ───────────────────────────────────────────────
def _charger_par_tranches(requete_gabarit: str, taille: int = 4000) -> list[dict]:
    """Lit une table entière, par tranches ordonnées.

    ⚠ Une seule requête qui rend 22 707 lignes passe parfois, et parfois se
      fait couper. Une lecture tronquée est indétectable en aval : on découpe.
    """
    tout, decalage = [], 0
    while True:
        lot = executer_sql(requete_gabarit.format(limite=taille, decalage=decalage))
        tout.extend(lot)
        if len(lot) < taille:
            return tout
        decalage += taille


def rafraichir_referentiel(force: bool = False, heures: int = 12) -> dict:
    """Recharge le cache local du référentiel Diako s'il a vieilli."""
    charge_le = float(base.lire_etat(CLE_REFERENTIEL, "0") or 0)
    if not force and time.time() - charge_le < heures * 3600:
        return base.taille_referentiel()

    base.logguer("Chargement du référentiel Diako (fiches, lieux, plats)…", "info")

    pages = _charger_par_tranches(
        "SELECT p.id::text, p.name, p.slug, p.categories::text AS categories, "
        "p.place_id::text AS lieu_id, l.name_fr AS lieu_nom, p.phone, p.cover_url, "
        "p.website, "
        "(SELECT count(*) FROM public.menu_items m WHERE m.page_id = p.id) AS nb_carte, "
        "(SELECT count(*) FROM public.room_types r WHERE r.page_id = p.id) AS nb_chambre "
        "FROM public.pages p LEFT JOIN public.places l ON l.id = p.place_id "
        "ORDER BY p.id LIMIT {limite} OFFSET {decalage}"
    )
    base.remplacer_referentiel("ref_pages", [
        {
            "id": p["id"], "nom": p["name"] or "", "jeu": jeu(p["name"] or ""),
            "slug": p.get("slug"), "categories": p.get("categories"),
            "lieu_id": p.get("lieu_id"), "lieu_nom": p.get("lieu_nom"),
            "telephone": p.get("phone"), "cover_url": p.get("cover_url"),
            "site_web": p.get("website"),
            "nb_carte": int(p.get("nb_carte") or 0),
            "nb_chambre": int(p.get("nb_chambre") or 0),
        }
        for p in pages
    ])

    lieux = _charger_par_tranches(
        "SELECT id::text, name_fr, slug, kind, region, is_touristique "
        "FROM public.places WHERE merged_into IS NULL "
        "ORDER BY id LIMIT {limite} OFFSET {decalage}"
    )
    base.remplacer_referentiel("ref_lieux", [
        {
            "id": l["id"], "nom": l["name_fr"] or "", "jeu": jeu(l["name_fr"] or ""),
            "slug": l.get("slug"), "genre": l.get("kind"), "region": l.get("region"),
            "touristique": 1 if l.get("is_touristique") else 0,
        }
        for l in lieux
    ])

    # Les sites et parcs : 2 521 fiches, 226 illustrées. Un récit sur les Tsingy
    # doit pouvoir donner sa photo à la fiche du parc.
    sites = _charger_par_tranches(
        "SELECT id::text, name, slug, kind, place_id::text AS lieu_id, cover_url "
        "FROM public.attractions ORDER BY id LIMIT {limite} OFFSET {decalage}"
    )
    base.remplacer_referentiel("ref_sites", [
        {
            "id": s["id"], "nom": s["name"] or "", "jeu": jeu(s["name"] or ""),
            "slug": s.get("slug"), "genre": s.get("kind"),
            "lieu_id": s.get("lieu_id"), "cover_url": s.get("cover_url"),
        }
        for s in sites
    ])

    # Les plats portent des orthographes multiples (254 variantes) : chacune
    # doit pouvoir rapprocher, sinon « ravitoto sy henakisoa » ne trouve rien.
    plats = executer_sql(
        "SELECT d.id::text, d.name_fr AS nom, d.slug FROM public.dishes d "
        "UNION ALL "
        "SELECT a.dish_id::text, a.alias AS nom, NULL FROM public.dish_aliases a"
    )
    vus, lignes_plats = set(), []
    for p in plats:
        cle = (p["id"], (p["nom"] or "").lower())
        if cle in vus or not p["nom"]:
            continue
        vus.add(cle)
        lignes_plats.append({
            "id": f"{p['id']}|{jeu(p['nom'])}", "nom": p["nom"],
            "jeu": jeu(p["nom"]), "slug": p.get("slug") or p["id"],
        })
    base.remplacer_referentiel("ref_plats", lignes_plats)

    base.ecrire_etat(CLE_REFERENTIEL, time.time())
    tailles = base.taille_referentiel()
    base.logguer(
        f"Référentiel chargé : {tailles['ref_pages']} fiches, "
        f"{tailles['ref_lieux']} lieux, {tailles['ref_plats']} orthographes de plats.",
        "succes",
    )
    return tailles


def age_referentiel() -> float:
    """Heures écoulées depuis le dernier chargement (999 si jamais)."""
    charge_le = float(base.lire_etat(CLE_REFERENTIEL, "0") or 0)
    return 999.0 if not charge_le else (time.time() - charge_le) / 3600


# ── Rapprochement ───────────────────────────────────────────────────────────
def rapprocher_page(nom: str, lieu_id: str | None = None,
                    seuil: float = 0.48, combien: int = 4) -> list[dict]:
    """Les fiches d'établissement qui ressemblent le plus à ce nom.

    Le lieu, quand on le connaît, sert de bonus — pas de filtre : un
    établissement mal rattaché dans l'annuaire ne doit pas devenir introuvable.
    """
    if not nom or not nom.strip():
        return []
    candidats = []
    for fiche in base.referentiel("ref_pages"):
        note = similitude(nom, fiche["nom"])
        if note < seuil - 0.15:
            continue
        if lieu_id and fiche.get("lieu_id") == lieu_id:
            note = min(1.0, note + 0.12)
        if note >= seuil:
            candidats.append({
                "id": fiche["id"], "nom": fiche["nom"], "slug": fiche.get("slug"),
                "lieu_nom": fiche.get("lieu_nom"), "score": round(note, 3),
                "a_photo": bool(fiche.get("cover_url")),
                "a_tel": bool(fiche.get("telephone")),
                "nb_carte": fiche.get("nb_carte") or 0,
                "nb_chambre": fiche.get("nb_chambre") or 0,
                "site_web": fiche.get("site_web"),
                "meme_lieu": bool(lieu_id and fiche.get("lieu_id") == lieu_id),
            })
    candidats.sort(key=lambda c: c["score"], reverse=True)
    return candidats[:combien]


def rapprocher_lieu(texte: str, seuil: float = 0.62) -> dict | None:
    """Le lieu du référentiel désigné par ce texte.

    ⚠ Les localités homonymes sont légion à Madagascar (deux Belo, plusieurs
      Ambohitra). À égalité de note, le lieu touristique l'emporte : c'est
      celui dont on parle sur Facebook.
    """
    if not texte or not texte.strip():
        return None
    meilleur = None
    for lieu in base.referentiel("ref_lieux"):
        note = similitude(texte, lieu["nom"])
        if note < seuil:
            continue
        rang = (note, lieu.get("touristique") or 0)
        if meilleur is None or rang > meilleur[0]:
            meilleur = (rang, lieu, note)
    if not meilleur:
        return None
    _, lieu, note = meilleur
    return {"id": lieu["id"], "nom": lieu["nom"], "slug": lieu.get("slug"),
            "score": round(note, 3)}


_cache_rarete: dict = {"taille": 0, "table": {}}
_cache_mots_lieux: dict = {"taille": 0, "mots": set()}


def _mots_de_lieux() -> set:
    """Tous les mots qui composent un nom de lieu du référentiel.

    Sert à distinguer un NOM PROPRE d'un mot de thème : « andasibe » est un
    toponyme, « lémuriens » n'en est pas un — et c'est cette différence, pas la
    rareté, qui dit si un mot désigne un endroit.
    """
    lieux = base.referentiel("ref_lieux")
    if _cache_mots_lieux["taille"] == len(lieux) and _cache_mots_lieux["mots"]:
        return _cache_mots_lieux["mots"]
    mots = set()
    for lieu in lieux:
        mots.update(_forts(set(jetons(lieu["nom"]))))
    _cache_mots_lieux.update({"taille": len(lieux), "mots": mots})
    return mots


def _rarete_des_sites(sites: list[dict]) -> dict:
    """Combien de sites portent chaque mot distinctif. Calculé une fois.

    ⚠ Recalculé seulement quand le cache change de taille : le rapprochement
      tourne pour CHAQUE trouvaille, et refaire 2 521 découpages à chaque appel
      coûterait plus cher que tout le reste de l'atelier.
    """
    if _cache_rarete["taille"] == len(sites) and _cache_rarete["table"]:
        return _cache_rarete["table"]
    table: dict = {}
    for site in sites:
        for mot in _forts(set(jetons(site["nom"]))):
            table[mot] = table.get(mot, 0) + 1
    _cache_rarete.update({"taille": len(sites), "table": table})
    return table


def rapprocher_site(texte: str, lieu_id: str | None = None,
                    seuil: float = 0.62) -> dict | None:
    """Le site ou parc dont parle ce texte — Tsingy, Andasibe, Nosy Komba…

    ⚠ ON CHERCHE DANS LE TEXTE ENTIER, pas dans un nom déjà extrait. Un récit ne
      dit pas « établissement : parc d'Andasibe » ; il raconte une journée à
      Andasibe. Le nom du site est noyé dans la prose, et c'est justement pour
      ça que la fiche du parc n'a jamais de photo.

    ⚠ Le lieu, quand on le connaît, départage les homonymes — mais ne filtre
      pas : beaucoup de sites n'ont pas de `place_id` en base.
    """
    if not texte or not texte.strip():
        return None
    jetons_texte = set(jetons(texte))
    if not jetons_texte:
        return None

    sites = base.referentiel("ref_sites")
    rarete = _rarete_des_sites(sites)

    meilleur, note_max = None, 0.0
    for site in sites:
        forts = _forts(set(jetons(site["nom"])))
        communs = forts & jetons_texte
        if not forts or not communs:
            continue          # aucun mot distinctif du site dans le texte

        # ⚠ LA COUVERTURE SEULE NE SUFFIT PAS, DANS LES DEUX SENS.
        #   « Parc national d'Andasibe-Mantadia » ne partage qu'« andasibe »
        #   avec un récit qui parle d'Andasibe : la couverture tombe à 0,5 et le
        #   parc était raté. À l'inverse, un site nommé « Tsingy » tout court
        #   atteint 1,0 sur n'importe quel texte qui dit « tsingy », alors que
        #   plusieurs sites portent ce mot.
        #   Ce qui départage, c'est la RARETÉ du mot commun : « andasibe »
        #   n'apparaît que dans deux noms de site, « tsingy » dans beaucoup.
        # 🔴 DEUX GARDE-FOUS DE LONGUEUR, ET ILS SONT INDISPENSABLES. Sans eux,
        #    mesuré sur les 2 521 sites réels :
        #      · « Superbe séjour à Ampefy, le lac **est** beau » désignait le
        #        site « Parc de l'**Est** » à 1,0 — son seul mot distinctif fait
        #        trois lettres ;
        #      · « on a **passé** la journée au parc d'Andasibe » désignait
        #        « **Passe** d'Orangéa ».
        #    Un nom dont tous les mots distinctifs sont courts ne désigne
        #    personne, et une correspondance PARTIELLE exige un mot long.
        if max(len(mot) for mot in forts) < 4:
            continue
        couverture = len(communs) / len(forts)
        if couverture < 1:
            # 🔴 UNE CORRESPONDANCE PARTIELLE DOIT PORTER SUR UN NOM DE LIEU.
            #    « Réserve communautaire d'**Anja** » désignait « La Réserve de
            #    **Lémuriens** Nosy Komba », parce que « lémuriens » n'apparaît
            #    que dans un seul nom de site et passait donc pour distinctif.
            #    La rareté parmi les sites ne dit pas si un mot est un NOM
            #    PROPRE : « lémuriens » est un mot de thème, « andasibe » un
            #    lieu. Les 18 334 toponymes du référentiel tranchent.
            candidats_partiels = {
                mot for mot in communs
                if len(mot) >= 6 and mot in _mots_de_lieux()
            }
            if not candidats_partiels:
                continue
        distinctif = min(rarete.get(mot, 99) for mot in communs)
        note = couverture
        if distinctif <= 3:
            # Mot rare : la moitié du nom suffit à désigner le bon site.
            note = max(note, 0.5 + 0.25 * couverture)
        elif distinctif >= 8:
            # Mot partagé par huit sites ou plus : il ne désigne personne.
            note *= 0.6
        if lieu_id and site.get("lieu_id") == lieu_id:
            note = min(1.0, note + 0.1)
        if note > note_max:
            meilleur, note_max = site, note

    if not meilleur or note_max < seuil:
        return None
    return {"id": meilleur["id"], "nom": meilleur["nom"], "slug": meilleur.get("slug"),
            "a_photo": bool(meilleur.get("cover_url")), "score": round(note_max, 3)}


def rapprocher_plat(nom: str, seuil: float = 0.6) -> dict | None:
    """Le plat du référentiel (95 plats, 254 orthographes) désigné par ce nom."""
    if not nom or not nom.strip():
        return None
    meilleur, note_max = None, 0.0
    for plat in base.referentiel("ref_plats"):
        note = similitude(nom, plat["nom"])
        if note > note_max:
            meilleur, note_max = plat, note
    if not meilleur or note_max < seuil:
        return None
    # L'identifiant du cache porte l'orthographe : on rend l'uuid seul.
    return {"id": meilleur["id"].split("|")[0], "nom": meilleur["nom"],
            "score": round(note_max, 3)}


def lieux_connus() -> list[str]:
    """Les noms de lieux, du plus long au plus court — pour les repérer dans un texte.

    On cherche d'abord les noms longs : « Nosy Boraha » doit gagner sur
    « Nosy », et « Ambohimanga Rova » sur « Ambohimanga ».
    """
    noms = [l["nom"] for l in base.referentiel("ref_lieux") if l["nom"]]
    return sorted(noms, key=len, reverse=True)


# ── Doublons côté Diako ─────────────────────────────────────────────────────
def evenement_deja_la(titre: str, debut: str | None) -> tuple[str | None, str]:
    """Cet événement est-il déjà au calendrier ? (± 3 jours sur la date)"""
    if not titre:
        return None, ""
    condition = (
        f"AND abs(starts_on - {_txt(debut)}::date) <= 3" if debut else ""
    )
    lignes = executer_sql(
        f"SELECT id::text, title, starts_on::text FROM public.events "
        f"WHERE public.dk_norm(title) % public.dk_norm({_txt(titre)}) {condition} "
        f"LIMIT 3"
    )
    for ligne in lignes:
        if similitude(titre, ligne["title"]) >= 0.6:
            return ligne["id"], f"« {ligne['title']} » le {ligne['starts_on']}"
    return None, ""


def carte_deja_la(page_id: str, noms: list[str]) -> set[str]:
    """Les plats de cette carte déjà saisis sur la fiche — pour ne pas les doubler."""
    if not page_id or not noms:
        return set()
    lignes = executer_sql(
        f"SELECT name FROM public.menu_items WHERE page_id = {_txt(page_id)}::uuid"
    )
    existants = [l["name"] for l in lignes]
    doublons = set()
    for nom in noms:
        if any(similitude(nom, existant) >= 0.7 for existant in existants):
            doublons.add(nom)
    return doublons


# ── Ce qui manque au site ───────────────────────────────────────────────────
def manques(forcer: bool = False) -> dict:
    """L'état réel du site, mesuré — pas estimé.

    C'est ce tableau qui répond à « qu'est-ce qu'on cherche sur Facebook ? ».
    Il est en cache 10 minutes : il sert d'orientation, pas de compteur temps
    réel.
    """
    with _verrou:
        if not forcer and _cache_manques["valeur"] and \
                time.time() - _cache_manques["quand"] < DUREE_MANQUES:
            return _cache_manques["valeur"]

    lignes = executer_sql("""
        SELECT
          (SELECT count(*) FROM public.pages)                                   AS fiches,
          (SELECT count(*) FROM public.pages WHERE cover_url IS NULL)           AS sans_photo,
          (SELECT count(*) FROM public.pages WHERE phone IS NULL
                                               AND whatsapp IS NULL)            AS sans_contact,
          (SELECT count(*) FROM public.pages
            WHERE coalesce(length(short_desc), 0) < 20)                         AS sans_texte,
          (SELECT count(*) FROM public.pages p
            WHERE 'restaurant' = ANY(p.categories)
              AND NOT EXISTS (SELECT 1 FROM public.menu_items m
                               WHERE m.page_id = p.id))                         AS restos_sans_carte,
          (SELECT count(*) FROM public.pages p
            WHERE 'hotel' = ANY(p.categories)
              AND NOT EXISTS (SELECT 1 FROM public.room_types r
                               WHERE r.page_id = p.id))                         AS hotels_sans_chambre,
          (SELECT count(*) FROM public.menu_items)                              AS lignes_de_carte,
          (SELECT count(*) FROM public.posts WHERE status = 'published')        AS recits,
          (SELECT count(*) FROM public.events
            WHERE is_published AND starts_on >= current_date)                   AS evenements_a_venir,
          (SELECT count(*) FROM public.attractions WHERE cover_url IS NULL)     AS sites_sans_photo
    """)
    valeur = dict(lignes[0]) if lignes else {}
    valeur = {k: int(v or 0) for k, v in valeur.items()}
    with _verrou:
        _cache_manques.update({"quand": time.time(), "valeur": valeur})
    return valeur


def oublier_cache() -> None:
    """À appeler après une publication : le site vient de changer."""
    with _verrou:
        _cache_manques.update({"quand": 0.0, "valeur": {}})


# ── Où porter l'effort ──────────────────────────────────────────────────────
def suggestions_de_recherche(combien: int = 8) -> list[dict]:
    """Des recherches Facebook à ajouter, déduites des trous réels du site.

    ⚠ CE N'EST PAS UNE LISTE D'IDÉES : chaque ligne vient d'un COMPTE en base.
      « 412 fiches sans photo à Nosy Be » se vérifie, « pensez à Nosy Be » ne se
      vérifie pas. Une suggestion qui ne dit pas d'où elle sort ne vaut rien.
    """
    lignes = executer_sql("""
        SELECT l.name_fr AS lieu,
               count(*) FILTER (WHERE p.cover_url IS NULL)          AS sans_photo,
               count(*) FILTER (WHERE p.phone IS NULL
                                  AND p.whatsapp IS NULL)           AS sans_contact,
               count(*) FILTER (WHERE 'restaurant' = ANY(p.categories)
                 AND NOT EXISTS (SELECT 1 FROM public.menu_items m
                                  WHERE m.page_id = p.id))          AS restos_sans_carte,
               count(*)                                             AS total
          FROM public.pages p
          JOIN public.places l ON l.id = p.place_id
         WHERE p.is_published
         GROUP BY l.name_fr
        HAVING count(*) >= 5
         ORDER BY count(*) DESC
         LIMIT 40
    """)

    propositions = []
    for ligne in lignes:
        lieu = ligne["lieu"]
        if int(ligne["restos_sans_carte"] or 0) >= 5:
            propositions.append({
                "termes": f"menu restaurant {lieu}",
                "gain": int(ligne["restos_sans_carte"]),
                "pourquoi": f"{ligne['restos_sans_carte']} restaurants sans carte à {lieu}",
            })
        if int(ligne["sans_photo"] or 0) >= 10:
            propositions.append({
                "termes": f"restaurant hotel {lieu}",
                "gain": int(ligne["sans_photo"]),
                "pourquoi": f"{ligne['sans_photo']} fiches sans photo à {lieu}",
            })
    propositions.sort(key=lambda p: p["gain"], reverse=True)

    # Deux recherches transversales, qui ne dépendent d'aucune localité : les
    # ouvertures (fiches qui n'existent nulle part) et les événements à venir.
    propositions = propositions[:combien] + [
        {"termes": "nouveau restaurant Madagascar ouverture",
         "gain": 0, "pourquoi": "les établissements qui n'existent dans aucun import"},
        {"termes": "festival Madagascar 2026",
         "gain": 0, "pourquoi": "le calendrier ne porte que ce qu'on y a mis à la main"},
    ]
    return propositions
