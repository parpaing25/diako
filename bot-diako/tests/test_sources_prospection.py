"""Garde-fous sur la prospection de sources.

Chaque cas vient d'un vrai résultat de recherche Facebook du 23/08/2026, et
chacun a été un défaut avant d'être un test.

    python tests/test_sources_prospection.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import sources_prospection as sp  # noqa: E402


def _c(**kw):
    base = {"nom": "", "effectif": None, "rythme_par_jour": None,
            "genre": "groupe", "prive": False, "lieu": "", "categorie": ""}
    base.update(kw)
    return base


# -- Lecture des chiffres affichés par Facebook -----------------------------
def test_les_milliers_abreges():
    """« 126 K membres » vaut 126 000, pas 126."""
    assert sp.lire_effectif("Public · 126 K membres") == 126_000
    assert sp.lire_effectif("Privé · 1,2 K membres") == 1_200
    assert sp.lire_effectif("Agent immobilier · 887 followers") == 887
    assert sp.lire_effectif("Public · 1 234 membres") == 1_234
    assert sp.lire_effectif("aucun chiffre ici") is None


def test_le_rythme_de_publication():
    assert sp.lire_rythme("· Plus de 90 publications par jour") == 90
    assert sp.lire_rythme("· 14 publications par jour") == 14
    assert sp.lire_rythme("Agent immobilier · 887 followers") is None


def test_public_ou_prive():
    assert sp.est_prive("Groupe privé · 3 K membres") is True
    assert sp.est_prive("Public · 3 K membres") is False


# -- Le piège des polices fantaisie ----------------------------------------
def test_les_polices_fantaisie_de_facebook():
    """« 𝙏𝙍𝘼𝙉𝙊 𝘼𝙃𝙊𝙁𝘼 » est un vrai nom de page, avec 40 000 abonnés.

    En NFD ces caractères restent intacts, aucun mot du métier n'est reconnu
    et la page tombait à 40/100 : elle serait passée à la trappe.
    """
    assert sp._sans_accents("𝙃𝙊𝙏𝙀𝙇 𝙈𝘼𝘿𝘼") == "hotel mada"
    note = sp.noter(_c(nom="𝙃𝙊𝙏𝙀𝙇 𝙈𝘼𝘿𝘼", effectif=40_000, genre="page",
                       categorie="Hôtel"), [])
    assert note["note"] >= 75, note


# -- Ce que la note doit trancher ------------------------------------------
def test_un_gros_groupe_tres_actif_passe_devant():
    fort = sp.noter(_c(nom="Tourisme Nosy Be Madagascar", effectif=68_000,
                       rythme_par_jour=90, lieu="Madagascar"), [])
    faible = sp.noter(_c(nom="Tourisme Nosy Be Madagascar", effectif=300,
                         rythme_par_jour=1, lieu="Madagascar"), [])
    assert fort["note"] > faible["note"] + 30, (fort["note"], faible["note"])


def test_la_taille_departage_a_rythme_egal():
    """Facebook plafonne l'affichage à « plus de 90 par jour ».

    Sans échelle continue sur la taille, tous les gros groupes se tassaient
    à 100 et le classement devenait arbitraire.
    """
    gros = sp.noter(_c(nom="hotel restaurant madagascar", effectif=122_000, rythme_par_jour=90), [])
    moyen = sp.noter(_c(nom="hotel restaurant madagascar", effectif=6_000, rythme_par_jour=90), [])
    assert gros["note_brute"] > moyen["note_brute"]


def test_la_categorie_facebook_prime_sur_le_nom():
    """Un nom qui parle de sortie, une catégorie qui dit « Coach »."""
    note = sp.noter(_c(nom="Sortie et bien-etre", effectif=3_000, genre="page",
                       categorie="Coach personnel"), [])
    assert note["note"] < 45, note
    assert any("Coach personnel" in a for a in note["alertes"])


def test_un_groupe_d_emploi_est_signale():
    """« tolotr'asa » = offre d'emploi : 298 000 membres, et hors sujet."""
    note = sp.noter(_c(nom="tolotr'asa , restauration, hôtellerie",
                       effectif=298_000, rythme_par_jour=90), [])
    assert any("tolotr'asa" in a for a in note["alertes"]), note["alertes"]


def test_un_groupe_prive_est_signale_et_penalise():
    ouvert = sp.noter(_c(nom="tourisme madagascar", effectif=20_000, rythme_par_jour=60), [])
    ferme = sp.noter(_c(nom="tourisme madagascar", effectif=20_000, rythme_par_jour=60,
                        prive=True), [])
    assert ferme["note"] < ouvert["note"]
    assert any("rejoindre" in a for a in ferme["alertes"])


def test_le_hors_sujet_tombe_bas():
    note = sp.noter(_c(nom="Motards francophones de Barcelone", effectif=400), [])
    assert note["note"] < 30, note


# -- Sources repérées sur le fil : la note vient de ce qu'elles ont donné ---
def test_le_rendement_observe_prime_sur_la_taille():
    """Un petit groupe qui donne beaucoup bat un gros qui ne donne rien."""
    utile = sp.noter(_c(nom="X", effectif=800, vues=12, retenues=9, publiees=3), [])
    sterile = sp.noter(_c(nom="X", effectif=120_000, vues=14, retenues=1), [])
    assert utile["note"] > sterile["note"] + 40, (utile["note"], sterile["note"])
    assert utile.get("observee") and sterile.get("observee")


def test_une_source_sterile_est_signalee():
    n = sp.noter(_c(nom="Groupe bavard", vues=9, retenues=0), [])
    assert n["note"] == 0
    assert any("perdre du temps" in a for a in n["alertes"]), n["alertes"]


def test_les_publiees_pesent_le_plus_lourd():
    """Une annonce arrivée en ligne est la seule preuve solide."""
    sans = sp.noter(_c(nom="X", vues=10, retenues=6, publiees=0), [])
    avec = sp.noter(_c(nom="X", vues=10, retenues=6, publiees=3), [])
    assert avec["note"] > sans["note"] + 15, (sans["note"], avec["note"])


def test_trop_peu_d_observations_ne_donne_pas_zero():
    """Un 0/100 se lirait « mauvaise » alors qu'on ne sait rien d'elle."""
    n = sp.noter(_c(nom="Groupe croisé une fois", origine="fil",
                    vues=1, retenues=1), [])
    assert n["note"] is None, n
    assert n["niveau"] == "observation"
    assert any("3" in a for a in n["alertes"])


def test_le_rendement_ne_compte_pas_deux_fois_une_retenue():
    """La vue est comptée avant le tri, la retenue après.

    Compter la vue une seconde fois au moment de la retenue ferait tomber le
    rendement d'un groupe parfait à 50 %.
    """
    parfait = sp.noter(_c(nom="X", vues=5, retenues=5), [])
    assert parfait["details"][0]["motif"].startswith("5 retenue(s) sur 5 vue(s)")
    assert parfait["details"][0]["points"] == 45


if __name__ == "__main__":
    rates = 0
    for nom, fonction in sorted(globals().items()):
        if not nom.startswith("test_"):
            continue
        try:
            fonction()
            print(f"  ok    {nom}")
        except AssertionError as e:
            rates += 1
            print(f"  ECHEC {nom}  {e}")
    print(f"\n{rates} echec(s)")
    sys.exit(1 if rates else 0)
