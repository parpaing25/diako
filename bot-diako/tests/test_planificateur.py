"""Le planificateur : un créneau manqué se rattrape, il ne se perd pas.

Le 02/09/2026, le PC a redémarré brutalement trois fois (journaux Windows :
11 h 11, 13 h 23, 19 h 01). Le bot relevé par le gardien à 11 h 48 ne faisait
plus la collecte de 11 h : la fenêtre de rattrapage était de 30 minutes.
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import planificateur as plan  # noqa: E402

HEURES = ["11:00", "18:00"]


def test_avant_le_premier_passage_rien_n_est_du():
    assert plan.creneau_du(HEURES, datetime(2026, 9, 2, 8, 30)) == ""


def test_a_l_heure_pile_le_creneau_est_du():
    assert plan.creneau_du(HEURES, datetime(2026, 9, 2, 11, 0)) == "11:00"


def test_un_bot_releve_a_14h48_rattrape_la_collecte_de_11h():
    assert plan.creneau_du(HEURES, datetime(2026, 9, 2, 14, 48)) == "11:00"


def test_apres_le_dernier_passage_c_est_lui_qui_est_du_jusqu_a_minuit():
    assert plan.creneau_du(HEURES, datetime(2026, 9, 2, 23, 59)) == "18:00"


def test_on_ne_rattrape_jamais_deux_creneaux_d_un_coup():
    # À 18 h 05, seul 18:00 est dû : la collecte de 11 h manquée est perdue,
    # mais celle de 18 h part — et c'est la plus profonde de la journée.
    assert plan.creneau_du(HEURES, datetime(2026, 9, 2, 18, 5)) == "18:00"


def test_verifier_declenche_une_seule_fois_par_creneau(monkeypatch):
    etat = {}
    lancements = []
    monkeypatch.setattr(plan, "charger", lambda: {
        "collecte_auto": True, "heures_collecte": HEURES, "objectif_par_jour": 0,
        "scrolls_max_par_source": 25, "posts_max_par_source": 40,
    })
    monkeypatch.setattr(plan.base, "lire_etat", lambda cle: etat.get(cle))
    monkeypatch.setattr(plan.base, "ecrire_etat", lambda cle, v: etat.__setitem__(cle, v))
    monkeypatch.setattr(plan.base, "logguer", lambda *a, **k: None)
    monkeypatch.setattr(plan, "collectees_aujourdhui", lambda: 0)

    p = plan.Planificateur.__new__(plan.Planificateur)
    # Comme le vrai serveur : True quand la collecte est partie.
    p.lancer_collecte = lambda reglages: (lancements.append(reglages), True)[1]
    p.est_occupe = lambda: False
    p.lancer_tache = None

    p._verifier(datetime(2026, 9, 2, 14, 48))   # relevé après le redémarrage
    p._verifier(datetime(2026, 9, 2, 15, 20))   # tour suivant : déjà fait
    assert lancements == [None]
    assert etat[plan.CLE_DERNIER] == "2026-09-02 11:00"

    p._verifier(datetime(2026, 9, 2, 18, 0, 20))
    assert len(lancements) == 2
    assert etat[plan.CLE_DERNIER] == "2026-09-02 18:00"


def test_verifier_attend_si_une_tache_occupe_le_bot(monkeypatch):
    etat = {}
    lancements = []
    monkeypatch.setattr(plan, "charger", lambda: {
        "collecte_auto": True, "heures_collecte": HEURES, "objectif_par_jour": 0,
        "scrolls_max_par_source": 25, "posts_max_par_source": 40,
    })
    monkeypatch.setattr(plan.base, "lire_etat", lambda cle: etat.get(cle))
    monkeypatch.setattr(plan.base, "ecrire_etat", lambda cle, v: etat.__setitem__(cle, v))
    monkeypatch.setattr(plan.base, "logguer", lambda *a, **k: None)
    monkeypatch.setattr(plan, "collectees_aujourdhui", lambda: 0)

    p = plan.Planificateur.__new__(plan.Planificateur)
    # Comme le vrai serveur : True quand la collecte est partie.
    p.lancer_collecte = lambda reglages: (lancements.append(reglages), True)[1]
    occupe = {"v": True}
    p.est_occupe = lambda: occupe["v"]
    p.lancer_tache = None

    p._verifier(datetime(2026, 9, 2, 11, 40))
    assert lancements == [] and plan.CLE_DERNIER not in etat   # rien de perdu
    occupe["v"] = False
    p._verifier(datetime(2026, 9, 2, 12, 10))                  # 70 min après : encore dû
    assert lancements == [None]
