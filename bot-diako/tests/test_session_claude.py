"""Règle du 03/09/2026 : pas de Chromium automatique pendant une session Claude.

Le garde du planificateur ne couvrait que la tournée ; la recherche
automatique de sources ouvre le même Chromium. Et « Arrêter » doit couper
une prospection en cours, pas seulement la tournée.

    python -m pytest tests/test_session_claude.py -q

Aucun test ici ne touche la base ni le journal.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import planificateur as plan  # noqa: E402
from bot import session_claude  # noqa: E402
from bot import sources_prospection as sp  # noqa: E402


def _planificateur(lances):
    p = plan.Planificateur.__new__(plan.Planificateur)
    p.lancer_tache = lambda genre, travail: lances.append(genre) or True
    return p


def test_la_recherche_automatique_de_sources_attend_la_fin_de_la_session(monkeypatch):
    dits = []
    monkeypatch.setattr(plan.automate, "prospection_sources_due", lambda cfg: True)
    monkeypatch.setattr(plan.base, "logguer", lambda m, *a, **k: dits.append(m))
    monkeypatch.setattr(session_claude, "active",
                        lambda *_a, **_k: "1 session(s) Claude active(s) sur ce PC")
    lances = []
    p = _planificateur(lances)
    assert p._prospecter_sources({}) is False
    assert p._prospecter_sources({}) is False
    assert lances == []
    assert len([m for m in dits if "reportée" in m]) == 1, "dit une fois, pas toutes les 30 s"

    monkeypatch.setattr(session_claude, "active", lambda *_a, **_k: None)
    assert p._prospecter_sources({}) is True
    assert lances == ["prospection_sources"]


class _Onglet:
    """Un onglet Playwright de carton : il note les visites et ne trouve rien."""

    def __init__(self):
        self.visites = []

    def goto(self, url, **_kw):
        self.visites.append(url)

    def wait_for_timeout(self, _ms):
        pass

    class mouse:                                   # noqa: N801 — imite Playwright
        @staticmethod
        def wheel(_x, _y):
            pass

    def evaluate(self, _js):
        return []

    def is_closed(self):
        return False


def _prospection_sans_base(monkeypatch):
    monkeypatch.setattr(sp.base, "urls_sources", lambda: set())
    monkeypatch.setattr(sp.base, "candidats_ecartes", lambda: set())
    monkeypatch.setattr(sp.base, "logguer", lambda *a, **k: None)
    monkeypatch.setattr(sp.time, "sleep", lambda _s: None)


def test_l_ordre_d_arret_interrompt_la_prospection(monkeypatch):
    _prospection_sans_base(monkeypatch)
    onglet = _Onglet()
    reponses = iter([False, True, True, True])
    resultat = sp.prospecter(onglet, requetes=["hotel Nosy Be"], config={},
                             arreter=lambda: next(reponses))
    assert len(onglet.visites) == 1
    assert resultat == []


def test_sans_ordre_d_arret_la_prospection_va_au_bout(monkeypatch):
    _prospection_sans_base(monkeypatch)
    onglet = _Onglet()
    sp.prospecter(onglet, requetes=["hotel Nosy Be"], config={})
    assert len(onglet.visites) == 2
