"""Le tri des fiches oubliées : ce qu'on publie, ce qu'on laisse, et pourquoi.

Ces règles décident du sort de 334 fiches écrites par le bot entre le 16/08 et
le 01/09/2026, restées invisibles sur Diako. Elles ne sont pas des goûts : chaque
seuil vient d'une mesure faite le 04/09/2026, et deux d'entre elles corrigent une
erreur que la première version de l'outil a réellement commise.

🔴 L'ERREUR À NE PAS REFAIRE. Le rapprochement par « les mots de l'un sont tous
   dans l'autre » semblait juste. Mesuré : sur 124 fiches écartées comme « déjà
   en ligne », **118 l'étaient sur un seul mot banal** — « A-Vezo Tours » contre
   « Vezo Hôtel », « 301 mi Voyage » contre « Mi Hôtel », « Abdou Nosy Be Guide »
   contre « Nosy Be Hôtel ». Trois établissements distincts à chaque fois. Un
   rapprochement trop large ne protège plus de rien : il supprime.

    python -m pytest tests/test_fiches_oubliees.py -q
"""
import importlib.util
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))

_spec = importlib.util.spec_from_file_location(
    "outil_fiches_oubliees", RACINE / "outils" / "publier_fiches_oubliees.py")
outil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(outil)


def fiche(nom, completude=75, photo=True, contact=True, publiee=False):
    return {"id": nom, "name": nom, "completeness": completude,
            "cover_url": photo, "contact": contact, "deja_publiee": publiee}


# ════════════════════════════════════════════════════════════════════════════
# Ce qui n'est pas une enseigne
# ════════════════════════════════════════════════════════════════════════════
def test_un_nom_sans_mot_distinctif_n_est_pas_une_enseigne():
    """« Madagascar » ne désigne aucun établissement : que des mots de géographie."""
    assert outil.motif_d_ecart(fiche("Madagascar"))
    assert outil.motif_d_ecart(fiche("Hôtel")) is not None
    assert outil.motif_d_ecart(fiche("Madiro Hotel")) is None


def test_les_annonces_de_logement_restent_chez_fonenako():
    """Diako est le voyage ; louer un appartement au mois est un autre métier."""
    for nom in ("MAISON BASSE À LOUER ANDRONDRA",
                "APPARTEMENT MEUBLÉ À LOUER – AMBONARA",
                "BELLE APPARTEMENT 1ÈRE À LOUER AMBOHITSO"):
        assert outil.motif_d_ecart(fiche(nom)), nom


def test_une_phrase_d_accroche_n_est_pas_un_nom():
    for nom in ("Envie d'aventure et d'authenticité ?",
                "COME AND DISCOVER NOSY SAKATIA!",
                "Des fans de #Viennoiseries ?"):
        assert outil.motif_d_ecart(fiche(nom)), nom


def test_un_titre_crie_en_capitales_est_une_offre_pas_une_enseigne():
    assert outil.motif_d_ecart(fiche("EXCURSION UNE JOURNNÉE MANDRAKA MANTASOA"))
    # Trois mots en capitales : un nom malgache, pas un titre. On le garde.
    assert outil.motif_d_ecart(fiche("TRAGNO VATO AFONDRO")) is None


def test_une_fiche_maigre_attend_d_etre_completee():
    assert outil.motif_d_ecart(fiche("Domaine Alpha", 35, photo=False, contact=False))
    # La même, avec une photo : elle a quelque chose à montrer.
    assert outil.motif_d_ecart(fiche("Domaine Alpha", 35, photo=True, contact=False)) is None


# ════════════════════════════════════════════════════════════════════════════
# Le même établissement, écrit autrement
# ════════════════════════════════════════════════════════════════════════════
def test_deux_ecritures_du_meme_nom_sont_le_meme_etablissement():
    mots = outil.mots_distinctifs
    assert outil.meme_etablissement(mots("Mada Infinity Tour"), mots("Mada Infinity Tours"))
    assert outil.meme_etablissement(mots("Djema Forest"), mots("Djema Forest Tour"))


def test_un_seul_mot_banal_en_commun_ne_fait_pas_un_doublon():
    """L'erreur mesurée : 118 exclusions fausses sur un mot partagé et banal."""
    mots = outil.mots_distinctifs
    couples = [("A-Vezo Tours", "Vezo Hôtel"),
               ("301 mi Voyage", "Mi Hôtel"),
               ("Abdou Nosy Be Guide", "Nosy Be Hôtel"),
               ("Ampasoa Beach", "Beach Bar")]
    for a, b in couples:
        assert not outil.meme_etablissement(mots(a), mots(b)), f"{a} / {b}"


def test_un_seul_mot_RARE_en_commun_suffit():
    """« Baboo » ne sert qu'à un établissement : c'est bien le même."""
    mots = outil.mots_distinctifs
    rares = frozenset({"baboo", "sarimanok"})
    assert outil.meme_etablissement(mots("Hôtel BABOO Village"), mots("Baboo Village"), rares)
    assert outil.meme_etablissement(
        mots("Hôtel & Résidence Sarimanok- Madagascar"), mots("Le Sarimanok"), rares)


# ════════════════════════════════════════════════════════════════════════════
# Le tri complet
# ════════════════════════════════════════════════════════════════════════════
def test_le_tri_garde_la_plus_complete_et_laisse_les_autres():
    fiches = [
        fiche("Hotel Restaurant Dera", 90),
        fiche("Hotel Restaurant Dera", 45, photo=False),
        fiche("Hotel Restaurant Dera Antsirabe", 60),
        fiche("Camp Catta", 60),
    ]
    a_publier, ecartees = outil.choisir(fiches, noms_en_ligne=[])

    noms = sorted(f["name"] for f in a_publier)
    assert noms == ["Camp Catta", "Hotel Restaurant Dera"], noms
    assert len(ecartees) == 2
    assert all("doublon interne" in motif for _, motif in ecartees)
    # La retenue est bien la mieux remplie des trois.
    dera = [f for f in a_publier if f["name"].startswith("Hotel Restaurant Dera")][0]
    assert dera["completeness"] == 90


def test_le_tri_ne_republie_pas_ce_qui_est_deja_en_ligne():
    fiches = [fiche("Chez Jeanne", 80), fiche("Nouvel Eden", 70)]
    a_publier, ecartees = outil.choisir(fiches, noms_en_ligne=["Chez Jeanne"])

    assert [f["name"] for f in a_publier] == ["Nouvel Eden"]
    assert ecartees and "déjà en ligne" in ecartees[0][1]


def test_une_fiche_deja_visible_n_est_jamais_retouchee():
    fiches = [fiche("Madiro Hotel", 100, publiee=True)]
    a_publier, ecartees = outil.choisir(fiches, noms_en_ligne=["Madiro Hotel"])
    assert a_publier == [] and ecartees == []
