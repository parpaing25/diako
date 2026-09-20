"""Trouver une photo tout seul — le bot ne demande plus de chemin de fichier.

🔴 CE MODULE EXISTE À CAUSE D'UN ÉCHANGE RÉEL. Le 20/09/2026, à « fais une
   publication photo belle de Nosy Be pour souhaiter une bonne dimanche », le
   bot a répondu « Je n'ai pas de chemin d'image à utiliser. Quel(s)
   fichier(s) photo(s) veux-tu joindre ? ». Demander un chemin de fichier à
   quelqu'un qui écrit depuis son téléphone, c'est lui rendre le travail.

Deux gisements, dans cet ordre :

  ① **Notre propre base.** 193 fiches, 300 sites et 225 lieux portent une
     couverture déjà hébergée sur o2switch, avec son auteur et sa licence.
     C'est gratuit, instantané, et c'est la photo que le site montre déjà.
     ⚠ On écarte les « Publication Facebook — reprise avec attribution » :
       ce n'est pas une licence, et ces images ne montrent souvent pas le lieu
       (une chambre d'hôtel pour Nosy Volana, mesuré le 19/09/2026).

  ② **Wikimedia Commons**, par `marketing/atelier/commons.py` — qui lit
     l'auteur et la licence dans `extmetadata` et refuse tout ce qui n'est pas
     libre. Une photo sans crédit lisible n'est jamais retenue : elle partirait
     sur une page de 14 000 abonnés avec un crédit deviné, donc faux.

Ce que le bot rend est toujours un fichier LOCAL + son crédit : c'est ce
qu'attend `atelier.preparer_publication`, et c'est ce qui s'affiche dans
Telegram pour être jugé à l'œil avant publication.
"""
from __future__ import annotations

import importlib.util
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from . import config
from .competences import Resultat, competence
from .site import _sql

DOSSIER = config.DOSSIER_DONNEES / "photos"
LARGEUR_MINI = 1200          # en dessous, l'affiche 1080 px serait floue
# Ce qui part sur la page est une PHOTO, pas un fond d'affiche : elle se
# regarde en plein ecran sur un telephone recent. Mesure du 20/09/2026 : notre
# copie de site du parc Masoala fait 648x1152, son original Wikimedia
# 4224x3168. Le plancher ci-dessous vaut pour TOUS les chemins, y compris nos
# propres couvertures — c'est precisement celui qui manquait.
LARGEUR_HD = 1600
UA = {"User-Agent": "DiakoBot/1.0 (https://diako.fonenako.mg; contact.diako@gmail.com)"}
PAS_UNE_LICENCE = "publication facebook"


def _commons():
    """Le module de l'atelier, chargé par son chemin (ce n'est pas un paquet).

    ⚠ Il est sûr à l'import : `sys.argv` n'y est lu que dans son `main()`.
    """
    chemin = config.ATELIER / "commons.py"
    if not chemin.exists():
        return None
    spec = importlib.util.spec_from_file_location("atelier_commons", chemin)
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("atelier_commons", module)
    spec.loader.exec_module(module)
    return module


def _norme(texte: str) -> str:
    sans = unicodedata.normalize("NFKD", texte or "")
    return "".join(c for c in sans if not unicodedata.combining(c)).lower().strip()


def _apostrophes(texte: str) -> str:
    return (texte or "").replace("'", "''")


# ── ① Notre base ──────────────────────────────────────────────────────────
def _depuis_base(sujet: str) -> list[dict]:
    """Les couvertures créditées de nos lieux, sites et fiches qui parlent du sujet."""
    motif = _apostrophes(_norme(sujet))
    if not motif:
        return []
    requete = f"""
      select genre, slug, nom, url, credit, licence, source from (
        select 'lieu' as genre, slug, name_fr as nom, cover_url as url,
               coalesce(cover_credit,'') as credit, coalesce(cover_licence,'') as licence,
               coalesce(cover_source,'') as source, is_touristique as prio
          from places
         where cover_url is not null and cover_url <> ''
           and unaccent(lower(name_fr)) like '%{motif}%'
        union all
        select 'site', slug, name, cover_url, coalesce(cover_credit,''), coalesce(cover_licence,''),
               coalesce(cover_source,''), true
          from attractions
         where is_published and cover_url is not null and cover_url <> ''
           and unaccent(lower(name)) like '%{motif}%'
      ) t
      where licence <> '' and lower(licence) not like '{PAS_UNE_LICENCE}%'
        and credit <> ''
      order by prio desc nulls last, genre, nom
      limit 8
    """
    try:
        return _sql(requete)
    except Exception:
        return []   # la base ne doit jamais empêcher de chercher ailleurs


# ── ② Wikimedia Commons ───────────────────────────────────────────────────
def _depuis_commons(sujet: str, combien: int = 8) -> list[dict]:
    module = _commons()
    if module is None:
        return []
    requetes = [f"{sujet} Madagascar", sujet]
    vus: dict[str, dict] = {}
    for question in requetes:
        try:
            r = module.api({"action": "query", "list": "search", "srsearch": question,
                            "srnamespace": 6, "srlimit": 20})
            titres = [x["title"] for x in r["query"]["search"]
                      if re.search(r"(?i)\.(jpe?g)$", x["title"])]
            for debut in range(0, len(titres), 20):
                for f in module.infos(titres[debut:debut + 20]):
                    if not f.get("libre") or not f.get("auteur"):
                        continue
                    if (f.get("largeur") or 0) < LARGEUR_MINI:
                        continue
                    vus.setdefault(f["titre"], {
                        "genre": "commons", "nom": f["titre"][5:].rsplit(".", 1)[0],
                        "url": f["url"], "credit": f["auteur"], "licence": f["licence"],
                        "source": f["source"], "largeur": f.get("largeur"),
                    })
        except Exception:
            continue
        if len(vus) >= combien:
            break
    return sorted(vus.values(), key=lambda c: -(c.get("largeur") or 0))[:combien]


# ── Remonter à l'ORIGINAL quand nous n'avons qu'une vignette ──────────────
def _titre_commons(source: str) -> str:
    """« …/wiki/File:Masoala,_Madagascar.jpg » -> « File:Masoala,_Madagascar.jpg »."""
    m = re.search(r"/wiki/(File:[^?#]+)", source or "")
    return urllib.parse.unquote(m.group(1)) if m else ""


def _original(candidat: dict) -> dict:
    """Remplace l'URL d'une couverture par celle de l'ORIGINAL Wikimedia.

    Nos couvertures sont des copies REDIMENSIONNÉES hébergées sur o2switch —
    c'est ce que le site affiche, et c'est très bien pour le site. Mais
    publier cela sur une page de 14 409 abonnés donne une photo molle. La
    colonne `cover_source` porte la page Wikimedia du fichier : on y reprend
    la même photo, le même auteur, la même licence, en pleine résolution.
    Si la résolution ne se lit pas, on garde ce qu'on avait : une photo un
    peu petite vaut mieux que pas de photo.
    """
    titre = _titre_commons(candidat.get("source") or "")
    if not titre:
        return candidat
    module = _commons()
    if module is None:
        return candidat
    try:
        infos = module.infos([titre])
    except Exception:
        return candidat
    for f in infos:
        if not f.get("url") or not (f.get("largeur") or 0):
            continue
        return {**candidat, "url": f["url"], "largeur": f.get("largeur"),
                "hauteur": f.get("hauteur"), "origine": "original wikimedia",
                "credit": candidat.get("credit") or f.get("auteur") or "",
                "licence": candidat.get("licence") or f.get("licence") or ""}
    return candidat


# ── Le téléchargement ─────────────────────────────────────────────────────
def telecharger(candidat: dict) -> Path | None:
    """Range la photo dans data/photos et rend son chemin (ou None)."""
    url = candidat.get("url") or ""
    if not url:
        return None
    DOSSIER.mkdir(parents=True, exist_ok=True)
    nom = re.sub(r"[^A-Za-z0-9._-]+", "-", _norme(candidat.get("nom") or "photo"))[:60]
    extension = ".jpg" if not url.lower().endswith(".png") else ".png"
    chemin = DOSSIER / f"{nom}{extension}"
    try:
        requete = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(requete, timeout=90) as reponse, chemin.open("wb") as f:
            f.write(reponse.read())
    except Exception:
        return None
    if chemin.stat().st_size < 20_000:      # une image de 20 Ko n'est pas une photo
        chemin.unlink(missing_ok=True)
        return None
    # ON MESURE, on ne suppose pas. Le poids ne dit rien de la définition :
    # notre copie de Marojejy fait 148 Ko pour 1280x857, celle d'Ankarana
    # 862 Ko pour 1200x1600. Seuls les pixels comptent.
    try:
        from PIL import Image
        with Image.open(chemin) as im:
            largeur, hauteur = im.size
    except Exception:
        return chemin                       # illisible ici, pas forcément mauvaise
    candidat["largeur"], candidat["hauteur"] = largeur, hauteur
    if max(largeur, hauteur) < LARGEUR_HD:
        chemin.unlink(missing_ok=True)
        return None
    return chemin


def candidats(sujet: str, combien: int = 6) -> list[dict]:
    """Les photos possibles, chacune ramenée à sa PLUS GRANDE version connue.

    Nos couvertures viennent en premier — ce sont les photos que le site
    montre déjà, choisies pour le lieu. Mais chacune passe par `_original`,
    qui remonte à la version Wikimedia pleine résolution : même photo, même
    crédit, sans le redimensionnement d'o2switch.
    """
    trouves = [_original(c) for c in _depuis_base(sujet)]
    if len(trouves) < combien:
        trouves += _depuis_commons(sujet, combien - len(trouves))
    return trouves[:combien]


# ── De quoi parle la demande : les pistes de recherche ────────────────────
# 🔴 ON CHERCHAIT LA PHOTO AVEC LE TITRE DE LA PUBLICATION. « Bon dimanche
#    depuis Nosy Be » ne désigne aucun lieu : ni la base ni Commons ne rendaient
#    rien, et la publication partait sans photo (20/09/2026). On extrait donc
#    les noms propres — « Nosy Be » — et on essaie plusieurs pistes.
MOTS_COURANTS = {
    "bon", "bonne", "bons", "bonnes", "beau", "belle", "belles", "joli", "jolie",
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout",
    "septembre", "octobre", "novembre", "decembre",
    "publication", "post", "photo", "photos", "image", "affiche", "vacances",
    "voyage", "diako", "madagascar", "depuis", "pour", "avec", "dans", "chez",
    "notre", "votre", "cette", "aujourd", "hui", "semaine", "week", "end",
}


def _pistes(texte: str) -> list[str]:
    """Les recherches à tenter, de la plus précise à la plus large."""
    brut = (texte or "").strip()
    pistes: list[str] = []

    def ajouter(piste: str) -> None:
        piste = piste.strip(" ,.;:!?-—'\u2019")
        if not piste or len(piste) < 3:
            return
        if _norme(piste) in MOTS_COURANTS:
            return
        if piste not in pistes:
            pistes.append(piste)

    # ① Les suites de mots capitalisés : « Nosy Be », « Tsingy Rouge », « Anja ».
    for suite in re.findall(r"(?:[A-ZÀ-Ý][\w\u2019'-]*\s*){1,3}", brut):
        mots = [m for m in suite.split() if _norme(m) not in MOTS_COURANTS]
        if mots:
            ajouter(" ".join(mots))
    # ② La demande entière (utile quand elle EST le nom du lieu).
    ajouter(brut)
    # ③ Les mots longs restants, en dernier recours.
    for mot in re.findall(r"[\w\u2019'-]{4,}", brut):
        ajouter(mot)
    return pistes[:6]

def photo_pour(sujet: str) -> dict | None:
    """La meilleure photo pour un sujet, téléchargée. `None` si rien de licite.

    C'est la fonction qu'appelle `preparer_publication` quand Andry n'a donné
    aucune photo — il ne doit jamais avoir à taper un chemin de fichier.
    """
    for piste in _pistes(sujet):
        retenues = []
        for candidat in candidats(piste, 4):
            chemin = telecharger(candidat)      # mesure et refuse sous LARGEUR_HD
            if chemin:
                retenues.append({**candidat, "chemin": str(chemin), "piste": piste})
        if not retenues:
            continue
        # NOTRE photo d'abord, en pleine résolution — pas la plus grande.
        # Nos couvertures ont été choisies pour le lieu, une par une, et c'est
        # ce que le site montre. Mesuré le 20/09/2026 sur Ankarana : la nôtre
        # est une vraie photo des tsingy (3000x4000), et une candidate Commons
        # créditée « NASA Johnson Space Center » fait 8256x5504 — le plus gros
        # fichier aurait remplacé le parc par une vue satellite.
        notres = [c for c in retenues if c.get("genre") != "commons"]
        lot = notres or retenues
        return max(lot, key=lambda c: (c.get("largeur") or 0))
    return None


def ligne_photo(photo: dict) -> str:
    """La photo au format attendu par `preparer_publication` : chemin | auteur | licence | source."""
    return " | ".join([photo["chemin"], photo.get("credit", ""),
                       photo.get("licence", ""), photo.get("source", "")])


@competence(
    nom="chercher_photo",
    titre="Chercher une photo libre",
    description=("Trouve des photos LIBRES d'un lieu ou d'un sujet — d'abord dans la base "
                 "Diako (couvertures déjà créditées), sinon sur Wikimedia Commons — les "
                 "télécharge et les montre avec leur auteur et leur licence."),
    parametres={"sujet": "le lieu ou le thème, ex. « Nosy Be », « baobabs », « lémurien »",
                "combien": "nombre de photos à montrer (3 par défaut, 5 au plus)"},
    obligatoires=("sujet",),
    famille="marketing",
    exemples=("trouve-moi une belle photo de Nosy Be",
              "des photos libres des tsingy"),
)
def chercher_photo(sujet: str, combien: str = "3") -> Resultat:
    try:
        n = max(1, min(5, int(str(combien).strip() or 3)))
    except (TypeError, ValueError):
        n = 3
    trouves = candidats(sujet, max(n, 4))
    if not trouves:
        return Resultat(
            texte=(f"Aucune photo LIBRE trouvée pour « {sujet} ».\n"
                   "Je ne prends une photo que si son auteur et sa licence sont lisibles : "
                   "un crédit deviné est un crédit faux. Donne-moi un autre mot "
                   "(le nom du parc, de l'île, de l'animal), ou envoie-moi ta photo."),
            ok=False,
        )
    images, lignes = [], []
    for candidat in trouves:
        if len(images) >= n:
            break
        chemin = telecharger(candidat)
        if not chemin:
            continue
        images.append(chemin)
        origine = {"lieu": "notre base (lieu)", "site": "notre base (site)",
                   "commons": "Wikimedia Commons"}.get(candidat["genre"], candidat["genre"])
        lignes.append(f"· {candidat['nom']}\n   {candidat['credit']} · {candidat['licence']} "
                      f"· {origine}")
    if not images:
        return Resultat(texte=f"Des photos existent pour « {sujet} », mais aucune n'a pu être "
                              f"téléchargée (réseau ?). Réessaie dans un moment.", ok=False)
    return Resultat(
        texte=(f"{len(images)} photo(s) libre(s) pour « {sujet} » :\n\n" + "\n".join(lignes)
               + "\n\nDis-moi laquelle tu veux, ou demande-moi directement la publication : "
                 "je prends la première."),
        images=images,
        donnees={"photos": [{k: v for k, v in c.items() if k != "largeur"} for c in trouves[:n]]},
    )
