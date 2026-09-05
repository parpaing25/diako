"""Une fiche que le bot vient de créer doit exister, tout de suite, pour lui.

🔴 L'INCIDENT. Le cache local des fiches (`ref_pages`) ne se remplissait qu'en
   bloc, toutes les douze heures. Une fiche créée par le bot n'y entrait donc
   pas : la publication suivante du même établissement ne la retrouvait pas, et
   le bot en créait une deuxième, puis une troisième.

   Mesuré dans la base Diako le 04/09/2026, sur les 334 fiches écrites depuis le
   16/08 : **250 noms distincts seulement**, soit 84 fiches en trop. Les
   champions : « Hotel Restaurant Dera » 25 fois, « Hôtel de la Mer » 17 fois,
   « Hotel Restaurant Dera Antsirabe » 8 fois de plus — 33 fiches pour un seul
   hôtel d'Antsirabe. Le bot avait été écrit pour REMPLIR les 3 689 fiches
   existantes, pas pour en fabriquer une par publication.

    python -m pytest tests/test_referentiel_vivant.py -q
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import base  # noqa: E402
from bot import diako  # noqa: E402


def _base_jetable():
    """Une base SQLite neuve. On ne touche JAMAIS data/bot.db : le bot tourne."""
    dossier = Path(tempfile.mkdtemp(prefix="diako-ref-"))
    base.BASE = dossier / "essai.db"
    base.DOSSIER_DONNEES = dossier
    base.initialiser()
    return dossier


def _fiche(identifiant: str, nom: str, **reste) -> dict:
    """Une ligne de `ref_pages`, dans la forme exacte du chargement en masse."""
    ligne = {
        "id": identifiant, "nom": nom, "jeu": diako.jeu(nom), "slug": None,
        "categories": "{hotel}", "lieu_id": None, "lieu_nom": None,
        "telephone": None, "cover_url": None, "site_web": None,
        "nb_carte": 0, "nb_chambre": 0,
    }
    ligne.update(reste)
    return ligne


def test_une_fiche_ajoutee_est_trouvee_par_le_rapprochement():
    """Le cœur du défaut : « Hôtel de la Mer » ne doit être créé qu'une fois."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        # Le référentiel du matin : l'hôtel n'y est pas encore.
        base.remplacer_referentiel("ref_pages", [
            _fiche("11111111-1111-1111-1111-111111111111", "Chez Denise"),
            _fiche("22222222-2222-2222-2222-222222222222", "Camp Catta"),
        ])
        assert diako.rapprocher_page("Hôtel de la Mer") == []

        # Le bot publie la première trouvaille : la fiche est créée EN BASE et
        # entre au référentiel dans la foulée.
        base.ajouter_au_referentiel("ref_pages", _fiche(
            "33333333-3333-3333-3333-333333333333", "Hôtel de la Mer",
            telephone="034 12 345 67",
        ))

        # La publication suivante du même hôtel, quelques minutes plus tard,
        # doit RETROUVER la fiche — c'est tout l'objet du correctif.
        trouvees = diako.rapprocher_page("Hôtel de la Mer")
        assert [f["id"] for f in trouvees] == ["33333333-3333-3333-3333-333333333333"]

        # Et la variante du nom, telle qu'elle apparaît sur Facebook.
        variantes = diako.rapprocher_page("Hôtel de la Mer - Nosy Be")
        assert variantes and variantes[0]["id"] == "33333333-3333-3333-3333-333333333333"
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


def test_ajouter_deux_fois_la_meme_fiche_ne_la_duplique_pas():
    """Republier un établissement met la fiche à jour, il n'en crée pas une autre."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        base.remplacer_referentiel("ref_pages", [_fiche("aaaa", "Chez Denise")])

        base.ajouter_au_referentiel("ref_pages", _fiche("bbbb", "Hotel Restaurant Dera"))
        base.ajouter_au_referentiel("ref_pages", _fiche(
            "bbbb", "Hotel Restaurant Dera", cover_url="https://exemple/photo.jpg",
        ))

        fiches = base.referentiel("ref_pages")
        assert len(fiches) == 2, "la même fiche ne doit occuper qu'une ligne"
        dera = [f for f in fiches if f["id"] == "bbbb"][0]
        assert dera["cover_url"] == "https://exemple/photo.jpg", "la photo arrivée après doit être gardée"
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


def test_le_referentiel_refuse_une_table_inconnue_et_une_fiche_sans_identifiant():
    """Un cache mal alimenté ferait croire qu'une fiche n'existe pas."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        try:
            base.ajouter_au_referentiel("trouvailles", {"id": "x"})
            raise AssertionError("une table hors référentiel doit être refusée")
        except ValueError:
            pass
        # Sans identifiant, on ne peut pas remplacer proprement : on ne fait rien.
        base.ajouter_au_referentiel("ref_pages", {"id": "", "nom": "Sans identité", "jeu": ""})
        assert base.referentiel("ref_pages") == []
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier
