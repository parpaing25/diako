"""Trouver de nouveaux groupes et de nouvelles pages Facebook à surveiller.

Les sources s'épuisent : un groupe se vide, une page cesse de publier, et la
récolte baisse sans qu'on sache pourquoi. Ce module va chercher lui-même des
candidats, les note, et laisse Andry décider — un par un.

**Ce que Facebook laisse voir** (vérifié le 23/08/2026 sur la vraie session) :

* `/search/groups/?q=…` rend le nom, le nombre de membres, public ou privé, et
  le rythme (« Plus de 90 publications par jour »). C'est le meilleur signal
  qui existe : un groupe de 126 000 membres qui ne publie pas ne vaut rien.
* `/search/pages/?q=…` rend le nom, la catégorie, la ville et les abonnés.
* `/groups/discover/` propose des groupes voisins de ceux déjà suivis.

Deux règles de conduite, volontaires :

* **Le bot n'adhère à aucun groupe et ne suit aucune page.** Adhérer est un
  acte visible depuis le compte d'Andry ; c'est lui qui le fait, en un clic,
  depuis le lien de la fiche.
* **Un candidat écarté ne revient plus.** Sans cette mémoire, chaque
  prospection reproposerait les mêmes trente groupes déjà refusés.
"""
from __future__ import annotations

import re
import time
import unicodedata

from . import base
from .config import charger

# Ce que le bot cherche. C'est LE point d'adaptation d'un bot à l'autre :
# Fonenako cherche de l'immobilier, Diako du voyage, Akora des matériaux.
REQUETES_DEFAUT = [
    "tourisme Madagascar",
    "voyage Madagascar",
    "hôtel Madagascar",
    "bungalow Madagascar",
    "restaurant Antananarivo",
    "Nosy Be tourisme",
    "week-end Madagascar",
    "circuit Madagascar",
    "bons plans sortie Antananarivo",
    "vakansy Madagascar",
    "randonnée Madagascar",
    "agence de voyage Madagascar",
]

# Mots qui doivent apparaître dans le nom pour qu'un candidat soit crédible.
# Sans ce filtre, « trano » ramène des groupes de cuisine et de covoiturage.
# On se branche sur le vocabulaire que le bot connaît déjà : le même mot doit
# vouloir dire la même chose au tri d'une trouvaille et au choix d'une source.
def _mots_du_metier() -> tuple[str, ...]:
    from .extraction import MOTS_CATEGORIE

    propres = {m for mots in MOTS_CATEGORIE.values() for m in mots if len(m) >= 4}
    return tuple(sorted(propres | {
        "tourisme", "voyage", "vakansy", "escapade", "sortie", "sortir",
        "week-end", "weekend", "bons plans", "decouverte", "madagascar",
        "nosy", "plage", "evasion", "tsangatsangana", "sejour",
    }))


MOTS_METIER = _mots_du_metier()

# Un nom qui contient ça n'est pas une source d'annonces immobilières.
MOTS_REPOUSSOIRS = (
    # « tolotr'asa » = offre d'emploi. Un groupe d'emploi en hôtellerie de
    # 298 000 membres arrivait en tête de la prospection Diako : il aurait
    # noyé la collecte sous des offres de travail.
    "emploi", "job", "recrutement", "tolotr'asa", "tolotrasa", "tolotr asa",
    "mitady asa", "offre d emploi", "stage", "rencontre", "amour", "priere", "eglise",
    "football", "vente de voiture", "moto", "phone", "telephone", "vetement",
    "friperie", "sante", "crypto", "pari", "immobilier", "trano ahofa",
    "tany amidy", "terrain a vendre", "politique", "petites annonces",
)


# Catégories que Facebook affiche sous le nom d'une page. C'est le meilleur
# discriminant qui existe : bien meilleur que le nom, qui piège volontiers
# (« Kotrana ao an-trano » est un coach, pas une agence).
CATEGORIES_BONNES = (
    "hotel", "restaurant", "agence de voyages", "tourisme", "cafe", "bar",
    "lieu touristique", "hebergement", "gite", "parc", "musee", "plage",
    "traiteur", "attraction touristique", "voyages",
)
CATEGORIES_MAUVAISES = (
    "immobilier", "agent immobilier", "mannequinat", "coach", "gouvernement",
    "photographe", "concessionnaire", "eglise", "ecole", "banque",
    "association caritative", "vetements", "informatique",
)


def _sans_accents(t: str) -> str:
    """Normalise, polices fantaisie comprises.

    Facebook laisse écrire les noms en caractères mathématiques : « 𝙏𝙍𝘼𝙉𝙊
    𝘼𝙃𝙊𝙁𝘼 » est un vrai groupe de 40 000 abonnés. En NFD ces caractères
    restent intacts et aucun mot du métier n'est reconnu — la page tombait à
    40/100 au lieu d'être en tête. NFKD les ramène à « trano ahofa ».
    """
    return "".join(
        c for c in unicodedata.normalize("NFKD", t) if unicodedata.category(c) != "Mn"
    ).lower()


# -- Lecture des chiffres affichés par Facebook -----------------------------
def lire_effectif(bloc: str) -> int | None:
    """« 126 K membres » -> 126000 ; « 887 followers » -> 887.

    Facebook abrège au-delà du millier, en français comme en anglais, et pose
    parfois une virgule décimale (« 1,2 K »). Rendre 1 au lieu de 1200 ferait
    passer un gros groupe pour un groupe mort.
    """
    m = re.search(
        r"(\d[\d\s.,]*)\s*([KkMm])?\s*(?:membres?|members?|abonn[ée]s?|followers?|j[’']aime|likes?)",
        bloc,
    )
    if not m:
        return None
    brut = m.group(1).strip().replace(" ", "").replace(" ", "").replace("\xa0", "")
    # « 1,2 » est décimal ; « 1.200 » et « 1,200 » sont des milliers.
    if re.fullmatch(r"\d+[.,]\d", brut):
        valeur = float(brut.replace(",", "."))
    else:
        valeur = float(re.sub(r"[.,]", "", brut) or 0)
    facteur = {"k": 1_000, "m": 1_000_000}.get((m.group(2) or "").lower(), 1)
    return int(valeur * facteur)


def lire_rythme(bloc: str) -> int | None:
    """« Plus de 90 publications par jour » -> 90. Le meilleur signal de rendement."""
    m = re.search(
        r"(\d[\d\s.,]*)\s*(?:publications?|posts?)\s*par\s*(jour|mois|semaine)"
        r"|(\d[\d\s.,]*)\s*(?:publications?|posts?)\s*a\s*day",
        _sans_accents(bloc),
    )
    if not m:
        return None
    nombre = int(re.sub(r"\D", "", m.group(1) or m.group(3) or "0") or 0)
    periode = m.group(2) or "jour"
    return {"jour": nombre, "semaine": nombre // 7, "mois": nombre // 30}.get(periode, nombre)


def est_prive(bloc: str) -> bool:
    return bool(re.search(r"(?<![a-z])(prive|private)(?![a-z])", _sans_accents(bloc)))


# Sous ce nombre de publications croisées, le rendement observé ne veut rien
# dire : une source vue une fois et qui a donné une bonne annonce afficherait
# 100 % de réussite.
OBSERVATIONS_MIN = 3


# -- Note d'une source vue à l'œuvre ---------------------------------------
def en_observation(candidat: dict) -> dict:
    """Une source du fil croisée une ou deux fois : trop tôt pour la juger.

    Lui donner 0/100 la ferait passer pour mauvaise alors qu'on ne sait
    simplement rien d'elle ; lui donner une bonne note serait pire. On dit ce
    qu'il en est, et elle ne compte pas dans le seuil de sélection.
    """
    vues = candidat.get("vues") or 0
    retenues = candidat.get("retenues") or 0
    return {
        "note": None,
        "note_brute": -1,
        "niveau": "observation",
        "observee": True,
        "details": [{"cle": "Observations", "points": vues, "sur": OBSERVATIONS_MIN,
                     "motif": f"{retenues} utile(s) sur {vues} vue(s)"}],
        "alertes": [
            f"Croisée {vues} fois seulement : il en faut {OBSERVATIONS_MIN} "
            "pour que le rendement veuille dire quelque chose."
        ],
    }


def noter_observee(candidat: dict) -> dict:
    """Note fondée sur ce que la source a RÉELLEMENT donné.

    Deux chiffres, et ils ne disent pas la même chose :

    * **le rendement** (retenues / vues) — la source parle-t-elle de notre
      métier ? Un groupe où une publication sur dix nous concerne fera perdre
      neuf lectures à chaque collecte.
    * **le volume** (retenues) — un rendement de 100 % sur trois publications
      n'a pas la valeur d'un rendement de 60 % sur quarante.

    Les publiées comptent double : c'est la seule preuve qu'une annonce est
    allée jusqu'au bout.
    """
    vues = candidat.get("vues") or 0
    retenues = candidat.get("retenues") or 0
    publiees = candidat.get("publiees") or 0
    rendement = retenues / vues if vues else 0

    details, alertes = [], []

    # Rendement (45).
    p = round(45 * min(1.0, rendement / 0.6))     # 60 % de retenues = le plein
    details.append({"cle": "Rendement", "points": p, "sur": 45,
                    "motif": f"{retenues} retenue(s) sur {vues} vue(s)"
                             f" — {rendement * 100:.0f} %"})
    points = p
    if vues >= 6 and rendement < 0.15:
        alertes.append(
            f"Vue {vues} fois, seulement {retenues} publication(s) utile(s) : "
            "cette source ferait perdre du temps à chaque collecte."
        )

    # Volume (25) — échelle continue, sinon trois retenues valent quarante.
    import math

    p = 0 if not retenues else max(4, min(25, round(9 * math.log10(retenues + 1) * 2)))
    details.append({"cle": "Volume", "points": p, "sur": 25,
                    "motif": f"{retenues} annonce(s) utile(s) croisée(s)"})
    points += p

    # Publiées (30) — la preuve, pas la promesse.
    if publiees:
        p = max(8, min(30, 10 + 5 * publiees))
        motif = f"{publiees} déjà publiée(s) sur le site"
    else:
        p, motif = 0, "aucune publiée pour l'instant"
    details.append({"cle": "Publiées", "points": p, "sur": 30, "motif": motif})
    points += p

    if candidat.get("prive"):
        points -= 12
        alertes.append(
            "Groupe privé : le bot ne pourra le parcourir qu'une fois que vous "
            "y aurez été admis. Le bot n'adhère à rien de lui-même."
        )

    brut = points
    points = max(0, min(100, points))
    niveau = ("excellent" if points >= 78 else "bon" if points >= 60
              else "moyen" if points >= 40 else "faible")
    return {"note": points, "note_brute": brut, "niveau": niveau,
            "details": details, "alertes": alertes, "observee": True}


# -- Note ------------------------------------------------------------------
def noter(candidat: dict, requetes: list[str], mots_metier=MOTS_METIER,
          repoussoirs=MOTS_REPOUSSOIRS) -> dict:
    """Note sur 100 + le détail, pour qu'Andry voie POURQUOI.

    Le rythme de publication pèse plus que la taille : mesuré sur les sources
    déjà en place, ce sont les groupes très actifs — pas les plus gros — qui
    remplissent la récolte.
    """
    # Une source vue à l'œuvre se juge sur ce qu'elle a donné, pas sur ce
    # qu'elle promet. Ce chemin l'emporte dès qu'on a assez d'observations —
    # et la règle vit ICI, pas chez l'appelant : sinon la note affichée dans
    # l'interface et celle calculée ailleurs se contredisent.
    vues = candidat.get("vues") or 0
    if vues >= OBSERVATIONS_MIN:
        return noter_observee(candidat)
    if vues and candidat.get("origine") == "fil":
        return en_observation(candidat)

    nom = _sans_accents(candidat.get("nom") or "")
    details, alertes = [], []
    points = 0

    # Rythme (35) — un groupe qui publie est un groupe qui rapporte.
    rythme = candidat.get("rythme_par_jour")
    if rythme is None:
        p, motif = 12, "rythme inconnu"
    elif rythme >= 50:
        p, motif = 35, f"{rythme}+ publications/jour"
    elif rythme >= 15:
        p, motif = 28, f"{rythme} publications/jour"
    elif rythme >= 4:
        p, motif = 18, f"{rythme} publications/jour"
    else:
        p, motif = 5, f"seulement {rythme} publication(s)/jour"
        alertes.append("Groupe peu actif : peu d'annonces à en attendre.")
    points += p
    details.append({"cle": "Rythme", "points": p, "sur": 35, "motif": motif})

    # Taille (25) — échelle continue, et non par paliers : Facebook plafonne
    # l'affichage du rythme à « plus de 90 par jour », si bien que tous les
    # gros groupes se retrouvaient à égalité. La taille est alors le seul
    # départage possible, et 122 000 membres doit passer devant 21 000.
    taille = candidat.get("effectif")
    if not taille:
        p, motif = 8, "effectif inconnu"
    else:
        # log10 : 1 000 -> 8 pts, 10 000 -> 16, 100 000 -> 25.
        import math

        p = max(3, min(25, round(8 * (math.log10(max(taille, 10)) - 2) + 8)))
        mot = "abonnés" if candidat.get("genre") == "page" else "membres"
        motif = f"{taille:,} {mot}".replace(",", " ")
        if taille < 500:
            alertes.append("Très peu de monde : peu d'annonces à en attendre.")
    points += p
    details.append({"cle": "Taille", "points": p, "sur": 25, "motif": motif})

    # Pertinence du nom (30) — le seul rempart contre le hors-sujet.
    touches = [m for m in mots_metier if m in nom]
    if touches:
        p = min(30, 14 + 8 * len(touches))
        motif = "nom : " + ", ".join(touches[:3])
    else:
        p, motif = 0, "aucun mot du métier dans le nom"
        alertes.append("Le nom ne parle pas du métier — à vérifier vous-même.")
    points += p
    details.append({"cle": "Pertinence", "points": p, "sur": 30, "motif": motif})

    # Lieu (10) — tout Madagascar compte ici : Diako couvre l'île entière,
    # et une source de Nosy Be vaut celle de Tana.
    lieu = _sans_accents(
        (candidat.get("lieu") or "") + " " + (candidat.get("nom") or "")
    )
    if re.search(r"madagascar|(?<![a-z])mada(?![a-z])|nosy|antananarivo|tana(?![a-z])"
                 r"|toamasina|tamatave|majunga|mahajanga|diego|antsiranana|tulear"
                 r"|toliara|fianarantsoa|morondava|sainte[- ]marie|boraha", lieu):
        p, motif = 10, "Madagascar"
    else:
        p, motif = 3, "lieu non précisé"
    points += p
    details.append({"cle": "Lieu", "points": p, "sur": 10, "motif": motif})

    # La catégorie affichée par Facebook sous le nom d'une page. Elle tranche
    # là où le nom trompe : « Kotrana ao an-trano » contient « trano » et
    # notait 52, alors que sa catégorie dit « Coach personnel ».
    categorie = _sans_accents(candidat.get("categorie") or "")
    if categorie:
        if any(c in categorie for c in CATEGORIES_BONNES):
            points += 12
            details.append({"cle": "Catégorie", "points": 12, "sur": 12,
                            "motif": candidat["categorie"]})
        elif any(c in categorie for c in CATEGORIES_MAUVAISES):
            points -= 35
            alertes.append(
                f"Catégorie Facebook « {candidat['categorie']} » — sans rapport "
                "avec le métier, malgré le nom."
            )

    # Repoussoirs et accès : des retraits, pas des points.
    gene = [m for m in repoussoirs if m in nom]
    if gene:
        points -= 40
        alertes.append("Hors sujet probable : " + ", ".join(gene[:3]))
    if candidat.get("prive"):
        points -= 12
        alertes.append(
            "Groupe privé : il faut demander à le rejoindre avant que le bot "
            "puisse le lire. C'est à vous de le faire, le bot n'adhère à rien."
        )

    # La note affichée est bornée, mais le classement se fait sur le brut :
    # sinon tous les gros groupes très actifs se tassent à 100 et l'ordre
    # devient arbitraire.
    brut = points
    points = max(0, min(100, points))
    niveau = ("excellent" if points >= 78 else "bon" if points >= 60
              else "moyen" if points >= 40 else "faible")
    return {"note": points, "note_brute": brut, "niveau": niveau,
            "details": details, "alertes": alertes}


# -- Extraction depuis la page de résultats ---------------------------------
JS_RESULTATS = r"""
() => {
  const vus = new Map();
  // Une carte de résultat porte un lien vers le groupe ou la page ; on remonte
  // de quelques niveaux pour récupérer le bloc de texte qui l'accompagne
  // (membres, rythme, catégorie, ville).
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const texteLien = (a.innerText || '').trim();
    if (!texteLien || texteLien.length < 3 || texteLien.length > 90) return;

    let cle = null, genre = null;
    const g = href.match(/\/groups\/([A-Za-z0-9._-]+)/);
    if (g) {
      if (['feed','discover','create','joins','browse','search'].includes(g[1])) return;
      cle = g[1]; genre = 'groupe';
    } else {
      const p = href.match(/^(?:https:\/\/www\.facebook\.com)?\/([A-Za-z0-9.\-]{5,60})\/?(?:\?|$)/);
      if (!p) return;
      if (['profile.php','search','watch','marketplace','groups','events','reel',
           'stories','photo','pages','bookmarks','friends','gaming'].includes(p[1])) return;
      cle = p[1]; genre = 'page';
    }
    let carte = a;
    for (let i = 0; i < 7 && carte.parentElement; i++) carte = carte.parentElement;
    const bloc = (carte.innerText || '').slice(0, 500);
    const ancien = vus.get(cle);
    if (!ancien || bloc.length > ancien.bloc.length) {
      vus.set(cle, {cle, genre, nom: texteLien, bloc});
    }
  });
  return [...vus.values()];
}
"""


def _analyser_resultats(brut: list[dict], genre_attendu: str) -> list[dict]:
    sortie = []
    for r in brut:
        if r["genre"] != genre_attendu:
            continue
        bloc = r["bloc"] or ""
        sortie.append({
            "cle": r["cle"],
            "genre": r["genre"],
            "nom": r["nom"],
            "url": (f"https://www.facebook.com/groups/{r['cle']}"
                    if r["genre"] == "groupe" else f"https://www.facebook.com/{r['cle']}"),
            "effectif": lire_effectif(bloc),
            "rythme_par_jour": lire_rythme(bloc),
            "prive": est_prive(bloc) if r["genre"] == "groupe" else False,
            "lieu": _lieu(bloc),
            "categorie": _categorie(bloc),
        })
    return sortie


def _lieu(bloc: str) -> str:
    m = re.search(r"([A-ZÉÈÀ][\w'’\- ]+,\s*Madagascar)", bloc)
    return m.group(1).strip() if m else ""


def _categorie(bloc: str) -> str:
    """La 2e ligne d'une fiche page : « Agent immobilier », « Mannequinat »…"""
    lignes = [l.strip() for l in (bloc or "").split("\n") if l.strip()]
    if len(lignes) < 2:
        return ""
    m = re.match(r"^([^·]{3,40})·", lignes[1])
    return (m.group(1) if m else lignes[1][:40]).strip()


# -- Parcours ---------------------------------------------------------------
def prospecter(page, requetes: list[str] | None = None, genres=("groupe", "page"),
               par_requete: int = 25, rappel=None, config: dict | None = None) -> list[dict]:
    """Cherche des candidats. `page` est un onglet Playwright déjà connecté.

    Les pauses ne sont pas de la décoration : une recherche toutes les deux
    secondes ressemble à un robot, et c'est le compte d'Andry qui en pâtirait.
    """
    cfg = config or charger()
    requetes = requetes or cfg.get("prospection_requetes") or REQUETES_DEFAUT
    mots = tuple(cfg.get("prospection_mots_metier") or MOTS_METIER)
    repoussoirs = tuple(cfg.get("prospection_repoussoirs") or MOTS_REPOUSSOIRS)

    connus = base.urls_sources()
    ecartes = base.candidats_ecartes()
    trouves: dict[str, dict] = {}

    chemins = {"groupe": "/search/groups/?q=", "page": "/search/pages/?q="}
    total = len(requetes) * len(genres)
    fait = 0

    for requete in requetes:
        for genre in genres:
            fait += 1
            if rappel:
                rappel(fait, total, requete)
            try:
                page.goto(
                    "https://www.facebook.com" + chemins[genre]
                    + re.sub(r"\s+", "%20", requete.strip()),
                    wait_until="domcontentloaded", timeout=45_000,
                )
                page.wait_for_timeout(3_500)
                for _ in range(2):
                    page.mouse.wheel(0, 2_400)
                    page.wait_for_timeout(1_800)
                brut = page.evaluate(JS_RESULTATS)
            except Exception as e:                      # noqa: BLE001
                base.logguer(
                    f"Prospection « {requete} » ({genre}) : {type(e).__name__}.", "erreur"
                )
                continue

            for c in _analyser_resultats(brut, genre)[:par_requete]:
                if c["url"] in connus or c["cle"] in ecartes:
                    continue
                note = noter(c, requetes, mots, repoussoirs)
                c.update(note=note["note"], note_brute=note["note_brute"],
                         niveau=note["niveau"], alertes=note["alertes"],
                         details=note["details"], requete=requete)
                ancien = trouves.get(c["cle"])
                if not ancien or c["note_brute"] > ancien["note_brute"]:
                    trouves[c["cle"]] = c

            time.sleep(4 + (fait % 3))       # respiration entre deux recherches

    return sorted(trouves.values(), key=lambda c: -c["note_brute"])


def enregistrer(candidats: list[dict]) -> int:
    """Range les candidats en base. Renvoie le nombre de nouveaux."""
    neufs = 0
    for c in candidats:
        if base.ajouter_candidat(c):
            neufs += 1
    return neufs
