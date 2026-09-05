"""Une carte de restaurant ne porte ni étiquette de prix, ni plat à 250 000 Ar.

🔴 L'INCIDENT, vu en production le 04/09/2026. Après la publication des fiches
   oubliées, la fiche « Vanila Hotel & Spa Nosy Be » annonçait sur le site
   **« À partir de 300 000 Ar le plat »**. Le montant venait d'une ligne de
   carte nommée « Adult rate » : le forfait journée d'un hôtel-spa, lu comme une
   assiette. La base promeut la ligne de carte la moins chère en prix d'appel de
   la fiche, donc une erreur de lecture devient le prix affiché en tête de page.

   Mesuré sur les 72 lignes de carte tarifées de Diako : médiane 25 000 Ar, et
   le plus cher plat RÉEL est un « Grand Buffet Complet » à 80 000 Ar. Au-dessus,
   tout était faux : « frites » à 250 000 Ar, « Prix » à 400 000 Ar. Quatre
   lignes de carte s'appelaient littéralement « Prix ».

   L'ancien plafond était de 500 000 Ar : il ne retenait rien.

    python -m pytest tests/test_carte_plausible.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import analyse_llm  # noqa: E402


def carte(*plats) -> dict:
    """Une transcription de carte, telle que le modèle la rend."""
    return {"est_une_carte": True, "devise": "Ar",
            "sections": [{"nom": "Plats", "plats": list(plats)}]}


def test_une_etiquette_de_prix_n_est_pas_un_plat():
    """« Prix » est le mot posé à côté du montant, pas le nom d'une assiette."""
    lignes = analyse_llm.plats_depuis_carte(carte(
        {"nom": "Prix", "prix_ar": 400_000},
        {"nom": "Adult rate", "prix_ar": 300_000},
        {"nom": "Romazava", "prix_ar": 12_000},
    ))
    assert [l["nom"] for l in lignes] == ["Romazava"]


def test_un_plat_a_250000_ariary_perd_son_prix_mais_garde_son_nom():
    """Le plat reste sur la carte ; c'est le montant invraisemblable qui tombe."""
    lignes = analyse_llm.plats_depuis_carte(carte({"nom": "frites", "prix_ar": 250_000}))
    assert len(lignes) == 1
    assert lignes[0]["nom"] == "frites"
    assert lignes[0]["prix_ar"] is None, "un prix faux ne vaut pas mieux qu'aucun prix"


def test_le_buffet_le_plus_cher_reellement_observe_passe_toujours():
    """80 000 Ar pour un « Grand Buffet Complet » : mesuré, légitime, gardé."""
    lignes = analyse_llm.plats_depuis_carte(carte(
        {"nom": "Grand Buffet Complet", "prix_ar": 80_000}))
    assert lignes[0]["prix_ar"] == 80_000


def test_les_bornes_basses_et_hautes():
    lignes = analyse_llm.plats_depuis_carte(carte(
        {"nom": "Café", "prix_ar": 500},
        {"nom": "Bonbon", "prix_ar": 100},
        {"nom": "Banquet", "prix_ar": 120_000},
        {"nom": "Séminaire", "prix_ar": 120_001},
    ))
    prix = {l["nom"]: l["prix_ar"] for l in lignes}
    assert prix == {"Café": 500, "Bonbon": None, "Banquet": 120_000, "Séminaire": None}


def test_une_carte_dans_une_autre_devise_n_est_pas_reprise():
    """Pas de conversion devinée : la règle du projet interdit d'inventer."""
    lecture = carte({"nom": "Menu du jour", "prix_ar": 15})
    lecture["devise"] = "EUR"
    assert analyse_llm.plats_depuis_carte(lecture) == []


def test_un_document_qui_n_est_pas_une_carte_ne_donne_aucun_plat():
    lecture = carte({"nom": "Romazava", "prix_ar": 12_000})
    lecture["est_une_carte"] = False
    assert analyse_llm.plats_depuis_carte(lecture) == []
