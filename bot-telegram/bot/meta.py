"""meta.py — les compétences « page Facebook » du bot Di'ako.

Tout ce que le bot sait faire sur la page **Di'ako** (DiakoMDG, 108742855158464,
14 408 abonnés le 20/09/2026) passe par ici, et par l'API Graph uniquement —
jamais par un navigateur, jamais par Business Suite.

Ce module ne réécrit pas `marketing/atelier/` : il en reprend les conventions et
les pièges, mesurés sur cette page même :

  · `marketing/atelier/programmer.py` — l'envoi photo + `attached_media`, la
    RELECTURE obligatoire après envoi, la garde « déjà en file », la fenêtre de
    programmation mesurée (28,4 j acceptés / 29,4 j refusés le 18/09/2026) ;
  · `marketing/atelier/etat_file.py` — `/scheduled_posts` est la seule vérité
    sur la file, et son heure se lit à Tana (UTC+3) ;
  · `marketing/atelier/jeton_page.py` — le jeton de page vit dans
    `~/.diako-secrets/`, il ne s'affiche jamais, et il meurt le jour où la
    session Facebook d'Andry est déconnectée.

🔴 CE QUE L'API REFUSE SUR CETTE PAGE (mesuré le 20/09/2026, lectures réelles) :

  ① `/insights` est MORT : `page_impressions` rend « (#100) The value must be a
     valid insights metric ». Portée, impressions et vues ne sont donc pas
     disponibles — ce module ne les estime JAMAIS, il dit qu'il ne les a pas.
  ② `from` n'est PAS rendu sur les commentaires des personnes (RGPD) ; il l'est
     quand le commentateur est une PAGE (vérifié : « Lamba sy Kolontsaina »).
     Une réponse de notre page porte donc son `from` — c'est ce qui permet de
     savoir si on a déjà répondu. Le journal local sert de seconde garde.
  ③ Aucune autre page n'est lisible : `/{autre}/posts` et même
     `/{autre}?fields=name` rendent « (#10) … requires the 'Page Public Content
     Access' feature ». `veille_page` le dit au lieu d'inventer.

Les cinq compétences qui écrivent sont `publique=True` : `demande_validation`
étant fermée par défaut (rien ne part sans un clic tant que la compétence n'est
pas nommée dans `validation_levee`), Andry confirme chacune dans Telegram.

Aucun secret ici : tout passe par `config.jeton_page()`. Le dépôt est public.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

from . import config
from .competences import Resultat, competence

# ── Les constantes de la page ────────────────────────────────────────────
PAGE = config.PAGE_DIAKO          # 108742855158464 — surtout pas 104126917813219
G = config.GRAPH                  # https://graph.facebook.com/v21.0
TANA = timezone(timedelta(hours=3))

DELAI_LECTURE = 60                # s
DELAI_ENVOI = 120                 # s
DELAI_PHOTO = 300                 # s — une photo de 3 Mo sur une ligne malgache
PAGES_MAX = 20                    # bornes dures : jamais de pagination infinie

MAX_IMAGES = 5                    # au-delà, Facebook coupe l'album sans le dire
IMAGES_OK = {".png", ".jpg", ".jpeg", ".webp"}

# Fenêtre de programmation. Meta documente 10 min → 75 jours ; la MESURE du
# 18/09/2026 sur la série Tsena, avec cette app, dit 28,4 j acceptés et 29,4 j
# refusés. On refuse donc hors de [10 min, 75 j] et on PRÉVIENT au-delà de 28 j.
FENETRE_MIN = timedelta(minutes=10)
FENETRE_MAX = timedelta(days=75)
FENETRE_MESUREE = timedelta(days=28)

# Messagerie : Meta refuse une réponse plus de 24 h après le dernier message
# de la personne (fenêtre standard). On le dit AVANT d'envoyer.
FENETRE_MESSAGE = timedelta(hours=24)

JOURNAL = config.DOSSIER_JOURNAUX / "meta.log"

# Sens HABITUEL des codes Graph — repère de diagnostic, pas une vérité mesurée.
# Le message de Meta, lui, est toujours restitué tel quel.
_SENS: dict[tuple[int | None, int | None], str] = {
    (190, 460): "la session Facebook d'Andry a été déconnectée : refaire un jeton "
                "(python marketing/atelier/jeton_page.py)",
    (190, 463): "jeton expiré : refaire un jeton (marketing/atelier/jeton_page.py)",
    (190, None): "jeton de page invalide ou révoqué",
    (10, 2018278): "hors de la fenêtre de 24 h de la messagerie Meta",
    (10, None): "l'app « Fonenako Publisher 2 » n'a pas la fonctionnalité demandée "
                "(souvent Page Public Content Access, pour lire une AUTRE page)",
    (200, None): "permission manquante sur la page pour ce jeton",
    (100, None): "champ ou paramètre inconnu de Graph (souvent une faute de nom)",
    (4, None): "quota d'appels de l'app atteint",
    (17, None): "quota d'appels de l'utilisateur atteint",
    (32, None): "quota d'appels de la page atteint",
    (613, None): "trop d'appels : débit limité",
    (368, None): "compte ou page temporairement restreint par Facebook",
    (506, None): "publication en double refusée par Facebook",
}


# ── Un seul client HTTP, qui ne lève jamais ──────────────────────────────
def _lire_erreur(r: requests.Response) -> str:
    """Le corps d'erreur de Graph, rendu lisible. JAMAIS un `raise` nu.

    Beaucoup de pannes Meta ne se diagnostiquent QU'au sous-code : 190/460 =
    session déconnectée, 10/2018278 = fenêtre de 24 h, 368 = page restreinte.
    """
    err: dict[str, Any] = {}
    try:
        err = (r.json() or {}).get("error") or {}
    except ValueError:
        err = {}
    if not err:
        return f"HTTP {r.status_code} — réponse illisible : {r.text[:200]}"
    code, sous = err.get("code"), err.get("error_subcode")
    morceaux = [f"HTTP {r.status_code}", f"code {code}" + (f"/{sous}" if sous else "")]
    morceaux.append(err.get("message") or "(sans message)")
    sens = _SENS.get((code, sous)) or _SENS.get((code, None))
    if sens:
        morceaux.append(f"→ {sens}")
    if err.get("fbtrace_id"):
        morceaux.append(f"(fbtrace {err['fbtrace_id']})")
    return " · ".join(morceaux)


def _jeton() -> str:
    return config.jeton_page()


def _get(chemin: str, **params: Any) -> tuple[dict, str]:
    """GET Graph. Rend `(données, erreur lisible)` — l'un des deux est vide."""
    tok = _jeton()
    if not tok:
        return {}, ("aucun jeton de page : " + str(config.JETON_PAGE) + " est vide ou absent "
                    "(le refaire avec marketing/atelier/jeton_page.py)")
    params["access_token"] = tok
    try:
        r = requests.get(f"{G}/{chemin}", params=params, timeout=DELAI_LECTURE)
    except requests.RequestException as e:
        return {}, f"réseau : {type(e).__name__} {e}"
    if not r.ok:
        return {}, _lire_erreur(r)
    try:
        return r.json() or {}, ""
    except ValueError:
        return {}, f"réponse non JSON : {r.text[:200]}"


def _post(chemin: str, donnees: dict | None = None,
          fichier: tuple[str, Any, str] | None = None,
          delai: int = DELAI_ENVOI) -> tuple[dict, str]:
    """POST Graph. Même contrat que `_get`. C'est le SEUL point d'écriture."""
    tok = _jeton()
    if not tok:
        return {}, "aucun jeton de page : rien ne peut être envoyé."
    charge = dict(donnees or {})
    charge["access_token"] = tok
    try:
        r = requests.post(f"{G}/{chemin}", data=charge,
                          files={"source": fichier} if fichier else None, timeout=delai)
    except requests.RequestException as e:
        return {}, f"réseau : {type(e).__name__} {e}"
    if not r.ok:
        return {}, _lire_erreur(r)
    try:
        return r.json() or {}, ""
    except ValueError:
        return {}, f"réponse non JSON : {r.text[:200]}"


def _supprimer(chemin: str) -> tuple[dict, str]:
    tok = _jeton()
    if not tok:
        return {}, "aucun jeton de page : rien ne peut être supprimé."
    try:
        r = requests.delete(f"{G}/{chemin}", params={"access_token": tok}, timeout=DELAI_ENVOI)
    except requests.RequestException as e:
        return {}, f"réseau : {type(e).__name__} {e}"
    if not r.ok:
        return {}, _lire_erreur(r)
    try:
        return r.json() or {}, ""
    except ValueError:
        return {}, f"réponse non JSON : {r.text[:200]}"


def _parcourir(chemin: str, pages_max: int = PAGES_MAX, **params: Any) -> tuple[list[dict], str]:
    """Suit `paging.next` jusqu'au bout, avec une borne DURE sur le nombre de pages.

    ⚠ `next` porte déjà tous les paramètres, jeton compris : les repasser
      dédouble la requête. C'est la convention de programmer.py.
    """
    donnees, erreur = _get(chemin, **params)
    if erreur:
        return [], erreur
    tout = list(donnees.get("data") or [])
    suivant = (donnees.get("paging") or {}).get("next")
    tours = 1
    while suivant and tours < pages_max:
        try:
            r = requests.get(suivant, timeout=DELAI_LECTURE)
        except requests.RequestException as e:
            return tout, f"réseau en pagination : {type(e).__name__} {e}"
        if not r.ok:
            return tout, _lire_erreur(r)
        d = r.json() or {}
        tout += list(d.get("data") or [])
        suivant = (d.get("paging") or {}).get("next")
        tours += 1
    return tout, ""


# ── Le temps : Graph parle UTC, Andry lit Tana ───────────────────────────
def _quand(valeur: Any) -> datetime | None:
    """Une date Graph → un datetime à Tana. Accepte l'horodatage ET l'ISO.

    ⚠ `scheduled_publish_time` revient tantôt en secondes (1792342800), tantôt
      en ISO « …+0000 » — programmer.py s'était déjà fait avoir.
    """
    if valeur in (None, ""):
        return None
    if isinstance(valeur, (int, float)):
        return datetime.fromtimestamp(int(valeur), TANA)
    texte = str(valeur)
    if texte.isdigit():
        return datetime.fromtimestamp(int(texte), TANA)
    try:
        return datetime.fromisoformat(texte.replace("+0000", "+00:00")).astimezone(TANA)
    except ValueError:
        return None


def _fr(quand: datetime | None) -> str:
    return f"{quand:%d/%m à %H:%M}" if quand else "date inconnue"


def _age(quand: datetime | None, depuis: datetime | None = None) -> str:
    """« il y a 3 h », « il y a 12 j » — sans jamais arrondir vers le bas à zéro."""
    if quand is None:
        return "âge inconnu"
    ecart = (depuis or datetime.now(TANA)) - quand
    minutes = int(ecart.total_seconds() // 60)
    futur = minutes < 0
    minutes = abs(minutes)
    if minutes < 60:
        duree = f"{minutes} min"
    elif minutes < 60 * 48:
        duree = f"{minutes // 60} h"
    else:
        duree = f"{minutes // 1440} j"
    return f"dans {duree}" if futur else f"il y a {duree}"


def _entier(valeur: Any, defaut: int, mini: int = 1, maxi: int = 100) -> int:
    """Le modèle passe TOUT en chaîne (« 5 », « cinq », « »). On ne plante pas."""
    try:
        n = int(str(valeur).strip())
    except (TypeError, ValueError):
        return defaut
    return max(mini, min(maxi, n))


def _debut(texte: str | None, n: int = 60) -> str:
    t = " ".join((texte or "").split())
    return (t[: n - 1] + "…") if len(t) > n else (t or "(sans texte)")


# ── Le journal : ce que NOUS avons écrit sur la page ─────────────────────
# ⚠ Un agent sans mémoire ne peut pas respecter « ne réponds jamais deux fois » :
#   il faut que son outil le lui MONTRE. Graph le montre déjà via `from` sur les
#   réponses de page ; ce journal est la seconde garde, et la trace d'audit.
def _journaliser(action: str, charge: dict) -> None:
    try:
        config.DOSSIER_JOURNAUX.mkdir(parents=True, exist_ok=True)
        ligne = json.dumps(
            {"quand": datetime.now(TANA).isoformat(timespec="seconds"), "action": action, **charge},
            ensure_ascii=False,
        )
        with JOURNAL.open("a", encoding="utf-8") as f:
            f.write(ligne + "\n")
    except OSError:
        pass  # un journal qui ne s'écrit pas ne doit pas empêcher l'action


def _deja_traite(action: str, cle: str, valeur: str) -> dict | None:
    """La première ligne du journal où `action` a réussi sur `cle == valeur`."""
    if not JOURNAL.exists():
        return None
    try:
        lignes = JOURNAL.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for ligne in lignes:
        try:
            l = json.loads(ligne)
        except json.JSONDecodeError:
            continue
        if l.get("action") == action and str(l.get(cle)) == str(valeur) and l.get("ok"):
            return l
    return None


# ── Outils partagés ──────────────────────────────────────────────────────
def _sans_jeton(quoi: str) -> Resultat:
    return Resultat(
        texte=(f"Impossible de {quoi} : aucun jeton de page. Le refaire avec "
               "`python marketing/atelier/jeton_page.py`."),
        ok=False, donnees={"cause": "jeton_absent"},
    )


def _etat_jeton() -> dict:
    """`debug_token` du jeton par lui-même — pas besoin du secret de l'app.

    Vérifié le 20/09/2026 : rend `is_valid`, `expires_at` (0 = jamais),
    `data_access_expires_at`, `scopes`, `profile_id`.
    """
    tok = _jeton()
    if not tok:
        return {"valide": False, "motif": "absent"}
    d, err = _get("debug_token", input_token=tok)
    if err:
        return {"valide": False, "motif": err}
    data = d.get("data") or {}
    expire = _quand(data.get("expires_at")) if data.get("expires_at") else None
    acces = _quand(data.get("data_access_expires_at")) if data.get("data_access_expires_at") else None
    return {
        "valide": bool(data.get("is_valid")),
        "expire": expire,
        "acces_donnees": acces,
        "app": data.get("application"),
        "page": str(data.get("profile_id") or ""),
        "permissions": list(data.get("scopes") or []),
    }


def _chemins_images(images: str | None) -> tuple[list[Path], str]:
    """« a.png;b.png » → deux chemins vérifiés. Rend `(chemins, motif de refus)`."""
    texte = (images or "").strip()
    if not texte:
        return [], ""
    bruts = [m.strip().strip('"').strip("'") for m in texte.replace("\n", ";").split(";")]
    bruts = [m for m in bruts if m]
    if len(bruts) == 1 and "," in bruts[0] and not Path(bruts[0]).exists():
        bruts = [m.strip() for m in bruts[0].split(",") if m.strip()]
    if len(bruts) > MAX_IMAGES:
        return [], (f"{len(bruts)} images demandées : Facebook en prend {MAX_IMAGES} au plus "
                    "dans une publication, et coupe l'album sans le dire.")
    chemins: list[Path] = []
    for brut in bruts:
        p = Path(brut).expanduser()
        if not p.is_absolute():
            p = (config.DEPOT / brut).resolve()
        if not p.exists() or not p.is_file():
            return [], f"image introuvable : {brut}"
        if p.suffix.lower() not in IMAGES_OK:
            return [], f"{p.name} n'est pas une image ({', '.join(sorted(IMAGES_OK))})"
        chemins.append(p)
    return chemins, ""


def _televerser(chemin: Path) -> tuple[str, str]:
    """Une photo en attente (non publiée, temporaire) → son identifiant.

    Convention de programmer.py : `published=false` + `temporary=true`, puis
    `attached_media[i]` sur /feed. Une temporaire non utilisée s'efface d'elle-même.
    """
    try:
        with open(chemin, "rb") as fh:
            d, err = _post(f"{PAGE}/photos",
                           donnees={"published": "false", "temporary": "true"},
                           fichier=(chemin.name, fh, "image/png"), delai=DELAI_PHOTO)
    except OSError as e:
        return "", f"lecture de {chemin.name} impossible : {e}"
    if err:
        return "", f"{chemin.name} refusée — {err}"
    pid = str(d.get("id") or "")
    return (pid, "") if pid else ("", f"{chemin.name} : Facebook n'a rendu aucun identifiant")


def _compter_photos(publication: dict) -> int:
    """Le nombre de photos RELUES sur la publication (pas celui qu'on a envoyé).

    ⚠ Un `attached_media` mal formé donne une publication texte seul, acceptée
      sans erreur : seule la relecture le montre (programmer.py, 18/09/2026).
    """
    album = ((publication.get("attachments") or {}).get("data") or [{}])[0]
    sous = ((album.get("subattachments") or {}).get("data")) or []
    if sous:
        return len(sous)
    return 1 if album.get("media_type") in ("photo", "video") else 0


def _engagement(p: dict) -> tuple[int, int, int]:
    """(réactions, commentaires, partages). ⚠ `shares` est ABSENT quand il vaut 0
    — vérifié le 20/09/2026 : 11 publications sur 100 n'ont pas le champ."""
    reac = ((p.get("reactions") or {}).get("summary") or {}).get("total_count") or 0
    comm = ((p.get("comments") or {}).get("summary") or {}).get("total_count") or 0
    part = (p.get("shares") or {}).get("count") or 0
    return int(reac), int(comm), int(part)


CHAMPS_PUBLICATION = (
    "id,message,created_time,permalink_url,status_type,shares,"
    "reactions.summary(true).limit(0),comments.summary(true).limit(0),"
    "attachments{media_type,subattachments{type}}"
)


# ═══════════════════════════════════════════════════════════════════════
#  LECTURE
# ═══════════════════════════════════════════════════════════════════════
@competence(
    "etat_page", "État de la page Di'ako",
    "L'état de la page Facebook Di'ako : abonnés, publications des 7 derniers jours, "
    "file de publications programmées (nombre et prochaine), validité du jeton. "
    "Aucune donnée de portée ni d'impressions : /insights est mort sur cette page.",
    parametres={},
    famille="page",
    exemples=("état de la page", "où en est la page Facebook ?", "le jeton est encore bon ?"),
)
def etat_page() -> Resultat:
    if not _jeton():
        return _sans_jeton("lire l'état de la page")

    page, err = _get(PAGE, fields="id,name,username,followers_count,fan_count,link")
    if err:
        return Resultat(texte=f"Lecture de la page impossible — {err}", ok=False,
                        donnees={"erreur": err})

    maintenant = datetime.now(TANA)
    depuis = int((maintenant - timedelta(days=7)).timestamp())
    recentes, err_r = _parcourir(f"{PAGE}/published_posts", pages_max=3,
                                 fields="id,created_time", since=depuis, limit=100)
    file_fb, err_f = _parcourir(f"{PAGE}/scheduled_posts", pages_max=PAGES_MAX,
                                fields="id,scheduled_publish_time,is_published", limit=100)
    jeton = _etat_jeton()

    abonnes = f"{int(page.get('followers_count') or 0):,}".replace(",", " ")
    lignes = [f"📄 {page.get('name')} (@{page.get('username')}) — {abonnes} abonnés"]

    if err_r:
        lignes.append(f"Publié sur 7 jours : non lu — {err_r}")
    else:
        derniere = max((_quand(p.get("created_time")) for p in recentes), default=None)
        lignes.append(f"Publié sur 7 jours : {len(recentes)} publication(s)"
                      + (f", la dernière {_fr(derniere)} ({_age(derniere, maintenant)})"
                         if derniere else ""))

    prochaine = None
    if err_f:
        lignes.append(f"File programmée : non lue — {err_f}")
    else:
        dates = sorted(d for d in (_quand(p.get("scheduled_publish_time")) for p in file_fb) if d)
        prochaine = dates[0] if dates else None
        lignes.append(
            f"File programmée : {len(file_fb)} publication(s)"
            + (f", la prochaine {_fr(prochaine)} ({_age(prochaine, maintenant)})" if prochaine else "")
            + (f", la dernière {_fr(dates[-1])}" if len(dates) > 1 else "")
        )

    if not jeton.get("valide"):
        lignes.append(f"🔴 Jeton : INVALIDE — {jeton.get('motif')}")
    else:
        bout = "valide, sans date d'expiration" if not jeton.get("expire") \
            else f"valide jusqu'au {jeton['expire']:%d/%m/%Y}"
        acces = jeton.get("acces_donnees")
        if acces:
            bout += (f" ; accès aux données jusqu'au {acces:%d/%m/%Y} "
                     f"({(acces - maintenant).days} j)")
        lignes.append(f"🔑 Jeton : {bout}")
        if str(jeton.get("page") or "") not in ("", PAGE):
            lignes.append(f"🔴 Ce jeton pilote la page {jeton['page']}, pas {PAGE} (Di'ako).")

    lignes.append("Portée, impressions, vues : non rendues — /insights refuse toutes "
                  "les métriques sur cette page. Je ne les estime pas.")

    return Resultat(
        texte="\n".join(lignes),
        donnees={"abonnes": page.get("followers_count"), "publiees_7j": len(recentes),
                 "programmees": len(file_fb),
                 "prochaine": prochaine.isoformat() if prochaine else None,
                 "jeton_valide": jeton.get("valide")},
        suites=[{"texte": "Voir la file", "action": "file_programmee"},
                {"texte": "Publications récentes", "action": "publications_recentes"}],
    )


@competence(
    "file_programmee", "La file de publications programmées",
    "La liste de ce que Facebook a réellement en file sur la page Di'ako : date et heure "
    "à Tana, début du texte, nombre d'images. /scheduled_posts est la seule vérité — "
    "un journal local peut mentir, pas lui.",
    parametres={"nombre": "Combien de publications montrer, de la plus proche à la plus "
                          "lointaine (défaut 15, maximum 100)."},
    famille="page",
    exemples=("la file programmée", "qu'est-ce qui part cette semaine ?"),
)
def file_programmee(nombre: str = "15") -> Resultat:
    if not _jeton():
        return _sans_jeton("lire la file")
    n = _entier(nombre, 15)
    elements, err = _parcourir(
        f"{PAGE}/scheduled_posts", pages_max=PAGES_MAX, limit=100,
        fields="id,message,scheduled_publish_time,is_published,"
               "attachments{media_type,subattachments{type}}")
    if err:
        return Resultat(texte=f"Lecture de la file impossible — {err}", ok=False,
                        donnees={"erreur": err})
    if not elements:
        return Resultat(texte="Rien en file : aucune publication programmée sur la page.",
                        donnees={"programmees": 0})

    rangees = sorted(elements, key=lambda p: (_quand(p.get("scheduled_publish_time"))
                                              or datetime.max.replace(tzinfo=TANA)))
    lignes = [f"🗓 {len(elements)} publication(s) en file. Les {min(n, len(rangees))} prochaines :"]
    detail = []
    for p in rangees[:n]:
        quand = _quand(p.get("scheduled_publish_time"))
        photos = _compter_photos(p)
        texte = p.get("message")
        lignes.append(f"• {_fr(quand)} — {_debut(texte, 52)}"
                      + (f" [{photos} img]" if photos else " [reel ou vidéo]"))
        detail.append({"id": p.get("id"), "quand": quand.isoformat() if quand else None,
                       "images": photos, "debut": _debut(texte, 80)})
    if len(rangees) > n:
        dernier = _quand(rangees[-1].get("scheduled_publish_time"))
        lignes.append(f"… et {len(rangees) - n} autres, jusqu'au {_fr(dernier)}.")
    lignes.append("Heures de Madagascar (UTC+3), telles que Facebook les a enregistrées.")
    return Resultat(texte="\n".join(lignes),
                    donnees={"programmees": len(elements), "liste": detail})


@competence(
    "publications_recentes", "Les dernières publications publiées",
    "Les N dernières publications déjà en ligne sur la page Di'ako, avec leurs réactions, "
    "commentaires et partages. Portée et impressions ne sont PAS disponibles (/insights "
    "est mort sur cette page) : elles ne sont ni rendues ni estimées.",
    parametres={"nombre": "Combien de publications (défaut 5, maximum 25)."},
    famille="page",
    exemples=("les 5 dernières publications", "qu'est-ce qui a marché cette semaine ?"),
)
def publications_recentes(nombre: str = "5") -> Resultat:
    if not _jeton():
        return _sans_jeton("lire les publications")
    n = _entier(nombre, 5, maxi=25)
    d, err = _get(f"{PAGE}/published_posts", fields=CHAMPS_PUBLICATION, limit=n)
    if err:
        return Resultat(texte=f"Lecture des publications impossible — {err}", ok=False,
                        donnees={"erreur": err})
    posts = d.get("data") or []
    if not posts:
        return Resultat(texte="Aucune publication en ligne sur la page.", donnees={"publications": 0})

    lignes, detail, tot_r, tot_c, tot_p = [], [], 0, 0, 0
    for p in posts:
        quand = _quand(p.get("created_time"))
        reac, comm, part = _engagement(p)
        tot_r, tot_c, tot_p = tot_r + reac, tot_c + comm, tot_p + part
        lignes.append(f"• {_fr(quand)} — {reac} réactions, {comm} commentaire(s), "
                      f"{part} partage(s)\n  {_debut(p.get('message'), 70)}")
        detail.append({"id": p.get("id"), "quand": quand.isoformat() if quand else None,
                       "reactions": reac, "commentaires": comm, "partages": part,
                       "lien": p.get("permalink_url"), "format": p.get("status_type")})
    entete = (f"📊 {len(posts)} dernière(s) publication(s) — total {tot_r} réactions, "
              f"{tot_c} commentaire(s), {tot_p} partage(s) :")
    fin = ("Un compteur de partages absent vaut 0 (Facebook omet le champ). "
           "Portée et impressions : indisponibles sur cette page.")
    return Resultat(texte="\n".join([entete, *lignes, fin]),
                    donnees={"publications": len(posts), "liste": detail,
                             "total": {"reactions": tot_r, "commentaires": tot_c, "partages": tot_p}})


@competence(
    "commentaires_recents", "Les commentaires récents",
    "Les commentaires récents sous les publications de la page Di'ako, du plus récent au plus "
    "ancien, avec pour chacun s'il a DÉJÀ une réponse de la page. À lire avant toute réponse : "
    "sans cette vérification, un agent répond deux ou trois fois au même commentaire.",
    parametres={"nombre": "Combien de commentaires montrer (défaut 10, maximum 50).",
                "publications": "Sur combien de publications récentes chercher (défaut 10, "
                                "maximum 25)."},
    famille="page",
    exemples=("les commentaires récents", "à quoi faut-il répondre ?"),
)
def commentaires_recents(nombre: str = "10", publications: str = "10") -> Resultat:
    if not _jeton():
        return _sans_jeton("lire les commentaires")
    n = _entier(nombre, 10, maxi=50)
    n_posts = _entier(publications, 10, maxi=25)

    d, err = _get(f"{PAGE}/published_posts", limit=n_posts,
                  fields="id,message,created_time,permalink_url,"
                         "comments.summary(true).limit(0)")
    if err:
        return Resultat(texte=f"Lecture des publications impossible — {err}", ok=False,
                        donnees={"erreur": err})
    posts = [p for p in (d.get("data") or [])
             if ((p.get("comments") or {}).get("summary") or {}).get("total_count")]
    if not posts:
        return Resultat(texte=f"Aucun commentaire sur les {n_posts} dernières publications.",
                        donnees={"commentaires": 0})

    trouves: list[dict] = []
    soucis: list[str] = []
    for p in posts:
        # ⚠ `comments{...}` IMBRIQUÉ est obligatoire : sans les réponses, rien ne
        #   distingue un commentaire traité d'un commentaire neuf. Sur Fonenako,
        #   cet oubli a produit 7 réponses pour 2 commentaires en 2 jours.
        dc, errc = _get(f"{p['id']}/comments", limit=25, order="reverse_chronological",
                        fields="id,from,message,created_time,like_count,is_hidden,"
                               "comments.limit(15){id,from,message,created_time}")
        if errc:
            soucis.append(f"{p['id']} — {errc}")
            continue
        for c in dc.get("data") or []:
            reponses = ((c.get("comments") or {}).get("data")) or []
            de_la_page = [r for r in reponses
                          if str(((r.get("from") or {}).get("id")) or "") == str(PAGE)]
            journal = _deja_traite("repondre_commentaire", "commentaire_id", c.get("id", ""))
            trouves.append({
                "id": c.get("id"),
                "quand": _quand(c.get("created_time")),
                "auteur": ((c.get("from") or {}).get("name")),
                "texte": c.get("message") or "",
                "publication": p.get("id"),
                "publication_debut": _debut(p.get("message"), 40),
                "lien": p.get("permalink_url"),
                "reponses": len(reponses),
                "repondu_par_la_page": bool(de_la_page) or bool(journal),
                "preuve": ("réponse de la page relue chez Facebook" if de_la_page
                           else ("notre journal : répondu le " + str(journal.get("quand"))) if journal
                           else ""),
                "cache": bool(c.get("is_hidden")),
            })

    trouves.sort(key=lambda c: c["quand"] or datetime.min.replace(tzinfo=TANA), reverse=True)
    retenus = trouves[:n]
    a_traiter = [c for c in retenus if not c["repondu_par_la_page"]]

    lignes = [f"💬 {len(trouves)} commentaire(s) relu(s) sur {len(posts)} publication(s) ; "
              f"{len(a_traiter)} sans réponse de la page parmi les {len(retenus)} plus récents :"]
    for c in retenus:
        marque = "✅ déjà répondu" if c["repondu_par_la_page"] else "🔸 sans réponse"
        auteur = c["auteur"] or "auteur non rendu par Graph"
        lignes.append(f"• {_fr(c['quand'])} · {auteur} · {marque}\n"
                      f"  « {_debut(c['texte'], 70)} »\n"
                      f"  sous « {c['publication_debut']} » — id {c['id']}")
        if c["repondu_par_la_page"] and c["preuve"]:
            lignes.append(f"  ({c['preuve']})")
    lignes.append("Le nom de l'auteur n'est rendu par Graph que lorsque le commentateur est "
                  "une PAGE ; pour une personne, Meta retire le champ. Je ne l'invente pas.")
    if soucis:
        lignes.append("Publications non relues : " + " | ".join(soucis[:3]))

    return Resultat(
        texte="\n".join(lignes),
        donnees={"commentaires": len(trouves), "sans_reponse": len(a_traiter),
                 "liste": [{**c, "quand": c["quand"].isoformat() if c["quand"] else None}
                           for c in retenus]},
        suites=([{"texte": "Répondre au plus récent", "action": "repondre_commentaire"}]
                if a_traiter else []),
    )


@competence(
    "messages_recents", "Les conversations récentes",
    "Les conversations privées récentes de la page Di'ako : interlocuteur, dernier message, "
    "qui a parlé en dernier, messages non lus, et si la fenêtre de 24 h de Meta est encore "
    "ouverte. Hors de cette fenêtre, une réponse sera REFUSÉE par Facebook.",
    parametres={"nombre": "Combien de conversations (défaut 5, maximum 25)."},
    famille="page",
    exemples=("les messages récents", "quelqu'un a écrit à la page ?"),
)
def messages_recents(nombre: str = "5") -> Resultat:
    if not _jeton():
        return _sans_jeton("lire les conversations")
    n = _entier(nombre, 5, maxi=25)
    d, err = _get(f"{PAGE}/conversations", limit=n,
                  fields="id,updated_time,snippet,unread_count,message_count,participants,link,"
                         "messages.limit(10){id,from,message,created_time}")
    if err:
        return Resultat(texte=f"Lecture des conversations impossible — {err}", ok=False,
                        donnees={"erreur": err})
    convs = d.get("data") or []
    if not convs:
        return Resultat(texte="Aucune conversation sur la page.", donnees={"conversations": 0})

    maintenant = datetime.now(TANA)
    lignes, detail, ouvertes = [], [], 0
    for c in convs:
        etat = _etat_conversation(c, maintenant)
        if etat["fenetre_ouverte"]:
            ouvertes += 1
        marque = ("🟢 fenêtre ouverte" if etat["fenetre_ouverte"]
                  else "🔴 fenêtre de 24 h dépassée — une réponse serait refusée")
        non_lus = f" · {c.get('unread_count')} non lu(s)" if c.get("unread_count") else ""
        lignes.append(
            f"• {etat['interlocuteur']} — dernier message {_fr(etat['dernier_quand'])} "
            f"({_age(etat['dernier_quand'], maintenant)}) de {etat['dernier_de']}{non_lus}\n"
            f"  « {_debut(etat['dernier_texte'], 70)} »\n  {marque} — id {c.get('id')}")
        detail.append({"id": c.get("id"), "interlocuteur": etat["interlocuteur"],
                       "psid": etat["psid"], "non_lus": c.get("unread_count"),
                       "messages": c.get("message_count"),
                       "fenetre_ouverte": etat["fenetre_ouverte"],
                       "dernier_entrant": (etat["entrant_quand"].isoformat()
                                           if etat["entrant_quand"] else None)})

    entete = (f"✉️ {len(convs)} conversation(s), {ouvertes} dans la fenêtre de 24 h :")
    fin = ("La fenêtre se compte depuis le DERNIER message de la personne, pas depuis "
           "le nôtre : répondre après 24 h est refusé par Meta.")
    return Resultat(texte="\n".join([entete, *lignes, fin]),
                    donnees={"conversations": len(convs), "fenetre_ouverte": ouvertes,
                             "liste": detail})


def _etat_conversation(conv: dict, maintenant: datetime | None = None) -> dict:
    """Qui parle, quand, et la fenêtre de 24 h — sur une conversation déjà lue."""
    maintenant = maintenant or datetime.now(TANA)
    gens = ((conv.get("participants") or {}).get("data")) or []
    autre = next((g for g in gens if str(g.get("id")) != str(PAGE)), {})
    messages = ((conv.get("messages") or {}).get("data")) or []
    messages = sorted(messages, key=lambda m: str(m.get("created_time") or ""), reverse=True)
    dernier = messages[0] if messages else {}
    entrants = [m for m in messages if str(((m.get("from") or {}).get("id")) or "") != str(PAGE)]
    entrant = entrants[0] if entrants else {}
    entrant_quand = _quand(entrant.get("created_time"))
    return {
        "interlocuteur": autre.get("name") or "interlocuteur inconnu",
        "psid": str(autre.get("id") or ""),
        "dernier_quand": _quand(dernier.get("created_time")) or _quand(conv.get("updated_time")),
        "dernier_de": ((dernier.get("from") or {}).get("name")) or "inconnu",
        "dernier_texte": dernier.get("message") or conv.get("snippet") or "",
        "entrant_quand": entrant_quand,
        "fenetre_ouverte": bool(entrant_quand and maintenant - entrant_quand < FENETRE_MESSAGE),
        "messages_lus": len(messages),
    }


@competence(
    "veille_page", "Ce que publie une page",
    "Ce qu'une page Facebook publie : format des publications, rythme, engagement moyen. "
    "⚠ Mesuré le 20/09/2026 : l'API ne rend AUCUNE autre page que Di'ako avec ce jeton "
    "(code 10, « Page Public Content Access » non accordée à l'app). La compétence le dit "
    "au lieu d'inventer.",
    parametres={"page": "Le nom d'utilisateur (DiakoMDG) ou l'identifiant de la page. "
                        "Vide = la page Di'ako elle-même.",
                "nombre": "Sur combien de publications mesurer (défaut 10, maximum 25)."},
    famille="page",
    exemples=("regarde ce que publie DiakoMDG", "veille sur la page 123456789"),
)
def veille_page(page: str = "", nombre: str = "10") -> Resultat:
    if not _jeton():
        return _sans_jeton("lire une page")
    cible = (page or "").strip().lstrip("@") or PAGE
    n = _entier(nombre, 10, maxi=25)

    profil, err = _get(cible, fields="id,name,username,followers_count,fan_count,link")
    if err:
        return Resultat(
            texte=("Page illisible — " + err + "\n"
                   "Avec ce jeton, l'API Graph ne rend que Di'ako : lire une page tierce "
                   "demande la fonctionnalité « Page Public Content Access », qui n'est pas "
                   "accordée à l'app Fonenako Publisher 2. Pour une page concurrente, passer "
                   f"par le bot de collecte ({config.BOT_COLLECTE}), qui lit Facebook au "
                   "navigateur."),
            ok=False, donnees={"page": cible, "erreur": err})

    d, err2 = _get(f"{profil['id']}/posts", fields=CHAMPS_PUBLICATION, limit=n)
    if err2:
        return Resultat(texte=(f"{profil.get('name')} : {int(profil.get('followers_count') or 0)} "
                               f"abonnés. Ses publications ne sont pas lisibles — {err2}"),
                        ok=False, donnees={"page": cible, "erreur": err2})
    posts = d.get("data") or []
    if not posts:
        return Resultat(texte=f"{profil.get('name')} : aucune publication lisible.",
                        donnees={"page": cible, "publications": 0})

    formats: dict[str, int] = {}
    reac = comm = part = 0
    dates = []
    for p in posts:
        formats[p.get("status_type") or "inconnu"] = formats.get(p.get("status_type") or "inconnu", 0) + 1
        r, c, s = _engagement(p)
        reac, comm, part = reac + r, comm + c, part + s
        q = _quand(p.get("created_time"))
        if q:
            dates.append(q)
    dates.sort()
    rythme = ""
    if len(dates) >= 2:
        jours = max((dates[-1] - dates[0]).total_seconds() / 86400, 1e-9)
        rythme = f"{len(dates) / jours * 7:.1f} publication(s) par semaine " \
                 f"(du {_fr(dates[0])} au {_fr(dates[-1])})"

    lignes = [
        f"🔎 {profil.get('name')} (@{profil.get('username') or profil['id']}) — "
        + f"{int(profil.get('followers_count') or 0):,}".replace(",", " ") + " abonnés",
        f"Sur {len(posts)} publication(s) : "
        + ", ".join(f"{v} {k}" for k, v in sorted(formats.items(), key=lambda kv: -kv[1])),
    ]
    if rythme:
        lignes.append("Rythme : " + rythme)
    lignes.append(f"Engagement moyen : {reac / len(posts):.1f} réactions, "
                  f"{comm / len(posts):.1f} commentaire(s), {part / len(posts):.1f} partage(s) "
                  f"par publication (totaux {reac}/{comm}/{part}).")
    lignes.append("Portée et impressions : non rendues par l'API.")
    return Resultat(texte="\n".join(lignes),
                    donnees={"page": profil.get("id"), "abonnes": profil.get("followers_count"),
                             "publications": len(posts), "formats": formats,
                             "reactions": reac, "commentaires": comm, "partages": part})


# ═══════════════════════════════════════════════════════════════════════
#  ÉCRITURE — tout est publique=True : Andry clique avant que ça parte
# ═══════════════════════════════════════════════════════════════════════
def _envoyer_publication(texte: str, chemins: list[Path],
                         quand: datetime | None) -> tuple[dict, str]:
    """Le chemin d'écriture commun à `publier_page` et `programmer_page`.

    Un seul point de passage : une garde posée ici vaut pour les deux.
    """
    ids: list[str] = []
    for chemin in chemins:
        pid, err = _televerser(chemin)
        if err:
            return {"photos": ids}, err
        ids.append(pid)

    donnees: dict[str, Any] = {"message": texte}
    if quand is None:
        donnees["published"] = "true"
    else:
        donnees["published"] = "false"
        donnees["scheduled_publish_time"] = str(int(quand.timestamp()))
    for i, pid in enumerate(ids):
        donnees[f"attached_media[{i}]"] = json.dumps({"media_fbid": pid})

    reponse, err = _post(f"{PAGE}/feed", donnees=donnees)
    if err:
        return {"photos": ids}, err
    post_id = str(reponse.get("id") or "")
    if not post_id:
        return {"photos": ids}, "Facebook n'a rendu aucun identifiant de publication."

    # RELECTURE — une publication n'est déclarée faite qu'après relecture.
    relu, err_r = _get(post_id, fields="message,created_time,scheduled_publish_time,"
                                       "is_published,permalink_url,"
                                       "attachments{media_type,subattachments{type}}")
    controle = {
        "post_id": post_id, "photos_envoyees": len(ids),
        "photos_relues": _compter_photos(relu) if not err_r else None,
        "texte_identique": (relu.get("message") or "").strip() == texte.strip() if not err_r else None,
        "is_published": relu.get("is_published") if not err_r else None,
        "heure_relue": (_quand(relu.get("scheduled_publish_time")).isoformat()
                        if not err_r and relu.get("scheduled_publish_time") else None),
        "lien": relu.get("permalink_url") if not err_r else None,
        "erreur_relecture": err_r or "",
    }
    if err_r:
        controle["conforme"] = False
        return controle, ""
    conforme = bool(controle["texte_identique"]) and controle["photos_relues"] == len(ids)
    if quand is None:
        conforme = conforme and relu.get("is_published") is not False
    else:
        attendu = int(quand.timestamp())
        lu = _quand(relu.get("scheduled_publish_time"))
        conforme = (conforme and relu.get("is_published") is False
                    and lu is not None and int(lu.timestamp()) == attendu)
    controle["conforme"] = conforme
    return controle, ""


@competence(
    "publier_page", "Publier maintenant sur la page",
    "Publie tout de suite sur la page Facebook Di'ako : un texte et de 0 à 5 images prises "
    "sur le disque. La publication est RELUE après envoi (texte, nombre de photos) — sans "
    "relecture, un attached_media mal formé donne une publication texte seul, acceptée sans "
    "erreur.",
    parametres={"texte": "Le texte exact de la publication, tel qu'il paraîtra.",
                "images": "Les chemins des images, séparés par des points-virgules "
                          "(0 à 5). Vide = publication texte seul."},
    obligatoires=("texte",),
    publique=True,
    famille="page",
    exemples=("publie ce texte avec l'affiche de Masoala",),
)
def publier_page(texte: str, images: str = "") -> Resultat:
    if not _jeton():
        return _sans_jeton("publier")
    texte = (texte or "").strip()
    if not texte:
        return Resultat(texte="Rien à publier : le texte est vide.", ok=False)
    chemins, refus = _chemins_images(images)
    if refus:
        return Resultat(texte=f"Publication refusée avant envoi : {refus}", ok=False,
                        donnees={"cause": "images"})

    _journaliser("publier_page", {"ok": False, "etape": "avant envoi",
                                  "debut": _debut(texte, 80), "images": len(chemins)})
    controle, err = _envoyer_publication(texte, chemins, quand=None)
    if err:
        _journaliser("publier_page", {"ok": False, "erreur": err, "debut": _debut(texte, 80)})
        return Resultat(texte=f"Publication REFUSÉE par Facebook — {err}", ok=False,
                        donnees={"erreur": err, **controle})

    _journaliser("publier_page", {"ok": True, "post_id": controle["post_id"],
                                  "debut": _debut(texte, 80),
                                  "conforme": controle["conforme"]})
    if not controle["conforme"]:
        return Resultat(
            texte=("⚠ Publication ENVOYÉE mais la relecture ne concorde pas — à vérifier à la main.\n"
                   f"id {controle['post_id']} · {controle['photos_relues']} photo(s) relue(s) pour "
                   f"{controle['photos_envoyees']} envoyée(s) · texte identique : "
                   f"{controle['texte_identique']}\n{controle.get('erreur_relecture') or ''}"),
            ok=False, donnees=controle)
    return Resultat(
        texte=(f"✅ Publié sur Di'ako — {controle['photos_relues']} image(s), "
               f"{len(texte)} caractères.\n{controle.get('lien') or controle['post_id']}"),
        donnees=controle,
        suites=[{"texte": "Publications récentes", "action": "publications_recentes"}])


@competence(
    "programmer_page", "Programmer une publication",
    "Programme une publication sur la page Di'ako à une date et une heure de Madagascar. "
    "Facebook exige entre 10 minutes et 75 jours dans le futur. La publication est relue "
    "après envoi (texte, heure, non publiée, nombre de photos) et refusée si un texte "
    "identique est déjà en file.",
    parametres={"texte": "Le texte exact de la publication.",
                "quand": "Date et heure à Tana : « 2026-10-05 18:00 », « 05/10 18:00 » "
                         "ou une date ISO.",
                "images": "Les chemins des images, séparés par des points-virgules (0 à 5)."},
    obligatoires=("texte", "quand"),
    publique=True,
    famille="page",
    exemples=("programme ce post pour le 5 octobre à 18 h",),
)
def programmer_page(texte: str, quand: str, images: str = "") -> Resultat:
    if not _jeton():
        return _sans_jeton("programmer")
    texte = (texte or "").strip()
    if not texte:
        return Resultat(texte="Rien à programmer : le texte est vide.", ok=False)

    moment = _lire_heure(quand)
    if moment is None:
        return Resultat(
            texte=(f"Date incomprise : « {quand} ». Écrire « 2026-10-05 18:00 » "
                   "(heure de Tana)."), ok=False, donnees={"cause": "date"})

    maintenant = datetime.now(TANA)
    ecart = moment - maintenant
    if ecart < FENETRE_MIN:
        return Resultat(
            texte=(f"Refusé : {_fr(moment)} est {_age(moment, maintenant)}. Facebook exige "
                   "au moins 10 minutes d'avance."), ok=False, donnees={"cause": "trop_tot"})
    if ecart > FENETRE_MAX:
        return Resultat(
            texte=(f"Refusé : {_fr(moment)} est dans {ecart.days} jours. Facebook n'accepte "
                   "pas au-delà de 75 jours."), ok=False, donnees={"cause": "trop_tard"})

    chemins, refus = _chemins_images(images)
    if refus:
        return Resultat(texte=f"Programmation refusée avant envoi : {refus}", ok=False,
                        donnees={"cause": "images"})

    # ⚠ La seule vérité sur la file est /scheduled_posts, relue AVANT chaque envoi :
    #   un journal local ne voit pas ce qu'une autre session a programmé.
    file_fb, err_f = _parcourir(f"{PAGE}/scheduled_posts", pages_max=PAGES_MAX, limit=100,
                                fields="id,message,scheduled_publish_time")
    if err_f:
        return Resultat(texte=f"File illisible, je ne programme pas à l'aveugle — {err_f}",
                        ok=False, donnees={"erreur": err_f})
    debuts = {(p.get("message") or "")[:80] for p in file_fb}
    if texte[:80] in debuts:
        return Resultat(
            texte=("Refusé : une publication qui commence exactement pareil est DÉJÀ en file "
                   f"({len(file_fb)} au total). Je ne crée pas de doublon public."),
            ok=False, donnees={"cause": "doublon", "programmees": len(file_fb)})

    avertissement = ""
    if ecart > FENETRE_MESUREE:
        avertissement = ("\n⚠ À {} jours : mesuré le 18/09/2026 avec cette app, 28,4 j passent "
                         "et 29,4 j sont refusés. Un refus ne crée rien.").format(ecart.days)

    _journaliser("programmer_page", {"ok": False, "etape": "avant envoi",
                                     "quand": moment.isoformat(),
                                     "debut": _debut(texte, 80), "images": len(chemins)})
    controle, err = _envoyer_publication(texte, chemins, quand=moment)
    if err:
        _journaliser("programmer_page", {"ok": False, "erreur": err,
                                         "quand": moment.isoformat(), "debut": _debut(texte, 80)})
        return Resultat(texte=f"Programmation REFUSÉE par Facebook — {err}{avertissement}",
                        ok=False, donnees={"erreur": err, **controle})

    _journaliser("programmer_page", {"ok": True, "post_id": controle["post_id"],
                                     "quand": moment.isoformat(),
                                     "debut": _debut(texte, 80),
                                     "conforme": controle["conforme"]})
    if not controle["conforme"]:
        return Resultat(
            texte=("⚠ ENVOYÉE mais la relecture ne concorde pas — à vérifier à la main.\n"
                   f"id {controle['post_id']} · heure relue {controle['heure_relue']} pour "
                   f"{moment.isoformat()} · {controle['photos_relues']} photo(s) pour "
                   f"{controle['photos_envoyees']} · texte identique : "
                   f"{controle['texte_identique']}"),
            ok=False, donnees=controle)
    return Resultat(
        texte=(f"✅ Programmée pour le {_fr(moment)} (heure de Tana, {_age(moment, maintenant)}) — "
               f"{controle['photos_relues']} image(s). Relue conforme chez Facebook."
               f"\nid {controle['post_id']}{avertissement}"),
        donnees=controle,
        suites=[{"texte": "Voir la file", "action": "file_programmee"}])


def _lire_heure(texte: str) -> datetime | None:
    """« 2026-10-05 18:00 », « 05/10/2026 18:00 », « 05/10 18h », ISO → Tana.

    ⚠ Une date sans fuseau est TOUJOURS lue à Tana : Andry écrit son heure, pas
      celle de Facebook. Une date qui porte déjà un fuseau est convertie.
    """
    brut = (texte or "").strip().replace("h", ":").replace("H", ":")
    if not brut:
        return None
    try:
        d = datetime.fromisoformat(brut.replace("Z", "+00:00"))
        return d.astimezone(TANA) if d.tzinfo else d.replace(tzinfo=TANA)
    except ValueError:
        pass
    gabarits = ("%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M", "%Y/%m/%d %H:%M")
    for gabarit in gabarits:
        try:
            return datetime.strptime(brut.rstrip(":"), gabarit).replace(tzinfo=TANA)
        except ValueError:
            continue
    # « 05/10 18:00 » — sans année : l'année en cours, ou la suivante si c'est passé
    for gabarit in ("%d/%m %H:%M", "%d/%m %H"):
        try:
            d = datetime.strptime(brut.rstrip(":"), gabarit)
        except ValueError:
            continue
        maintenant = datetime.now(TANA)
        essai = d.replace(year=maintenant.year, tzinfo=TANA)
        return essai if essai > maintenant else d.replace(year=maintenant.year + 1, tzinfo=TANA)
    return None


@competence(
    "annuler_programmee", "Annuler une publication programmée",
    "Supprime une publication PROGRAMMÉE de la page Di'ako, par son identifiant. Refuse de "
    "toucher à une publication déjà en ligne. L'identifiant se lit avec file_programmee.",
    parametres={"post_id": "L'identifiant de la publication programmée "
                           "(108742855158464_1077946171649402)."},
    obligatoires=("post_id",),
    publique=True,
    famille="page",
    exemples=("annule la publication programmée 108742855158464_1077946171649402",),
)
def annuler_programmee(post_id: str) -> Resultat:
    if not _jeton():
        return _sans_jeton("annuler")
    post_id = (post_id or "").strip()

    avant, err = _get(post_id, fields="id,message,created_time,scheduled_publish_time,is_published")
    if err:
        return Resultat(texte=f"Publication introuvable ou illisible — {err}", ok=False,
                        donnees={"erreur": err, "post_id": post_id})
    if avant.get("is_published") is True:
        return Resultat(
            texte=("Refusé : cette publication est DÉJÀ EN LIGNE, ce n'est pas une programmée. "
                   "La supprimer retirerait un contenu public et ses réactions. "
                   f"« {_debut(avant.get('message'), 60)} » du {_fr(_quand(avant.get('created_time')))}."),
            ok=False, donnees={"cause": "deja_publiee", "post_id": post_id})

    quand = _quand(avant.get("scheduled_publish_time"))
    _journaliser("annuler_programmee", {"ok": False, "etape": "avant suppression",
                                        "post_id": post_id, "debut": _debut(avant.get("message"), 80)})
    reponse, err = _supprimer(post_id)
    if err:
        _journaliser("annuler_programmee", {"ok": False, "post_id": post_id, "erreur": err})
        return Resultat(texte=f"Suppression REFUSÉE par Facebook — {err}", ok=False,
                        donnees={"erreur": err, "post_id": post_id})

    # Relecture : une suppression qui « réussit » sans rien supprimer est arrivée.
    apres, err_a = _get(post_id, fields="id,is_published")
    partie = bool(err_a) or not apres.get("id")
    _journaliser("annuler_programmee", {"ok": partie, "post_id": post_id,
                                        "quand": quand.isoformat() if quand else None})
    if not partie:
        return Resultat(
            texte=("⚠ Facebook a accepté la suppression, mais la publication se relit encore "
                   f"(id {post_id}). À vérifier dans la file."), ok=False,
            donnees={"post_id": post_id, "reponse": reponse})
    return Resultat(
        texte=(f"🗑 Publication du {_fr(quand)} annulée : « {_debut(avant.get('message'), 60)} ». "
               "Elle ne se relit plus chez Facebook."),
        donnees={"post_id": post_id, "quand": quand.isoformat() if quand else None},
        suites=[{"texte": "Voir la file", "action": "file_programmee"}])


@competence(
    "repondre_commentaire", "Répondre à un commentaire",
    "Publie une réponse sous un commentaire précis de la page Di'ako. Refuse si la page a "
    "déjà répondu à ce commentaire — c'est la garde qui manquait à Fonenako, où la page a "
    "répondu 7 fois à 2 commentaires en 2 jours.",
    parametres={"commentaire_id": "L'identifiant du commentaire (rendu par commentaires_recents).",
                "texte": "La réponse, telle qu'elle paraîtra sous le commentaire."},
    obligatoires=("commentaire_id", "texte"),
    publique=True,
    famille="page",
    exemples=("réponds à ce commentaire : Misaotra tompoko !",),
)
def repondre_commentaire(commentaire_id: str, texte: str) -> Resultat:
    if not _jeton():
        return _sans_jeton("répondre")
    commentaire_id = (commentaire_id or "").strip()
    texte = (texte or "").strip()
    if not texte:
        return Resultat(texte="Rien à envoyer : la réponse est vide.", ok=False)

    # ① Ce que Facebook sait : les réponses déjà sous ce commentaire.
    com, err = _get(commentaire_id,
                    fields="id,message,created_time,from,"
                           "comments.limit(25){id,from,message,created_time}")
    if err:
        return Resultat(texte=f"Commentaire introuvable ou illisible — {err}", ok=False,
                        donnees={"erreur": err, "commentaire_id": commentaire_id})
    reponses = ((com.get("comments") or {}).get("data")) or []
    de_la_page = [r for r in reponses
                  if str(((r.get("from") or {}).get("id")) or "") == str(PAGE)]
    if de_la_page:
        deja = de_la_page[0]
        return Resultat(
            texte=("Refusé : la page a DÉJÀ répondu à ce commentaire "
                   f"{_fr(_quand(deja.get('created_time')))} — « {_debut(deja.get('message'), 70)} ». "
                   "Je ne réponds pas deux fois."),
            ok=False, donnees={"cause": "deja_repondu", "reponse_existante": deja.get("id")})

    # ② Ce que NOUS savons : le journal. Deuxième garde, pour le cas où `from`
    #    manquerait sur notre propre réponse.
    journal = _deja_traite("repondre_commentaire", "commentaire_id", commentaire_id)
    if journal:
        return Resultat(
            texte=(f"Refusé : notre journal dit qu'on a déjà répondu à ce commentaire le "
                   f"{journal.get('quand')} (« {journal.get('debut')} »). Je ne réponds pas deux fois."),
            ok=False, donnees={"cause": "deja_repondu_journal", "journal": journal})

    _journaliser("repondre_commentaire", {"ok": False, "etape": "avant envoi",
                                          "commentaire_id": commentaire_id,
                                          "debut": _debut(texte, 80)})
    reponse, err = _post(f"{commentaire_id}/comments", donnees={"message": texte})
    if err:
        _journaliser("repondre_commentaire", {"ok": False, "commentaire_id": commentaire_id,
                                              "erreur": err})
        return Resultat(texte=f"Réponse REFUSÉE par Facebook — {err}", ok=False,
                        donnees={"erreur": err, "commentaire_id": commentaire_id})
    nouvel_id = str(reponse.get("id") or "")
    _journaliser("repondre_commentaire", {"ok": True, "commentaire_id": commentaire_id,
                                          "reponse_id": nouvel_id, "debut": _debut(texte, 80)})

    relu, err_r = _get(nouvel_id, fields="id,message,created_time") if nouvel_id else ({}, "")
    conforme = (not err_r) and (relu.get("message") or "").strip() == texte
    return Resultat(
        texte=(f"✅ Réponse publiée sous le commentaire (id {nouvel_id})."
               if conforme else
               f"⚠ Réponse envoyée (id {nouvel_id}) mais la relecture ne concorde pas : "
               f"{err_r or 'texte différent'}. À vérifier."),
        ok=conforme,
        donnees={"commentaire_id": commentaire_id, "reponse_id": nouvel_id, "conforme": conforme})


@competence(
    "repondre_message", "Répondre dans une conversation",
    "Envoie un message dans une conversation privée de la page Di'ako. Vérifie AVANT d'envoyer "
    "que la fenêtre de 24 h de Meta est encore ouverte : au-delà, Facebook refuse et la "
    "personne ne reçoit rien.",
    parametres={"conversation_id": "L'identifiant de la conversation (t_1435691948462819) ou "
                                   "l'identifiant de la personne (PSID), rendus par messages_recents.",
                "texte": "Le message à envoyer, tel quel."},
    obligatoires=("conversation_id", "texte"),
    publique=True,
    famille="page",
    exemples=("réponds à Jed : Salama, azafady…",),
)
def repondre_message(conversation_id: str, texte: str) -> Resultat:
    if not _jeton():
        return _sans_jeton("répondre")
    cle = (conversation_id or "").strip()
    texte = (texte or "").strip()
    if not texte:
        return Resultat(texte="Rien à envoyer : le message est vide.", ok=False)

    psid, etat = cle, None
    if cle.startswith("t_"):
        conv, err = _get(cle, fields="id,updated_time,snippet,participants,"
                                     "messages.limit(10){id,from,message,created_time}")
        if err:
            return Resultat(texte=f"Conversation introuvable ou illisible — {err}", ok=False,
                            donnees={"erreur": err, "conversation_id": cle})
        etat = _etat_conversation(conv)
        psid = etat["psid"]
        if not psid:
            return Resultat(texte="Je ne trouve pas l'interlocuteur dans cette conversation.",
                            ok=False, donnees={"conversation_id": cle})
        if not etat["fenetre_ouverte"]:
            return Resultat(
                texte=("Refusé AVANT envoi : le dernier message de "
                       f"{etat['interlocuteur']} date {_fr(etat['entrant_quand'])} "
                       f"({_age(etat['entrant_quand'])}). La fenêtre de 24 h de Meta est "
                       "fermée — Facebook refuserait le message et la personne ne recevrait "
                       "rien. Il faut qu'elle réécrive."),
                ok=False, donnees={"cause": "fenetre_fermee",
                                   "dernier_entrant": (etat["entrant_quand"].isoformat()
                                                       if etat["entrant_quand"] else None)})
    else:
        # Un PSID nu : on ne peut pas dater le dernier message entrant. On le DIT.
        etat = {"interlocuteur": psid, "fenetre_ouverte": None}

    _journaliser("repondre_message", {"ok": False, "etape": "avant envoi",
                                      "conversation_id": cle, "psid": psid,
                                      "debut": _debut(texte, 80)})
    reponse, err = _post(f"{PAGE}/messages", donnees={
        "recipient": json.dumps({"id": psid}),
        "messaging_type": "RESPONSE",
        "message": json.dumps({"text": texte}),
    })
    if err:
        _journaliser("repondre_message", {"ok": False, "conversation_id": cle, "erreur": err})
        return Resultat(texte=f"Message REFUSÉ par Facebook — {err}", ok=False,
                        donnees={"erreur": err, "conversation_id": cle, "psid": psid})
    _journaliser("repondre_message", {"ok": True, "conversation_id": cle, "psid": psid,
                                      "message_id": reponse.get("message_id"),
                                      "debut": _debut(texte, 80)})
    prudence = ("" if etat.get("fenetre_ouverte") else
                "\n(Envoyé à un PSID nu : je n'ai pas pu vérifier la fenêtre de 24 h avant.)")
    return Resultat(
        texte=(f"✅ Message envoyé à {etat.get('interlocuteur')} "
               f"({len(texte)} caractères).{prudence}"),
        donnees={"conversation_id": cle, "psid": psid,
                 "message_id": reponse.get("message_id")})


# ── Un contrôle à la main, en LECTURE SEULE ──────────────────────────────
if __name__ == "__main__":  # pragma: no cover
    import sys

    # ⚠ Console cp1252 sur ce PC : un emoji dans un print() tue le script.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for appel in (etat_page, file_programmee, publications_recentes,
                  commentaires_recents, messages_recents):
        r = appel()
        print(f"\n===== {appel.__name__} (ok={r.ok}) =====\n{r.texte}")
