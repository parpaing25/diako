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
from datetime import date, datetime, timezone

from . import automate, base
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
    """Surveille l'horloge et déclenche tout ce qui tourne seul.

    Un seul fil, discret, qui regarde l'heure toutes les trente secondes et
    décide, dans cet ordre :

      1. **l'entretien** — validation, rejet et ménage : ça ne touche à rien
         d'extérieur et ça ne bloque personne, donc ça passe en premier ;
      2. **la publication automatique**, si elle est armée et que rien d'autre
         ne tourne ;
      3. **la recherche de sites web**, quand elle est due ;
      4. **la collecte** à ses heures.

    ⚠ L'ORDRE COMPTE. Une seule tâche lourde tourne à la fois (`est_occupe`) :
      si la collecte passait avant, la publication automatique n'aurait jamais
      sa fenêtre les jours de grosse récolte.
    """

    def __init__(self, lancer_collecte, est_occupe, lancer_tache=None) -> None:
        self.lancer_collecte = lancer_collecte
        self.est_occupe = est_occupe
        # `lancer_tache(type, fonction)` est fourni par le serveur : c'est lui
        # qui détient le verrou « une seule tâche à la fois ».
        self.lancer_tache = lancer_tache
        self.arret = threading.Event()
        self.fil = threading.Thread(target=self._boucle, daemon=True)
        self.fil.start()

    def _boucle(self) -> None:
        while not self.arret.wait(VERIFICATION):
            try:
                config = charger()
                # ⚠ L'ENTRETIEN ATTEND LA FIN DE LA COLLECTE. Pendant qu'elle
                #   tourne, une trouvaille est « à trier » quelques secondes
                #   AVANT que son score ne soit écrit : le rejet automatique la
                #   jugeait à 0/100 et l'écartait. Rien ne presse cinq minutes.
                if not self.est_occupe():
                    self._entretenir(config)
                    if self._publier_auto(config):
                        continue
                    if self._moissonner(config):
                        continue
                    if self._prospecter_sources(config):
                        continue
                self._verifier()
            except Exception as e:
                base.logguer(f"Planificateur : {e}", "erreur")

    # -- Ce qui ne touche à rien d'extérieur --------------------------------
    def _entretenir(self, config: dict) -> None:
        if not automate.est_du(config):
            return
        automate.noter_entretien()
        automate.entretien(config)

    # -- Publication automatique --------------------------------------------
    def _publier_auto(self, config: dict) -> bool:
        """Publie les validées, dans la limite du plafond du jour."""
        if not self.lancer_tache or not config.get("auto_publier"):
            return False
        a_faire = automate.publiables(config)
        if not a_faire:
            return False

        from . import publication

        def travail():
            reussies = 0
            for tid in a_faire:
                try:
                    publication.publier(tid)
                    automate.noter_publication_auto()
                    reussies += 1
                except Exception as e:
                    base.logguer(
                        f"Publication automatique refusée pour {tid[:8]} : {e}",
                        "erreur",
                    )
            base.logguer(
                f"Publication automatique : {reussies}/{len(a_faire)} trouvaille(s) "
                "mise(s) en ligne.", "succes" if reussies else "avert",
            )

        base.logguer(
            f"Publication automatique — {len(a_faire)} trouvaille(s) validée(s) "
            "partent en ligne.", "info",
        )
        return bool(self.lancer_tache("publication", travail))

    # -- Recherche de sites web ---------------------------------------------
    def _moissonner(self, config: dict) -> bool:
        if not self.lancer_tache or not automate.moisson_due(config):
            return False

        from . import toile

        def travail():
            toile.moissonner(avec_osm=bool(config.get("moisson_osm", True)))
            automate.noter_moisson()

        base.logguer("Recherche automatique des sites web des établissements.", "info")
        return bool(self.lancer_tache("moisson", travail))

    def _prospecter_sources(self, config: dict) -> bool:
        """Cherche de nouveaux groupes et pages, sans rien adopter d'office.

        Les candidats attendent dans l'onglet « Nouvelles sources » : ajouter
        une source toute seule allonge chaque collecte, et une source muette
        coûte le même temps qu'une bonne.
        """
        if not self.lancer_tache or not automate.prospection_sources_due(config):
            return False

        # 🔴 RÈGLE DU 03/09/2026 : cette recherche ouvre Chromium, exactement
        #   comme la tournée — donc même garde. Rien n'est noté : elle reste
        #   due et partira d'elle-même quand la session s'éteindra. Dite une
        #   fois par jour, pas à chaque tour d'horloge.
        from . import session_claude
        session = session_claude.active()
        if session:
            jour = date.today().isoformat()
            if getattr(self, "_prospection_suspendue", None) != jour:
                self._prospection_suspendue = jour
                base.logguer(
                    f"Recherche automatique de sources reportée — {session} "
                    "(règle du 03/09). Elle partira quand la session s'éteindra.",
                    "info")
            return False

        from . import collecteur as col

        def travail():
            col.collecteur.prospecter_sources()
            automate.noter_prospection_sources()

        base.logguer("Recherche automatique de nouvelles sources Facebook.", "info")
        return bool(self.lancer_tache("prospection_sources", travail))

    def _verifier(self, maintenant: datetime | None = None) -> None:
        config = charger()
        if not config.get("collecte_auto"):
            return
        heures = _heures(config)
        if not heures:
            return

        maintenant = maintenant or datetime.now()
        # 🔴 UN CRÉNEAU RESTE DÛ JUSQU'À L'ARRIVÉE DU SUIVANT. Avant le
        #   02/09/2026, il n'était rattrapable que 30 minutes : le PC a redémarré
        #   brutalement trois fois ce jour-là (11 h 11, 13 h 23, 19 h 01), et un
        #   bot relevé à 11 h 48 laissait passer la collecte de 11 h. Un bot qui
        #   revient rattrape ce qu'il a manqué ; il ne rattrape jamais deux
        #   créneaux d'un coup, le suivant sera dû à son heure.
        creneau = creneau_du(heures, maintenant)
        if not creneau:
            return  # avant le premier passage de la journée

        marque = f"{maintenant.date().isoformat()} {creneau}"
        if base.lire_etat(CLE_DERNIER) == marque:
            return  # déjà fait
        if self.est_occupe():
            return  # on retentera dans 30 s

        # 🔴 RÈGLE POSÉE PAR ANDRY LE 03/09/2026 : pas de tournée automatique
        #   tant qu'une session Claude tourne sur ce PC — c'est Chromium qui
        #   mange la RAM (événement Windows 2004 à 11 h 10, navigateur AKORA
        #   perdu à 852 Mo libres). La marque n'est pas écrite : le créneau
        #   reste dû, `creneau_du` le fait partir quand la session s'éteint.
        from . import session_claude
        session = session_claude.active()
        if session:
            if getattr(self, "_suspendu_pour", None) != marque:
                self._suspendu_pour = marque
                base.logguer(
                    f"Collecte de {creneau} suspendue — {session}. Elle partira "
                    "d'elle-même quand la session s'éteindra (règle du 03/09).",
                    "info")
            return

        # ⚠ LA MARQUE APRÈS LE LANCEMENT, ET SEULEMENT S'IL A PRIS. `lancer_collecte`
        #   rend False quand la ressource « navigateur » est déjà occupée
        #   (prospection, fenêtre de connexion) ; marquer avant brûlait le
        #   créneau sans rien collecter.
        if self._declencher(config, creneau, heures):
            base.ecrire_etat(CLE_DERNIER, marque)

    def _declencher(self, config: dict, creneau: str, heures: list[str]) -> bool:
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
        parti = bool(self.lancer_collecte(reglages))
        if not parti:
            base.logguer(
                f"Collecte de {creneau} : le navigateur est occupé, nouvel essai "
                "dans 30 s.", "avert",
            )
        return parti

    def fermer(self) -> None:
        self.arret.set()


def creneau_du(heures: list[str], maintenant: datetime) -> str:
    """Le créneau DÛ à cet instant : le dernier dont l'heure est passée aujourd'hui.

    `heures` est triée (voir `_heures`). Avant le premier passage : `''`.
    Un créneau reste dû jusqu'à l'arrivée du suivant, puis jusqu'à minuit pour
    le dernier de la journée : c'est ce qui permet à un bot relevé à 14 h 48 de
    faire la collecte de 11 h au lieu de l'abandonner.
    """
    du = ""
    for heure in heures:
        moment = datetime.combine(
            maintenant.date(), datetime.strptime(heure, "%H:%M").time()
        )
        if moment <= maintenant:
            du = heure
    return du


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
        "automatisation": automate.resume(config),
    }
