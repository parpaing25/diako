"""Un rejet dit toujours pourquoi, et quand.

🔴 L'INCIDENT. Au 04/09/2026, `data/bot.db` comptait 1 420 trouvailles rejetées
   dont **1 380 sans le moindre motif** — 1 012 récits, 306 établissements. Et
   ces rejets muets n'étaient pas des cas désespérés : 318 d'entre eux étaient
   notés 51/100 ou plus, 935 entre 21 et 50. Le seul rejet automatique écrit son
   motif (« score 12/100, seuil 20 ») ; le tri à la main, lui, changeait le
   statut sans un mot.

   Conséquence : impossible de savoir si le bot écarte bien ou mal, impossible
   de contester une décision, impossible d'améliorer le classement. Le bot
   paraissait simplement jeter les trois quarts de ce qu'il ramenait.

    python -m pytest tests/test_rejet_motive.py -q
"""
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from bot import base  # noqa: E402
from bot import serveur  # noqa: E402


def _base_jetable():
    """Base neuve. On ne touche JAMAIS data/bot.db : le bot tourne sur 8757."""
    dossier = Path(tempfile.mkdtemp(prefix="diako-rejet-"))
    base.BASE = dossier / "essai.db"
    base.DOSSIER_DONNEES = dossier
    base.initialiser()
    return dossier


def _trouvaille(nom: str, **reste) -> str:
    """Une trouvaille d'établissement, prête à être triée."""
    champs = {
        "permalien": f"https://facebook.test/{nom}", "source_nom": "Essai",
        "source_genre": "page", "texte": f"Publication de {nom}",
        "genre": "etablissement", "nom_etab": nom, "statut": "a_trier",
        "score": 62, "titre": nom,
    }
    champs.update(reste)
    return base.creer(champs)


def test_un_rejet_a_la_main_ecrit_son_motif_et_sa_date():
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        tid = _trouvaille("Hôtel de la Mer")

        client = TestClient(serveur.app)
        reponse = client.post("/api/trouvailles/lot-choisi",
                              json={"ids": [tid], "action": "rejeter"})
        assert reponse.status_code == 200, reponse.text
        assert reponse.json()["nombre"] == 1

        apres = base.trouvaille(tid)
        assert apres["statut"] == "rejetee"
        assert apres["note"], "un rejet sans motif est un rejet qu'on ne peut pas examiner"
        assert "à la main" in apres["note"]
        assert date.today().strftime("%d/%m/%Y") in apres["note"]
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


def test_un_motif_deja_ecrit_n_est_jamais_recouvert():
    """La raison précise vaut mieux que la formule générale : on ne l'écrase pas."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        tid = _trouvaille("Vente de matelas",
                          note="Hors sujet (vente d'objets) — repéré à la lecture.")

        client = TestClient(serveur.app)
        client.post("/api/trouvailles/lot-choisi", json={"ids": [tid], "action": "rejeter"})

        apres = base.trouvaille(tid)
        assert apres["statut"] == "rejetee"
        assert apres["note"] == "Hors sujet (vente d'objets) — repéré à la lecture."
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


def test_une_validation_a_la_main_se_trace_aussi():
    """Savoir qu'une trouvaille est passée par une main, c'est savoir la relire."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        tid = _trouvaille("Camp Catta", lieu_id="lieu-1", page_id="page-1")

        client = TestClient(serveur.app)
        reponse = client.post("/api/trouvailles/lot-choisi",
                              json={"ids": [tid], "action": "valider"})
        assert reponse.status_code == 200, reponse.text

        apres = base.trouvaille(tid)
        if apres["statut"] == "validee":
            assert "à la main" in (apres["note"] or "")
        else:
            # Refusée faute d'être publiable : c'est l'autre garde-fou, et il
            # doit dire ce qui manque plutôt que de valider une illusion.
            assert reponse.json()["refuses"], "un refus doit nommer ce qui manque"
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier
