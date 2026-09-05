"""Les trouvailles restées « en lecture » après un arrêt du bot sont retirées.

Le 02/09/2026, 311 lignes dormaient dans cet état depuis dix jours : créées par
le navigateur, jamais terminées par l'atelier parce que la machine avait tué le
bot entre les deux. Aucun écran ne les montrait, et leur empreinte empêchait la
même publication d'être recollectée.
"""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import base  # noqa: E402


def _base_jetable():
    dossier = Path(tempfile.mkdtemp())
    ancienne = (base.BASE, base.DOSSIER_DONNEES)
    base.BASE, base.DOSSIER_DONNEES = dossier / "essai.db", dossier
    base.initialiser()
    return dossier, ancienne


def test_les_interrompues_anciennes_sont_retirees_avec_leur_dossier():
    dossier, ancienne = _base_jetable()
    try:
        vieux = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(timespec="seconds")
        (dossier / "trouvailles" / "2026-09-02" / "abcd").mkdir(parents=True)
        (dossier / "trouvailles" / "2026-09-02" / "abcd" / "publication.txt").write_text("x")
        tid = base.creer({"empreinte": "p1", "texte": "t", "statut": "en_traitement",
                          "collecte_le": vieux, "dossier": "trouvailles/2026-09-02/abcd"})
        base.ajouter_photo(tid, "photo01.jpg")
        # Une trouvaille terminée, même ancienne, n'est pas touchée.
        base.creer({"empreinte": "p2", "texte": "t", "statut": "a_trier", "collecte_le": vieux})
        # Une lecture en cours (fraîche) non plus.
        base.creer({"empreinte": "p3", "texte": "t", "statut": "en_traitement"})

        assert base.purger_interrompues(age_minutes=30) == 1
        assert base.trouvaille(tid) is None
        assert not (dossier / "trouvailles" / "2026-09-02" / "abcd").exists()
        assert base.compteurs()["en_traitement"] == 1
        assert base.compteurs()["a_trier"] == 1
        # L'empreinte est libre : la publication peut être recollectée.
        assert base.creer({"empreinte": "p1", "texte": "t"}) != ""
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne


def test_rien_a_purger_rend_zero():
    _, ancienne = _base_jetable()
    try:
        assert base.purger_interrompues() == 0
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne
