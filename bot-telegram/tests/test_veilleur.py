"""La tournée automatique s'efface quand le répondeur des pages du VPS tient Di'ako (11/11/2026).

Un seul répondeur par page : deux automates qui répondent au même fil se prennent l'un l'autre
pour un humain et répondent en double. Le banc fait tourner la VRAIE boucle du veilleur, comme le
serveur la lance, et compte les tournées. Le réseau est coupé : aucune tournée réelle ne part.
"""
import threading
import time
import urllib.request

import pytest

from bot import veilleur


@pytest.fixture
def boucle(monkeypatch, tmp_path):
    def refuse(*a, **k):
        raise AssertionError("un banc a tenté de sortir sur le réseau")
    monkeypatch.setattr(urllib.request, "urlopen", refuse)
    monkeypatch.setattr(veilleur, "FICHIER", tmp_path / "veille_page.json")
    monkeypatch.setattr(veilleur, "DRAPEAU_REPONDEUR_VPS", tmp_path / "repondeur-vps.actif")
    monkeypatch.setattr(veilleur, "PREMIER_REVEIL_S", 0)
    monkeypatch.setattr(veilleur, "INTERVALLE_MIN", 0.0005)          # 30 ms entre deux tours
    tours = []

    def lancer(duree=0.4):
        v = veilleur.Veilleur()
        monkeypatch.setattr(v, "passer_une_fois", lambda: tours.append(time.time()) or {})
        fil = threading.Thread(target=v._boucle, daemon=True)
        fil.start()
        time.sleep(duree)
        v.arreter()
        fil.join(2)
        return v
    return lancer, tours, tmp_path / "repondeur-vps.actif"


def test_sans_drapeau_la_tournee_tourne(boucle):
    lancer, tours, _ = boucle
    v = lancer()
    assert len(tours) >= 3 and v.etat()["au_repondeur_vps"] is False


def test_avec_le_drapeau_la_tournee_s_efface_et_le_dit(boucle):
    lancer, tours, drapeau = boucle
    drapeau.write_text("pose par la bascule", encoding="utf-8")
    v = lancer()
    assert tours == []
    assert v.etat()["au_repondeur_vps"] is True
    assert "répondeur des pages du VPS" in v.dernier["resume"]


def test_le_drapeau_se_relit_a_chaque_tour_sans_redemarrer(boucle):
    lancer, tours, drapeau = boucle
    drapeau.write_text("pose", encoding="utf-8")
    retrait = threading.Timer(0.2, drapeau.unlink)
    retrait.start()
    lancer(0.6)
    retrait.join()
    assert tours and min(tours) > 0                                  # reprise après le retrait
