"""Collectes automatiques aux heures dites, avec un objectif journalier.

Deux passages par jour (11 h et 18 h par défaut) sur toutes les sources
actives. Si le premier a peu donné, le second va chercher plus loin dans les
fils plutôt que de rester sur son quota : le but est un nombre de trouvailles
par jour, pas un nombre de défilements.

Le rattrapage ne rend PAS le bot plus agressif — il déroule davantage le même
fil, avec les mêmes pauses. Ce qui change, c'est la profondeur, pas le rythme.
"""
from __future__ import annotations

import threading
from datetime import date, datetime, timedelta, timezone

from . import base
from .config import charger

CLE_DERNIER = "planificateur_dernier_creneau"
VERIFICATION = 30  # secondes entre deux regards à l'horloge


def _heures(config: dict) -> list[str]:
    valides = []
    for heure in config.get("heures_collecte") or []:
        try:
            datetime.strptime(str(heure).strip(), "%H:%M")
            valides.append(str(heure).strip())
        except ValueError:
            base.logguer(f"Heure de collecte illisible, ignorée : {heure!r}", "avert")
    return sorted(valides)


def _minuit_utc() -> str:
    """Minuit d'ici, écrit comme les horodatages de la base (UTC, ISO).

    `collecte_le` est stocké en UTC ; l'objectif, lui, se compte sur la journée
    d'Antananarivo. Sans cette conversion, la remise à zéro tomberait à 3 h du
    matin.
    """
    minuit_ici = datetime.now().astimezone().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return minuit_ici.astimezone(timezone.utc).isoformat(timespec="seconds")


def collectees_aujourdhui() -> int:
    with base._verrou, base.connexion() as cx:
        ligne = cx.execute(
            "SELECT COUNT(*) AS n FROM trouvailles WHERE collecte_le >= ?",
            (_minuit_utc(),),
        ).fetchone()
    return ligne["n"]


def prochain_passage(config: dict) -> str:
    """« aujourd'hui 18:00 » ou « demain 11:00 », pour l'afficher."""
    heures = _heures(config)
    if not heures or not config.get("collecte_auto"):
        return ""
    maintenant = datetime.now()
    for heure in heures:
        moment = datetime.combine(
            maintenant.date(), datetime.strptime(heure, "%H:%M").time()
        )
        if moment > maintenant:
            return f"aujourd'hui {heure}"
    return f"demain {heures[0]}"


class Planificateur:
    """Surveille l'horloge et déclenche les collectes. Un seul fil, discret."""

    def __init__(self, lancer_collecte, est_occupe) -> None:
        self.lancer_collecte = lancer_collecte
        self.est_occupe = est_occupe
        self.arret = threading.Event()
        self.fil = threading.Thread(target=self._boucle, daemon=True)
        self.fil.start()

    def _boucle(self) -> None:
        while not self.arret.wait(VERIFICATION):
            try:
                self._verifier()
            except Exception as e:
                base.logguer(f"Planificateur : {e}", "erreur")

    def _verifier(self) -> None:
        config = charger()
        if not config.get("collecte_auto"):
            return
        heures = _heures(config)
        if not heures:
            return

        maintenant = datetime.now()
        # Le créneau est « passé » dès son heure, et jusqu'à 30 min après : un PC
        # en veille à 11 h pile ne doit pas faire sauter la collecte.
        for heure in heures:
            moment = datetime.combine(
                maintenant.date(), datetime.strptime(heure, "%H:%M").time()
            )
            if not (moment <= maintenant < moment + timedelta(minutes=30)):
                continue

            marque = f"{date.today().isoformat()} {heure}"
            if base.lire_etat(CLE_DERNIER) == marque:
                return  # déjà fait
            if self.est_occupe():
                return  # on retentera dans 30 s, le créneau dure 30 min

            base.ecrire_etat(CLE_DERNIER, marque)
            self._declencher(config, heure, heures)
            return

    def _declencher(self, config: dict, creneau: str, heures: list[str]) -> None:
        deja = collectees_aujourdhui()
        objectif = int(config.get("objectif_par_jour") or 0)
        dernier_creneau = creneau == heures[-1]

        reglages = None
        if objectif and dernier_creneau and deja < objectif:
            reglages = {
                "scrolls_max_par_source": min(60, int(config["scrolls_max_par_source"]) * 2),
                "posts_max_par_source": min(80, int(config["posts_max_par_source"]) * 2),
            }
            base.logguer(
                f"Collecte de {creneau} : {deja} trouvaille(s) aujourd'hui, objectif "
                f"{objectif} — il en manque {objectif - deja}. Ce passage cherche plus "
                "loin dans les fils (mêmes pauses, plus de défilements).",
                "info",
            )
        else:
            base.logguer(
                f"Collecte automatique de {creneau} — {deja} trouvaille(s) déjà "
                "aujourd'hui.", "info",
            )
        self.lancer_collecte(reglages)

    def fermer(self) -> None:
        self.arret.set()


def bilan_du_jour(config: dict) -> dict:
    """Ce que l'interface affiche : où en est-on de l'objectif."""
    fait = collectees_aujourdhui()
    objectif = int(config.get("objectif_par_jour") or 0)
    return {
        "actif": bool(config.get("collecte_auto")),
        "heures": _heures(config),
        "prochain": prochain_passage(config),
        "collectees": fait,
        "objectif": objectif,
        "atteint": bool(objectif and fait >= objectif),
    }
