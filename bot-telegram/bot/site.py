"""Les compétences « site web et base » du bot Telegram Di'ako.

Ce module répond à cinq questions de lecture (le site répond-il, que contient
la base, où est telle fiche, qu'est-ce qui casse chez les visiteurs, le projet
Supabase est-il debout) et exécute quatre gestes d'écriture (déployer, envoyer
une image, masquer une publication, publier ou dépublier une fiche).

Il ne réécrit rien de ce qui existe :

  · le SQL passe par l'API Management, **comme `bot-diako/bot/diako.py`**
    (fonction `executer_sql`, ligne 165) — la fonction d'appel est recopiée
    ici, minimale, pour n'avoir aucun `sys.path` vers un autre bot ;
  · le déploiement est `~/.deploy-sites/redeploy.sh diako`, qui construit,
    envoie et **vérifie le hash en ligne** ; on l'appelle, on ne le refait pas ;
  · l'envoi d'image est celui du site (`src/lib/o2switchUpload.ts`, 5ffab1a).

🔴 TROIS PIÈGES PAYÉS AILLEURS, ET LEUR PARADE ICI.

  ① **Le multipart est refusé en 406 sur ce domaine.** Mesuré le 19/09/2026 :
     TOUTE requête multipart portant un fichier vers diako.fonenako.mg — même
     un texte de 7 octets, même une image de 8 × 8 — reçoit un 406 du pare-feu
     de l'hébergeur, avec `index.html` pour corps, avant même d'atteindre PHP.
     Le mode **JSON base64** passe. `envoyer_image_site` n'a donc AUCUN repli
     multipart : un repli qui ne peut pas marcher ne fait que doubler le temps
     d'envoi. (`docs/A-APPLIQUER.md`, section du 19/09/2026.)

  ② **Un UPDATE sur `pages` est annulé EN SILENCE sans préambule admin.** Le
     déclencheur `trg_pages_avant` appelle `pages_avant_ecriture`, qui remet
     `is_published` à son ancienne valeur quand `public.is_admin()` est faux —
     sans erreur, sans message. Résultat mesuré le 02/09/2026 : 0 fiche publiée
     sur 333 créées, alors que le bot annonçait « Publiée sur Diako ». D'où le
     `set_config('request.jwt.claims', …)` en tête du lot, le garde qui lève
     une exception si `is_admin()` reste faux, ET la relecture du `returning`,
     qui seul prouve ce qui a été écrit.

  ③ **Une mesure du site faite sans navigateur crédible mesure la page de
     blocage.** o2switch sert un 429 (« le tigre ») aux clients HTTP nus. On
     pose donc un agent utilisateur réaliste et on refuse de conclure quand le
     code n'est pas 200 ou que le corps ressemble à la page de blocage.

⚠ AUCUN CHIFFRE N'EST REPRIS D'UN DOCUMENT. `docs/A-APPLIQUER.md` donne des
  totaux datés du 19/09 ; ils ne servent qu'à savoir quoi compter. Tout ce que
  ce module affiche sort d'un SELECT lancé à l'instant.

⚠ AUCUN SECRET ICI. Le dépôt est public : jeton Supabase et clé d'envoi
  d'images sont lus à l'exécution par `config`.
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

from . import config
from .competences import Resultat, competence

# ── Les adresses ───────────────────────────────────────────────────────────
API_MANAGEMENT = f"https://api.supabase.com/v1/projects/{config.PROJET_SUPABASE}"
API_SQL = f"{API_MANAGEMENT}/database/query"
API_UPLOAD = f"{config.SITE}/api/o2upload.php"

# Le serveur n'accepte que ces trois dossiers (`o2upload.php`, ligne 152).
DOSSIERS_UPLOAD = ("pages", "posts", "profiles")
EXTENSIONS_IMAGE = (".jpg", ".jpeg", ".png", ".webp")
POIDS_MAX_IMAGE = 10 * 1024 * 1024  # le serveur refuse au-delà (« max 10MB »)

# Un client HTTP nu reçoit la page de blocage d'o2switch. Cet agent est celui
# d'un téléphone Android — l'appareil de la majorité des visiteurs de Diako.
AGENT = ("Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 "
         "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
TANA = timezone(timedelta(hours=3))

# Le compte propriétaire du site. Ce n'est pas un secret — il est déjà écrit
# dans `docs/A-APPLIQUER.md` et dans `bot-diako/bot/config.py` — mais il se
# résout par une sous-requête sur `auth.users` plutôt que par un identifiant
# recopié : si le compte change, le préambule suit sans qu'on y pense.
COMPTE_ADMIN = "contact.diako@gmail.com"

PREAMBULE_ADMIN = (
    "select set_config('request.jwt.claims', json_build_object("
    "'sub',(select id from auth.users where lower(email)='" + COMPTE_ADMIN + "'),"
    "'role','authenticated')::text, true);\n"
    "do $$ begin if not public.is_admin() then "
    "raise exception 'preambule admin refuse : rien ecrit'; end if; end $$;\n"
)

# Les adresses publiques, par genre de contenu (cf. `src/App.tsx`).
URL_PAR_GENRE = {
    "fiche": "/p/{slug}",
    "lieu": "/lieu/{slug}",
    "site": "/site/{slug}",
    "plat": "/plat/{slug}",
}


# ── Le SQL ─────────────────────────────────────────────────────────────────
def _sql(requete: str, delai: int = 90, admin: bool = False) -> list[dict]:
    """Une requête SQL sur la base Diako, par l'API Management.

    Recopié de `bot-diako/bot/diako.py:165` (`executer_sql`), sans le cache ni
    le référentiel dont ce bot n'a pas besoin. Le jeton est celui du COMPTE
    Supabase : celui de Fonenako ouvre aussi ce projet.

    ⚠ `admin=True` pour toute écriture sur `pages`. Le préambule et l'ordre
      d'écriture DOIVENT partir dans le MÊME envoi : `set_config(…, true)` ne
      vaut que pour la transaction en cours, et plusieurs ordres séparés par
      « ; » dans une seule requête forment une seule transaction implicite.

    ⚠ Une réponse qui n'est pas une liste JSON est une ERREUR, pas un résultat
      vide. Rendre `[]` ici ferait annoncer « 0 fiche » en succès.
    """
    jeton = config.jeton_supabase()
    if not jeton:
        raise RuntimeError(
            "aucun jeton Supabase (ni ~/.diako-secrets/supabase_token.txt, "
            "ni ~/.fonenako-secrets/supabase_token.txt)"
        )
    if admin:
        requete = PREAMBULE_ADMIN + requete
    r = requests.post(
        API_SQL,
        headers={"Authorization": f"Bearer {jeton}",
                 "Content-Type": "application/json"},
        json={"query": requete},
        timeout=delai,
    )
    if not r.ok:
        raise RuntimeError(f"Supabase a refusé : HTTP {r.status_code} — {r.text[:300]}")
    try:
        donnees = r.json()
    except ValueError:
        raise RuntimeError(f"Réponse Supabase illisible : {r.text[:200]!r}")
    if not isinstance(donnees, list):
        raise RuntimeError(f"Réponse Supabase inattendue : {str(donnees)[:200]}")
    return donnees


def _texte(valeur) -> str:
    """Une valeur littérale SQL, apostrophes doublées. `None` devient NULL."""
    if valeur is None or valeur == "":
        return "NULL"
    return "'" + str(valeur).replace("'", "''") + "'"


def _motif(valeur: str) -> str:
    """Un littéral pour `like`, avec `%`, `_` et `\\` neutralisés.

    ⚠ Sans ça, une recherche sur « 100 % » ou « chez_moi » balaie la table :
      `%` et `_` sont des jokers, pas des caractères.
    """
    brut = (str(valeur).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"))
    return "'%" + brut.replace("'", "''").lower() + "%'"


_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                   r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,120}$")


def _heure_tana(quand: datetime | None = None) -> str:
    return (quand or datetime.now(timezone.utc)).astimezone(TANA).strftime("%d/%m %H:%M")


def _nb(valeur, defaut: int = 0) -> int:
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return defaut


def _part(n: int, total: int) -> str:
    return f"{100 * n / total:.0f} %" if total else "—"


# ── 1. L'état du site ──────────────────────────────────────────────────────
_BUNDLE = re.compile(r"assets/index-[A-Za-z0-9_-]+\.js")
# La page de blocage d'o2switch : un tigre, et rien d'autre. C'est elle qu'un
# client HTTP nu reçoit, et c'est elle qu'on a déjà prise pour le vrai site
# (audit AKORA du 05/09/2026 : 4 violations identiques sur 10 pages).
_BLOCAGE = re.compile(r"tiger\.svg", re.I)


def _bundle_du_depot() -> str:
    """Le bundle référencé par `dist/index.html` du dépôt, ou une chaîne vide."""
    index = Path(config.DEPOT) / "dist" / "index.html"
    if not index.exists():
        return ""
    trouve = _BUNDLE.search(index.read_text(encoding="utf-8", errors="replace"))
    return trouve.group(0) if trouve else ""


def _git(*arguments: str) -> str:
    try:
        sortie = subprocess.run(
            ["git", "-C", str(config.DEPOT), *arguments],
            capture_output=True, text=True, timeout=25, encoding="utf-8", errors="replace",
        )
        return (sortie.stdout or "").strip() if sortie.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


@competence(
    "etat_site",
    "État du site",
    "Dit si diako.fonenako.mg répond (code HTTP, temps de réponse), quel "
    "bundle JavaScript est en ligne, s'il correspond au build local du dépôt, "
    "quand le site a été déployé pour la dernière fois et sur quel commit.",
    exemples=("le site est en ligne ?", "état du site", "la prod est à jour ?"),
    famille="site",
)
def etat_site() -> Resultat:
    depart = time.time()
    try:
        reponse = requests.get(
            config.SITE + "/",
            headers={"User-Agent": AGENT, "Cache-Control": "no-cache"},
            timeout=25,
        )
    except requests.RequestException as e:
        return Resultat(
            texte=f"Le site ne répond pas : {type(e).__name__}. Rien d'autre n'a pu être mesuré.",
            ok=False, donnees={"erreur": type(e).__name__},
        )
    ms = int((time.time() - depart) * 1000)
    corps = reponse.text

    # ⚠ Ne jamais conclure sur la page de blocage d'o2switch : elle a un titre,
    #   un code 200 possible en cache, et AUCUN bundle — donc « le site est
    #   cassé » alors qu'il sert parfaitement les vrais visiteurs.
    if reponse.status_code == 429 or _BLOCAGE.search(corps[:4000]):
        return Resultat(
            texte=(f"Mesure refusée : o2switch a servi sa page de blocage "
                   f"(HTTP {reponse.status_code}, {ms} ms). Ce n'est pas le site. "
                   f"À refaire dans quelques minutes."),
            ok=False, donnees={"code": reponse.status_code, "blocage": True},
        )

    en_ligne = _BUNDLE.search(corps)
    en_ligne = en_ligne.group(0) if en_ligne else ""
    local = _bundle_du_depot()
    depose = reponse.headers.get("Last-Modified", "")
    try:
        depose_le = _heure_tana(parsedate_to_datetime(depose)) if depose else "inconnu"
    except (TypeError, ValueError):
        depose_le = "inconnu"

    branche = _git("branch", "--show-current") or "?"
    commit = _git("log", "-1", "--format=%h %ad %s", "--date=format:%d/%m %H:%M") or "?"

    if not en_ligne:
        accord = "aucun bundle trouvé dans la page en ligne"
        ok = False
    elif not local:
        accord = f"{en_ligne} en ligne ; pas de dist/index.html local pour comparer"
        ok = True
    elif en_ligne == local:
        accord = f"{en_ligne} — identique au build local"
        ok = True
    else:
        accord = f"ÉCART : en ligne {en_ligne}, build local {local}"
        ok = False

    lignes = [
        f"Site : HTTP {reponse.status_code} en {ms} ms ({len(corps)} octets).",
        f"Bundle : {accord}.",
        f"Déployé le {depose_le} (heure de Tana).",
        f"Dépôt : branche {branche}, dernier commit {commit}.",
    ]
    return Resultat(
        texte="\n".join(lignes),
        ok=ok and reponse.status_code == 200,
        donnees={
            "code": reponse.status_code, "ms": ms,
            "bundle_en_ligne": en_ligne, "bundle_local": local,
            "identiques": bool(en_ligne) and en_ligne == local,
            "depose_le": depose_le, "branche": branche, "commit": commit,
        },
    )


# ── 2. Les chiffres du site ────────────────────────────────────────────────
# ⚠ `places.merged_into` : un lieu fusionné existe encore en base mais n'est
#   plus un lieu. Le compter gonflerait le total de plusieurs milliers.
REQUETE_CHIFFRES = """
select
  (select count(*) from pages where is_published)                                  as fiches,
  (select count(*) from pages where is_published and coalesce(cover_url,'') <> '') as fiches_photo,
  (select count(*) from pages where is_published and coalesce(phone,'') <> '')     as fiches_tel,
  (select count(*) from pages where is_published and price_min_ar is not null)     as fiches_prix,
  (select count(*) from pages where is_published and place_id is not null)         as fiches_lieu,
  (select count(*) from pages)                                                     as fiches_toutes,
  (select count(*) from places where merged_into is null)                          as lieux,
  (select count(*) from places where merged_into is null and is_touristique)       as lieux_touristiques,
  (select count(*) from attractions where is_published)                            as sites,
  (select count(*) from attractions)                                               as sites_tous,
  (select count(*) from dishes)                                                    as plats,
  (select count(*) from posts where status = 'published')                          as publications,
  (select count(*) from posts where status = 'hidden')                             as publications_masquees,
  (select count(*) from events where is_published)                                 as evenements,
  (select count(*) from profiles)                                                  as membres
"""


@competence(
    "chiffres_site",
    "Les chiffres du site",
    "Recompte en base ce que le site contient vraiment : fiches publiées (avec "
    "photo, téléphone, prix), lieux, sites touristiques, plats, publications du "
    "fil, événements, membres. Chaque nombre vient d'un SELECT lancé à l'instant.",
    exemples=("combien de fiches ?", "les chiffres du site", "où on en est ?"),
    famille="site",
)
def chiffres_site() -> Resultat:
    lignes = _sql(REQUETE_CHIFFRES)
    if not lignes:
        return Resultat(texte="La base n'a rien renvoyé — comptage impossible.", ok=False)
    c = {k: _nb(v) for k, v in lignes[0].items()}
    f = c["fiches"]
    texte = "\n".join([
        f"Compté à l'instant ({_heure_tana()}, heure de Tana) :",
        f"· Fiches publiées : {f} sur {c['fiches_toutes']}",
        f"   photo {c['fiches_photo']} ({_part(c['fiches_photo'], f)}), "
        f"téléphone {c['fiches_tel']} ({_part(c['fiches_tel'], f)}), "
        f"prix {c['fiches_prix']} ({_part(c['fiches_prix'], f)}), "
        f"rattachées à un lieu {c['fiches_lieu']} ({_part(c['fiches_lieu'], f)})",
        f"· Lieux : {c['lieux']} dont {c['lieux_touristiques']} touristiques",
        f"· Sites touristiques publiés : {c['sites']} sur {c['sites_tous']}",
        f"· Plats : {c['plats']}",
        f"· Fil : {c['publications']} publications visibles, {c['publications_masquees']} masquées",
        f"· Événements publiés : {c['evenements']}",
        f"· Membres : {c['membres']}",
    ])
    return Resultat(texte=texte, donnees=c)


# ── 3. Chercher un contenu ─────────────────────────────────────────────────
def _requete_recherche(motif: str, limite: int) -> str:
    """Quatre tables, un seul aller-retour. Colonnes énumérées, jamais `*`."""
    return f"""
select t.genre, t.slug, t.nom, t.lieu, t.details, t.photo, t.tel,
       t.is_published, t.vues from (
  select 'fiche' as genre, p.slug, p.name as nom, coalesce(l.name_fr,'') as lieu,
         coalesce(array_to_string(p.categories, ', '),'') as details,
         (coalesce(p.cover_url,'') <> '') as photo, coalesce(p.phone,'') as tel,
         p.is_published, coalesce(p.views_count,0) as vues
    from pages p left join places l on l.id = p.place_id
   where lower(p.name) like {motif} or p.slug like {motif} or coalesce(p.norm,'') like {motif}
  union all
  -- ⚠ `places` et `dishes` n'ont PAS de colonne de publication : on rend NULL,
  --   pas `true`. Écrire « publiée » sur un lieu qui n'a pas cet état serait
  --   un chiffre inventé, et c'est exactement ce qu'on cherche à ne pas faire.
  select 'lieu', l.slug, l.name_fr, coalesce(l.region,''),
         coalesce(l.kind,''), (coalesce(l.cover_url,'') <> ''), '',
         null::boolean, coalesce(l.nb_pages,0)
    from places l
   where l.merged_into is null
     and (lower(l.name_fr) like {motif} or l.slug like {motif}
          or lower(coalesce(l.name_mg,'')) like {motif} or coalesce(l.norm,'') like {motif})
  union all
  select 'site', a.slug, a.name, coalesce(l.name_fr,''),
         coalesce(a.kind,''), (coalesce(a.cover_url,'') <> ''), '',
         a.is_published, 0
    from attractions a left join places l on l.id = a.place_id
   where lower(a.name) like {motif} or a.slug like {motif}
  union all
  select 'plat', d.slug, d.name_fr, '',
         coalesce(d.name_mg,''), (coalesce(d.photo_url,'') <> ''), '',
         null::boolean, coalesce(d.nb_restaurants,0)
    from dishes d
   where lower(d.name_fr) like {motif} or d.slug like {motif}
         or lower(coalesce(d.name_mg,'')) like {motif}
) t
order by coalesce(t.is_published, true) desc, t.vues desc, t.genre, t.nom
limit {limite}
"""


@competence(
    "chercher_contenu",
    "Chercher dans le contenu du site",
    "Cherche un établissement, un lieu, un site touristique ou un plat par son "
    "nom et rend sa fiche : slug, lieu, catégories, photo oui/non, téléphone, "
    "publiée ou non, et l'adresse publique sur le site.",
    parametres={"nom": "le nom cherché, même approximatif",
                "limite": "nombre de résultats (8 par défaut, 25 au plus)"},
    obligatoires=("nom",),
    exemples=("cherche Sakamanga", "la fiche du lac Andraikiba",
              "tu as quoi sur Nosy Komba ?"),
    famille="site",
)
def chercher_contenu(nom: str, limite: str = "8") -> Resultat:
    terme = (nom or "").strip()
    if len(terme) < 3:
        return Resultat(
            texte="Il me faut au moins trois lettres : sous ce seuil la recherche "
                  "rend n'importe quoi.", ok=False,
        )
    combien = max(1, min(25, _nb(limite, 8) or 8))
    lignes = _sql(_requete_recherche(_motif(terme), combien))
    if not lignes:
        return Resultat(
            texte=f"Rien pour « {terme} » — ni fiche, ni lieu, ni site, ni plat.",
            donnees={"terme": terme, "resultats": 0},
        )
    sortie = [f"« {terme} » — {len(lignes)} résultat(s) :"]
    for l in lignes:
        genre = str(l.get("genre", ""))
        url = config.SITE + URL_PAR_GENRE.get(genre, "/{slug}").format(slug=l.get("slug", ""))
        publiee = l.get("is_published")
        marques = ["photo" if l.get("photo") else "sans photo"]
        if publiee is not None:
            marques.insert(0, "publiée" if publiee else "NON publiée")
        if l.get("tel"):
            marques.append(str(l["tel"]))
        if l.get("lieu"):
            marques.insert(0, str(l["lieu"]))
        if l.get("details"):
            marques.append(str(l["details"])[:60])
        sortie.append(f"· [{genre}] {l.get('nom')} — {', '.join(marques)}\n  {url}")
    return Resultat(texte="\n".join(sortie),
                    donnees={"terme": terme, "resultats": len(lignes), "lignes": lignes})


# ── 4. Les erreurs remontées par le site ───────────────────────────────────
@competence(
    "journal_erreurs_site",
    "Erreurs JavaScript du site",
    "Les dernières erreurs remontées par le site chez les visiteurs (table "
    "journal_erreurs), regroupées par message, avec la page concernée et la "
    "dernière fois où c'est arrivé.",
    parametres={"jours": "fenêtre en jours (7 par défaut)"},
    exemples=("le site plante quelque part ?", "les erreurs de cette semaine"),
    famille="site",
)
def journal_erreurs_site(jours: str = "7") -> Resultat:
    fenetre = max(1, min(90, _nb(jours, 7) or 7))
    lignes = _sql(f"""
select left(coalesce(message,'(sans message)'), 110) as message,
       count(*) as n,
       to_char(max(created_at) + interval '3 hours', 'DD/MM HH24:MI') as dernier,
       coalesce(max(chemin), '') as chemin,
       coalesce(max(source), '') as source,
       count(distinct coalesce(chemin,'')) as pages
  from journal_erreurs
 where created_at > now() - interval '{fenetre} days'
 group by 1
 order by n desc, dernier desc
 limit 12
""")
    if not lignes:
        return Resultat(
            texte=f"Aucune erreur remontée sur {fenetre} jours. "
                  f"⚠ Cela dit aussi bien « rien ne casse » que « plus personne ne remonte rien ».",
            donnees={"jours": fenetre, "groupes": 0},
        )
    total = sum(_nb(l.get("n")) for l in lignes)
    sortie = [f"{total} erreur(s) sur {fenetre} jours, en {len(lignes)} message(s) distinct(s) :"]
    for l in lignes:
        sortie.append(
            f"· {_nb(l.get('n'))}x {l.get('message')}\n"
            f"  {l.get('chemin') or 'page inconnue'} ({l.get('pages')} page(s)), "
            f"source {l.get('source') or '?'}, dernière le {l.get('dernier')}"
        )
    return Resultat(texte="\n".join(sortie),
                    donnees={"jours": fenetre, "total": total, "groupes": lignes})


# ── 5. La santé du projet Supabase ─────────────────────────────────────────
@competence(
    "sante_base",
    "Santé de la base Supabase",
    "Dit si le projet Supabase de Diako est ACTIF (il se met en pause tout seul "
    "sur le plan gratuit, et le site tombe avec lui), sa taille, son nombre de "
    "tables et les plus grosses d'entre elles.",
    exemples=("la base est debout ?", "santé de Supabase", "le projet est en pause ?"),
    famille="site",
)
def sante_base() -> Resultat:
    jeton = config.jeton_supabase()
    if not jeton:
        return Resultat(
            texte="Pas de jeton Supabase : ni ~/.diako-secrets/supabase_token.txt, "
                  "ni le repli ~/.fonenako-secrets/supabase_token.txt.", ok=False,
        )
    etat, region, nom = "inconnu", "", config.PROJET_SUPABASE
    try:
        r = requests.get(API_MANAGEMENT, headers={"Authorization": f"Bearer {jeton}"},
                         timeout=30)
        if r.ok:
            projet = r.json()
            etat = str(projet.get("status", "inconnu"))
            region = str(projet.get("region", ""))
            nom = str(projet.get("name", nom))
        else:
            etat = f"lecture refusée (HTTP {r.status_code})"
    except (requests.RequestException, ValueError) as e:
        etat = f"lecture impossible ({type(e).__name__})"

    actif = etat.startswith("ACTIVE")
    if not actif:
        # Une base en pause ne répond à aucun SELECT : inutile d'insister.
        return Resultat(
            texte=(f"Projet « {nom} » ({config.PROJET_SUPABASE}) : état {etat}. "
                   f"Tant qu'il n'est pas ACTIVE_HEALTHY, le site n'a plus de "
                   f"contenu — à relancer depuis le tableau de bord Supabase."),
            ok=False, donnees={"statut": etat, "projet": config.PROJET_SUPABASE},
        )

    lignes = _sql("""
select pg_size_pretty(pg_database_size(current_database())) as taille,
       pg_database_size(current_database()) as octets,
       (select count(*) from information_schema.tables
         where table_schema='public' and table_type='BASE TABLE') as tables,
       (select string_agg(x.nom || ' ' || x.poids, ', ')
          from (select c.relname as nom,
                       pg_size_pretty(pg_total_relation_size(c.oid)) as poids
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r'
                 order by pg_total_relation_size(c.oid) desc
                 limit 5) x) as plus_grosses
""")
    d = lignes[0] if lignes else {}
    return Resultat(
        texte="\n".join([
            f"Projet « {nom} » ({config.PROJET_SUPABASE}) : {etat}"
            + (f", région {region}" if region else "") + ".",
            f"Base : {d.get('taille', '?')}, {_nb(d.get('tables'))} tables.",
            f"Les plus grosses : {d.get('plus_grosses', '?')}.",
        ]),
        donnees={"statut": etat, "region": region, "octets": _nb(d.get("octets")),
                 "tables": _nb(d.get("tables"))},
    )


# ── 6. Déployer ────────────────────────────────────────────────────────────
MEMOIRE_MINIMALE_MO = 1200  # en dessous, un build Vite meurt (souvent en silence)


def _memoire_virtuelle_libre_mo() -> int | None:
    """Les Mo d'engagement mémoire encore disponibles, ou None si non mesurable.

    ⚠ C'EST `FreeVirtualMemory` QU'IL FAUT LIRE, pas la RAM libre ni le fichier
      d'échange : un build meurt sur « fatal error: out of memory » avec 1 Go
      de RAM libre affichée. Mesuré le 20/09/2026 sur ce PC : la somme
      psutil (RAM disponible + échange libre) annonçait 13 486 Mo quand
      Windows n'avait que 2 076 Mo d'engagement libre — un facteur 6, et un
      garde-fou qui ne se serait JAMAIS déclenché.
    """
    try:
        sortie = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"],
            capture_output=True, text=True, timeout=25,
            encoding="utf-8", errors="replace",
        )
        valeur = (sortie.stdout or "").strip()
        if sortie.returncode == 0 and valeur.isdigit():
            return int(valeur) // 1024  # l'API rend des Ko
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    try:  # repli approximatif, mieux que pas de garde du tout
        import psutil
        return int(psutil.virtual_memory().available / (1024 * 1024))
    except Exception:  # noqa: BLE001 — une mesure ratée n'est pas un échec
        return None


@competence(
    "deployer_site",
    "Déployer le site",
    "Construit et met en ligne diako.fonenako.mg par ~/.deploy-sites/redeploy.sh, "
    "qui bascule index.html en dernier puis VÉRIFIE le hash du bundle en ligne. "
    "Rend le compte rendu : hash local et en ligne, nombre de fichiers, durée.",
    publique=True,
    exemples=("déploie le site", "mets Diako en ligne"),
    famille="site",
)
def deployer_site() -> Resultat:
    script = Path(config.REDEPLOY)
    if not script.exists():
        return Resultat(texte=f"Script de déploiement introuvable : {script}", ok=False)

    libre = _memoire_virtuelle_libre_mo()
    if libre is not None and libre < MEMOIRE_MINIMALE_MO:
        return Resultat(
            texte=(f"Déploiement refusé : {libre} Mo d'engagement mémoire libre, "
                   f"il en faut au moins {MEMOIRE_MINIMALE_MO}. Sous ce seuil, "
                   f"esbuild meurt en silence (exit 0, dist/ absent) et la prod "
                   f"garde l'ancien bundle. Fermer des fenêtres, ou construire "
                   f"sur GitHub Actions."),
            ok=False, donnees={"memoire_libre_mo": libre},
        )

    depart = time.time()
    try:
        sortie = subprocess.run(
            ["bash", str(script), "diako"],
            capture_output=True, text=True, timeout=1800,
            encoding="utf-8", errors="replace",
        )
    except subprocess.TimeoutExpired:
        return Resultat(
            texte="Déploiement interrompu au bout de 30 minutes. État EN LIGNE "
                  "inconnu : lancer « état du site » avant toute autre chose.",
            ok=False,
        )
    except OSError as e:
        return Resultat(texte=f"Impossible de lancer le script : {e}", ok=False)

    secondes = int(time.time() - depart)
    texte_brut = (sortie.stdout or "") + "\n" + (sortie.stderr or "")
    lignes = [l.strip() for l in texte_brut.splitlines() if l.strip()]

    def _premiere(motif: str) -> str:
        for l in lignes:
            if motif in l:
                return l
        return ""

    bascule = _premiere("bascule faite")
    local = _premiere("local   :")
    en_ligne = _premiere("en ligne:")
    ecart = _premiere("ECART")
    verifie = bool(_premiere("DEPLOIEMENT VERIFIE"))
    fichiers = re.search(r"\((\d+) fichiers", bascule)

    # ⚠ Le code de sortie fait foi, PAS le dernier message : redeploy.sh sort
    #   en code 3 quand la vérification en ligne ne colle pas.
    ok = sortie.returncode == 0 and verifie and not ecart
    resume = [
        f"Déploiement {'VÉRIFIÉ' if ok else 'NON VÉRIFIÉ'} "
        f"(code {sortie.returncode}, {secondes} s).",
    ]
    if fichiers:
        resume.append(f"{fichiers.group(1)} fichiers envoyés, index.html basculé en dernier.")
    if local:
        resume.append(local)
    if en_ligne:
        resume.append(en_ligne)
    if ecart:
        resume.append("⚠ " + ecart)
    if not ok and not ecart:
        resume.append("Dernières lignes : " + " | ".join(lignes[-4:]))
    return Resultat(
        texte="\n".join(resume), ok=ok,
        donnees={"code": sortie.returncode, "secondes": secondes,
                 "verifie": verifie, "fichiers": _nb(fichiers.group(1)) if fichiers else 0,
                 "sortie": texte_brut[-4000:]},
    )


# ── 7. Envoyer une image ───────────────────────────────────────────────────
@competence(
    "envoyer_image_site",
    "Envoyer une image sur le site",
    "Envoie une image locale sur l'hébergement o2switch de Diako (JSON base64, "
    "le seul mode que le pare-feu laisse passer) et rend son URL publique et "
    "les trois variantes WebP (480, 960, 1600).",
    parametres={"chemin": "chemin du fichier image sur le PC",
                "dossier": "pages, posts ou profiles (pages par défaut)",
                "nom": "nom du fichier en ligne (déduit du chemin si absent)"},
    obligatoires=("chemin",),
    publique=True,
    exemples=("envoie marketing/atelier/photos/kirindy.jpg sur le site",),
    famille="site",
)
def envoyer_image_site(chemin: str, dossier: str = "pages", nom: str = "") -> Resultat:
    fichier = Path(chemin).expanduser()
    if not fichier.is_absolute():
        fichier = Path(config.DEPOT) / chemin
    if not fichier.exists() or not fichier.is_file():
        return Resultat(texte=f"Fichier introuvable : {fichier}", ok=False)

    dossier = (dossier or "pages").strip().lower()
    if dossier not in DOSSIERS_UPLOAD:
        return Resultat(
            texte=f"Dossier « {dossier} » refusé par le serveur. "
                  f"Au choix : {', '.join(DOSSIERS_UPLOAD)}.", ok=False,
        )

    extension = fichier.suffix.lower()
    if extension not in EXTENSIONS_IMAGE:
        return Resultat(
            texte=f"Le serveur n'accepte que {', '.join(EXTENSIONS_IMAGE)} "
                  f"(reçu « {extension or 'sans extension'} »).", ok=False,
        )
    octets = fichier.read_bytes()
    if len(octets) > POIDS_MAX_IMAGE:
        return Resultat(
            texte=f"Image trop lourde : {len(octets) / 1048576:.1f} Mo, le serveur "
                  f"refuse au-delà de 10 Mo.", ok=False,
        )

    cle = config.cle_env_diako()
    if not cle:
        return Resultat(
            texte="Pas de clé d'envoi : O2SWITCH_UPLOAD_API_KEY manque dans "
                  "~/.diako-secrets/env_diako.txt. ⚠ La clé de Diako n'est pas "
                  "celle de Fonenako — se tromper rend « Unauthorized ».", ok=False,
        )

    # Le serveur n'accepte que [A-Za-z0-9._/-] dans le nom (o2upload.php:165).
    souhaite = (nom or fichier.name).strip().lstrip("/")
    propre = re.sub(r"[^A-Za-z0-9._/-]", "-", souhaite)
    if not propre.lower().endswith(extension):
        propre += extension
    nom_ligne = f"{int(time.time())}-{propre}"

    mime = "image/jpeg" if extension in (".jpg", ".jpeg") else f"image/{extension[1:]}"
    corps = {
        "file": f"data:{mime};base64," + base64.b64encode(octets).decode("ascii"),
        "filename": nom_ligne,
        "folder": dossier,
    }
    # 🔴 JSON, JAMAIS multipart : sur ce domaine, tout multipart portant un
    #    fichier reçoit un 406 du pare-feu avant d'atteindre PHP (19/09/2026).
    try:
        r = requests.post(
            API_UPLOAD,
            headers={"X-API-Key": cle, "Content-Type": "application/json",
                     "User-Agent": AGENT},
            data=json.dumps(corps), timeout=180,
        )
    except requests.RequestException as e:
        return Resultat(texte=f"Envoi impossible : {type(e).__name__}", ok=False)

    try:
        reponse = r.json()
    except ValueError:
        detail = "page de blocage de l'hébergeur" if r.status_code == 406 else r.text[:150]
        return Resultat(
            texte=f"Le serveur a répondu HTTP {r.status_code} sans JSON ({detail}).",
            ok=False, donnees={"code": r.status_code},
        )
    if not r.ok or not reponse.get("success"):
        return Resultat(
            texte=f"Envoi refusé (HTTP {r.status_code}) : "
                  f"{reponse.get('error', 'sans motif')}.",
            ok=False, donnees={"code": r.status_code, "reponse": reponse},
        )

    variantes = reponse.get("variants") or {}
    return Resultat(
        texte="\n".join([
            f"Image en ligne ({len(octets) / 1024:.0f} Ko, dossier {dossier}) :",
            str(reponse.get("url", "")),
            "Variantes : " + (", ".join(f"{k} px → {v}" for k, v in variantes.items())
                              or "aucune (le serveur n'a pas pu les fabriquer)"),
        ]),
        donnees={"url": reponse.get("url"), "thumb": reponse.get("thumb_url"),
                 "variantes": variantes, "octets": len(octets)},
    )


# ── 8. Masquer une publication du fil ──────────────────────────────────────
@competence(
    "masquer_publication_fil",
    "Masquer une publication du fil",
    "Masque une publication du fil Diako (status passe à hidden, rien n'est "
    "supprimé et le geste se défait). Rend le début du texte masqué en preuve.",
    parametres={"id": "l'identifiant (UUID) de la publication"},
    obligatoires=("id",),
    publique=True,
    exemples=("masque la publication 6f1c… du fil",),
    famille="site",
)
def masquer_publication_fil(id: str) -> Resultat:  # noqa: A002 — nom lu par le modèle
    identifiant = (id or "").strip()
    if not _UUID.match(identifiant):
        return Resultat(
            texte="Ce n'est pas un identifiant de publication (UUID attendu). "
                  "Rien n'a été touché.", ok=False,
        )
    avant = _sql(
        "select id::text, left(coalesce(body,''), 140) as debut, status, kind, "
        "to_char(created_at + interval '3 hours','DD/MM HH24:MI') as pose_le "
        f"from posts where id = {_texte(identifiant)}::uuid"
    )
    if not avant:
        return Resultat(texte="Aucune publication avec cet identifiant.", ok=False)
    if avant[0].get("status") == "hidden":
        return Resultat(
            texte=f"Déjà masquée (posée le {avant[0].get('pose_le')}). Rien à faire.\n"
                  f"« {avant[0].get('debut')} »",
            donnees={"deja": True},
        )

    # Écriture bornée : un `where` sur la clé, un `returning` qui prouve.
    apres = _sql(
        "with modif as ("
        "  update posts set status = 'hidden' "
        f" where id = {_texte(identifiant)}::uuid and status <> 'hidden' "
        "  returning id::text, status, left(coalesce(body,''), 140) as debut"
        ") select id, status, debut from modif"
    )
    if not apres or apres[0].get("status") != "hidden":
        return Resultat(
            texte="L'ordre est parti mais la publication n'est pas masquée. "
                  "Rien de sûr n'a été écrit — à regarder de près.", ok=False,
            donnees={"retour": apres},
        )
    return Resultat(
        texte=f"Publication masquée ({avant[0].get('kind')}, posée le "
              f"{avant[0].get('pose_le')}).\n« {apres[0].get('debut')} »\n"
              f"Elle n'est plus dans le fil ; rien n'est supprimé.",
        donnees={"id": identifiant, "statut": "hidden"},
    )


# ── 9. Publier / dépublier une fiche ───────────────────────────────────────
def _basculer_fiche(slug: str, publier: bool) -> Resultat:
    """La bascule `pages.is_published`, avec le préambule admin obligatoire.

    🔴 SANS LE PRÉAMBULE, L'UPDATE PASSE ET NE FAIT RIEN. Le déclencheur
       `pages_avant_ecriture` remet `is_published` à son ancienne valeur quand
       `public.is_admin()` est faux — sans erreur. On pose donc la revendication
       du compte propriétaire, on la VÉRIFIE (exception sinon, la transaction
       entière est annulée), et on relit le `returning`, qui est la seule preuve.
    """
    cle = (slug or "").strip().lower().lstrip("/")
    if not _SLUG.match(cle):
        return Resultat(
            texte="Ce n'est pas un slug de fiche (lettres minuscules, chiffres "
                  "et tirets). Rien n'a été touché.", ok=False,
        )
    avant = _sql(
        "select p.slug, p.name, p.is_published, coalesce(l.name_fr,'') as lieu, "
        "coalesce(p.phone,'') as tel, (coalesce(p.cover_url,'') <> '') as photo "
        "from pages p left join places l on l.id = p.place_id "
        f"where p.slug = {_texte(cle)}"
    )
    if not avant:
        return Resultat(
            texte=f"Aucune fiche « {cle} ». Cherche-la d'abord par son nom.", ok=False,
        )
    fiche = avant[0]
    if bool(fiche.get("is_published")) is publier:
        etat = "déjà publiée" if publier else "déjà dépubliée"
        return Resultat(
            texte=f"« {fiche.get('name')} » est {etat}. Rien à faire.",
            donnees={"slug": cle, "deja": True},
        )

    valeur = "true" if publier else "false"
    apres = _sql(
        "with modif as ("
        f"  update pages set is_published = {valeur} "
        f" where slug = {_texte(cle)} and is_published is distinct from {valeur} "
        "  returning slug, name, is_published"
        ") select m.slug, m.name, m.is_published, public.is_admin() as admin from modif m",
        admin=True,
    )
    if not apres:
        return Resultat(
            texte="Aucune ligne modifiée — la fiche a changé d'état entre la "
                  "lecture et l'écriture. Rien n'est sûr : à refaire.", ok=False,
        )
    if bool(apres[0].get("is_published")) is not publier:
        return Resultat(
            texte="Refusé EN SILENCE par le déclencheur : la fiche a gardé son "
                  "ancien état malgré le préambule admin. Rien n'a changé.",
            ok=False, donnees={"retour": apres},
        )
    verbe = "publiée" if publier else "dépubliée"
    url = config.SITE + URL_PAR_GENRE["fiche"].format(slug=cle)
    manques = [m for m, present in (("photo", fiche.get("photo")),
                                    ("téléphone", fiche.get("tel"))) if not present]
    lignes = [
        f"« {apres[0].get('name')} » {verbe} ({_heure_tana()}, heure de Tana).",
        f"{fiche.get('lieu') or 'sans lieu'} · {url}",
    ]
    if publier and manques:
        lignes.append("⚠ La fiche n'a pas de " + " ni de ".join(manques) + ".")
    return Resultat(texte="\n".join(lignes),
                    donnees={"slug": cle, "is_published": publier})


@competence(
    "publier_fiche",
    "Publier une fiche",
    "Rend visible sur le site une fiche d'établissement, par son slug. Passe "
    "par le préambule administrateur, sans lequel l'écriture serait annulée "
    "en silence par un déclencheur.",
    parametres={"slug": "le slug de la fiche (ex. sakamanga-2)"},
    obligatoires=("slug",),
    publique=True,
    exemples=("publie la fiche sakamanga-2",),
    famille="site",
)
def publier_fiche(slug: str) -> Resultat:
    return _basculer_fiche(slug, True)


@competence(
    "depublier_fiche",
    "Dépublier une fiche",
    "Retire du site une fiche d'établissement, par son slug (rien n'est "
    "supprimé, le geste se défait). Même préambule administrateur obligatoire.",
    parametres={"slug": "le slug de la fiche (ex. bellevue-hotel)"},
    obligatoires=("slug",),
    publique=True,
    exemples=("dépublie la fiche restaurant-voir-antaninandro",),
    famille="site",
)
def depublier_fiche(slug: str) -> Resultat:
    return _basculer_fiche(slug, False)
