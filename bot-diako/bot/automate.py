"""Ce que le bot fait tout seul, quand on le lui a demandé une fois.

Le tri à la main est le goulot : une collecte ramène quarante trouvailles, et
la moitié sont soit évidemment bonnes, soit évidemment inutilisables. Ce module
prend en charge ces deux extrêmes, et laisse le milieu — le seul endroit où un
œil humain apporte quelque chose.

🔴 TOUT CE QUI DÉCIDE EST ÉTEINT PAR DÉFAUT (valider, rejeter, publier) ; ce
   qui collecte est allumé (collecte aux heures dites, sites web, relecture
   IA, ménage). Et la publication automatique l'est doublement.
   Valider ou rejeter tout seul se rattrape : rien n'est parti en ligne, et les
   deux statuts se rechangent d'un clic. **Publier tout seul ne se rattrape
   pas** — la fiche est écrite sur diako.fonenako.mg, vue par les visiteurs, et
   c'est un retrait à la main. D'où le plafond quotidien, et le fait que
   l'option annonce ce qu'elle fait au lieu de se contenter d'un interrupteur.

⚠ L'ENTRETIEN NE TOUCHE JAMAIS À CE QUI EST « À TRIER » ET AU MILIEU. Entre le
  seuil de rejet et le seuil de validation, rien ne bouge : c'est la zone où
  l'automate n'a pas d'avis, et prétendre le contraire ferait perdre de bonnes
  trouvailles sans que personne ne s'en aperçoive.
"""
from __future__ import annotations

import shutil
from datetime import date, datetime, timedelta, timezone

from . import base
from .config import DOSSIER_TROUVAILLES

CLE_PUBLIEES_AUTO = "auto_publiees_le"
CLE_MOISSON = "derniere_moisson_sites"
CLE_PROSPECTION = "derniere_prospection_sources"
CLE_DERNIER_ENTRETIEN = "dernier_entretien"

# L'entretien tourne au plus toutes les cinq minutes : il lit la base entière,
# et le faire toutes les trente secondes ne rendrait pas les décisions
# meilleures — seulement le disque plus occupé.
INTERVALLE = 300


def _aujourdhui() -> str:
    return date.today().isoformat()


# ── Validation et rejet ─────────────────────────────────────────────────────
def valider_auto(cfg: dict) -> int:
    """Valide ce qui est manifestement bon. Ne publie rien.

    ⚠ « Manifestement bon » veut dire : score au-dessus du seuil ET rien qui
      bloque la publication. Une trouvaille à 90/100 à qui il manque le lieu
      resterait bloquée au moment de publier — la valider n'avancerait à rien
      et donnerait l'illusion qu'elle est prête.
    """
    if not cfg.get("auto_valider"):
        return 0
    from . import publication

    seuil = int(cfg.get("auto_valider_score", 80))
    exiger_complet = bool(cfg.get("auto_valider_sans_manque", True))
    faits = 0
    for t in base.lister(statut="a_trier", limite=400):
        if (t.get("score") or 0) < seuil:
            continue
        complet = base.trouvaille(t["id"])
        if not complet:
            continue
        if publication.manque_pour_publier(complet):
            continue
        if exiger_complet and complet.get("manques"):
            continue
        base.modifier(t["id"], {"statut": "validee"})
        faits += 1
    if faits:
        base.logguer(
            f"Validation automatique : {faits} trouvaille(s) à {seuil}/100 ou plus, "
            "prêtes à publier.", "succes",
        )
    return faits


def rejeter_auto(cfg: dict) -> int:
    """Écarte ce qui n'a aucune chance. Rien n'est supprimé : le statut change.

    On ne touche PAS aux trouvailles déjà validées ou publiées : leur score a
    pu baisser après une correction, ce n'est pas une raison pour défaire une
    décision humaine.
    """
    if not cfg.get("auto_rejeter"):
        return 0
    seuil = int(cfg.get("auto_rejeter_score", 20))
    faits = 0
    for statut in ("a_trier", "incomplete"):
        for t in base.lister(statut=statut, limite=400):
            # ⚠ Un score NULL n'est pas un score bas : la lecture n'est pas
            #   finie (ou a été interrompue). On ne juge que ce qui a été noté.
            if t.get("score") is None or (t.get("score") or 0) > seuil:
                continue
            base.modifier(t["id"], {
                "statut": "rejetee",
                "note": f"Rejet automatique : score {t.get('score')}/100 "
                        f"(seuil {seuil}).",
            })
            faits += 1
    if faits:
        base.logguer(
            f"Rejet automatique : {faits} trouvaille(s) à {seuil}/100 ou moins.",
            "info",
        )
    return faits


# ── Publication automatique ─────────────────────────────────────────────────
def publiables(cfg: dict) -> list[str]:
    """Les trouvailles validées que l'automate a le droit de publier maintenant.

    Le plafond est quotidien et se remet à zéro à minuit d'ici. Il existe pour
    une raison simple : si une lecture part de travers, on veut s'en apercevoir
    sur dix fiches, pas sur deux cents.
    """
    if not cfg.get("auto_publier"):
        return []
    from . import publication

    plafond = int(cfg.get("auto_publier_max_par_jour", 10))
    deja = _publiees_aujourdhui()
    reste = max(0, plafond - deja)
    if not reste:
        return []

    prets = []
    for t in base.lister(statut="validee", limite=200):
        complet = base.trouvaille(t["id"])
        if not complet or publication.manque_pour_publier(complet):
            continue
        # Déjà en ligne mais restée « validée » (2 lignes le 02/09/2026) : la
        # republier lèverait « Déjà publiée » à chaque tour de 30 s.
        if complet.get("lien_diako"):
            continue
        prets.append(t["id"])
        if len(prets) >= reste:
            break
    return prets


def _publiees_aujourdhui() -> int:
    marque = base.lire_etat(CLE_PUBLIEES_AUTO, "")
    jour, _, compte = marque.partition("|")
    return int(compte or 0) if jour == _aujourdhui() else 0


def noter_publication_auto(nombre: int = 1) -> None:
    base.ecrire_etat(
        CLE_PUBLIEES_AUTO, f"{_aujourdhui()}|{_publiees_aujourdhui() + nombre}"
    )


# ── Entretien de la base locale ─────────────────────────────────────────────
def purger(cfg: dict) -> int:
    """Efface les trouvailles rejetées ou en doublon devenues vieilles.

    ⚠ ON EFFACE AUSSI LEUR DOSSIER. Sans ça, `data/trouvailles/` gonfle
      indéfiniment : chaque trouvaille porte ses photos en pleine taille, et une
      collecte quotidienne en laisse des centaines par mois.
    """
    jours = int(cfg.get("auto_purger_jours", 0) or 0)
    if jours <= 0:
        return 0
    limite = (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat(
        timespec="seconds"
    )
    faits = 0
    with base._verrou, base.connexion() as cx:
        lignes = cx.execute(
            "SELECT id, dossier FROM trouvailles "
            "WHERE statut IN ('rejetee', 'doublon') AND collecte_le < ?",
            (limite,),
        ).fetchall()
    for ligne in lignes:
        if ligne["dossier"]:
            shutil.rmtree(
                DOSSIER_TROUVAILLES.parent / ligne["dossier"], ignore_errors=True
            )
        base.supprimer(ligne["id"])
        faits += 1
    if faits:
        base.logguer(
            f"Ménage : {faits} trouvaille(s) rejetée(s) de plus de {jours} jours "
            "effacée(s), photos comprises.", "info",
        )
    return faits


def moisson_due(cfg: dict) -> bool:
    """La recherche de sites web est-elle due ?"""
    jours = int(cfg.get("moisson_auto_jours", 0) or 0)
    if jours <= 0:
        return False
    derniere = base.lire_etat(CLE_MOISSON, "")
    if not derniere:
        return True
    try:
        return date.fromisoformat(derniere) <= date.today() - timedelta(days=jours)
    except ValueError:
        return True


def prospection_sources_due(cfg: dict) -> bool:
    """La recherche de nouvelles sources est-elle due ?

    Espacée en jours, pas en heures : les groupes Facebook ne naissent pas
    toutes les nuits, et enchaîner des recherches attirerait l'attention sur
    le compte pour rien.
    """
    jours = int(cfg.get("prospection_auto_jours", 0) or 0)
    if jours <= 0:
        return False
    derniere = base.lire_etat(CLE_PROSPECTION, "")
    if not derniere:
        return True
    try:
        return date.fromisoformat(derniere) <= date.today() - timedelta(days=jours)
    except ValueError:
        return True


def noter_prospection_sources() -> None:
    base.ecrire_etat(CLE_PROSPECTION, _aujourdhui())


def noter_moisson() -> None:
    base.ecrire_etat(CLE_MOISSON, _aujourdhui())


# ── Le tour d'entretien ─────────────────────────────────────────────────────
def entretien(cfg: dict) -> dict:
    """Tri automatique et ménage. Ne publie pas : c'est le serveur qui le fait.

    Rend ce qui a été fait, pour que l'interface puisse l'afficher sans avoir à
    relire le journal.
    """
    return {
        "validees": valider_auto(cfg),
        "rejetees": rejeter_auto(cfg),
        "purgees": purger(cfg),
        "photos_liberees_mo": purger_photos_publiees(cfg),
    }


def purger_photos_publiees(cfg: dict) -> int:
    """Efface les photos LOCALES des trouvailles publiées depuis assez longtemps.

    ⭐ Elles sont chez o2switch et leur URL est en base (`photos.url_o2`) :
       978 dossiers publiés pesaient 813 Mo sur les 2 Go de data/trouvailles
       le 02/09/2026, sur un disque C: plein. L'interface montre la copie en
       ligne quand le fichier local manque (voir `serveur.photo`). La ligne
       `photos` et le journal `_photos_envoyees.json` restent : une
       republication réutilise les URL. Rend les mégaoctets libérés.
    """
    jours = int(cfg.get("purger_photos_publiees_jours", 0) or 0)
    if jours <= 0:
        return 0
    limite = (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat(
        timespec="seconds"
    )
    with base._verrou, base.connexion() as cx:
        lignes = cx.execute(
            "SELECT t.id, t.dossier FROM trouvailles t "
            "WHERE t.statut = 'publiee' AND t.dossier IS NOT NULL "
            "AND coalesce(t.publie_a, '') < ? "
            # Une photo gardée dont l'envoi n'a pas d'URL n'est pas encore en
            # ligne : on ne touche pas au dossier.
            "AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.trouvaille_id = t.id "
            "AND p.garder = 1 AND coalesce(p.url_o2, '') = '')",
            (limite,),
        ).fetchall()
    octets, dossiers = 0, 0
    for ligne in lignes:
        dossier = DOSSIER_TROUVAILLES.parent / ligne["dossier"]
        marque = dossier / "photos-liberees"
        if not dossier.is_dir() or marque.exists():
            continue
        for fichier in dossier.iterdir():
            if fichier.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                try:
                    octets += fichier.stat().st_size
                    fichier.unlink()
                except OSError:
                    pass
        marque.write_text("photos effacées après publication — copies chez o2switch",
                          encoding="utf-8")
        dossiers += 1
    mo = octets // 1_000_000
    if dossiers:
        base.logguer(
            f"Ménage : photos locales de {dossiers} trouvaille(s) publiée(s) depuis "
            f"plus de {jours} jours effacées — {mo} Mo libérés, copies en ligne conservées.",
            "info",
        )
    return mo


def est_du(cfg: dict) -> bool:
    """Cinq minutes se sont-elles écoulées depuis le dernier entretien ?"""
    if not any(cfg.get(cle) for cle in (
        "auto_valider", "auto_rejeter", "auto_publier"
    )) and not int(cfg.get("auto_purger_jours", 0) or 0) \
            and not int(cfg.get("purger_photos_publiees_jours", 0) or 0):
        return False
    dernier = float(base.lire_etat(CLE_DERNIER_ENTRETIEN, "0") or 0)
    return (datetime.now(timezone.utc).timestamp() - dernier) >= INTERVALLE


def noter_entretien() -> None:
    base.ecrire_etat(
        CLE_DERNIER_ENTRETIEN, datetime.now(timezone.utc).timestamp()
    )


# ── Ce que l'interface affiche ──────────────────────────────────────────────
def resume(cfg: dict) -> dict:
    """L'état de l'automatisation, en clair — pas une liste d'interrupteurs.

    L'interface doit pouvoir dire « voilà ce qui se passera sans vous », phrase
    par phrase. Un tableau de cases cochées ne dit pas ça.
    """
    from . import planificateur as plan

    lignes = []
    if cfg.get("collecte_auto") and plan._heures(cfg):
        lignes.append({
            "quoi": "Collecte",
            "quand": " et ".join(plan._heures(cfg)),
            "detail": f"objectif {cfg.get('objectif_par_jour')} trouvailles/jour ; "
                      "le dernier passage creuse plus loin s'il manque du monde.",
            "actif": True,
        })
    else:
        lignes.append({
            "quoi": "Collecte", "quand": "—",
            "detail": "éteinte : seul le bouton ramène des trouvailles.",
            "actif": False,
        })

    jours = int(cfg.get("moisson_auto_jours", 0) or 0)
    lignes.append({
        "quoi": "Sites web",
        "quand": f"tous les {jours} jours" if jours else "—",
        "detail": "cherche les sites officiels (annuaire, OpenStreetMap, liens "
                  "des publications) et les ajoute aux sources."
        if jours else "éteinte : la recherche de sites se lance à la main.",
        "actif": bool(jours),
    })

    if cfg.get("auto_valider"):
        detail_validation = (
            f"valide seule au-dessus de {cfg.get('auto_valider_score')}/100"
            + (", et seulement sans aucun manque"
               if cfg.get("auto_valider_sans_manque") else "")
            + "."
        )
    else:
        detail_validation = "éteinte : vous validez à la main."
    lignes.append({
        "quoi": "Validation",
        "quand": "en continu" if cfg.get("auto_valider") else "—",
        "detail": detail_validation,
        "actif": bool(cfg.get("auto_valider")),
    })

    lignes.append({
        "quoi": "Rejet",
        "quand": "en continu" if cfg.get("auto_rejeter") else "—",
        "detail": f"écarte seul en dessous de {cfg.get('auto_rejeter_score')}/100 "
                  "(rien n'est supprimé, le statut se rechange)."
        if cfg.get("auto_rejeter") else "éteint : rien n'est écarté sans vous.",
        "actif": bool(cfg.get("auto_rejeter")),
    })

    plafond = int(cfg.get("auto_publier_max_par_jour", 10))
    lignes.append({
        "quoi": "Publication",
        "quand": "en continu" if cfg.get("auto_publier") else "—",
        "detail": f"publie seule les validées, {_publiees_aujourdhui()}/{plafond} "
                  "aujourd'hui. ⚠ écrit sur le site sans relecture."
        if cfg.get("auto_publier")
        else "éteinte — c'est le réglage à laisser éteint tant que vous n'avez "
             "pas vu une dizaine de publications partir correctement.",
        "actif": bool(cfg.get("auto_publier")),
        "danger": bool(cfg.get("auto_publier")),
    })

    purge = int(cfg.get("auto_purger_jours", 0) or 0)
    photos = int(cfg.get("purger_photos_publiees_jours", 0) or 0)
    lignes.append({
        "quoi": "Ménage",
        "quand": f"au-delà de {purge} jours" if purge else "—",
        "detail": ("efface les rejetées et les doublons, photos comprises"
                   + (f" ; libère les photos locales des publiées après {photos} jours "
                      "(copies en ligne conservées)." if photos else "."))
        if purge else "éteint : la base locale garde tout.",
        "actif": bool(purge),
    })

    prospection = int(cfg.get("prospection_auto_jours", 0) or 0)
    lignes.append({
        "quoi": "Nouvelles sources",
        "quand": f"tous les {prospection} jours" if prospection else "—",
        "detail": "cherche de nouveaux groupes et pages et les propose — rien n'est "
                  "adopté sans vous." if prospection
        else "éteinte : la recherche de sources se lance à la main.",
        "actif": bool(prospection),
    })

    return {
        "lignes": lignes,
        "publiees_auto_aujourdhui": _publiees_aujourdhui(),
        "plafond_publication": plafond,
        "derniere_moisson": base.lire_etat(CLE_MOISSON, ""),
    }
