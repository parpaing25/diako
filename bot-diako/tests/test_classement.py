"""Le classement du 03/09/2026 : ce qui va au fil, au calendrier, à la fiche, ou nulle part.

Décision d'Andry : le fil porte le VÉCU des voyageurs (lieu visité, parc, plat
goûté, mésaventure, belle photo) ; le calendrier porte les événements malgaches
qui ont un lieu (festival des baleines, Donia, famadihana) ; une publicité ou
des vœux de fête venant d'un établissement nourrissent SA FICHE, jamais le fil.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import analyse_llm  # noqa: E402
from bot import extraction as ex  # noqa: E402

AUJ = date(2026, 9, 3)


def _classe(texte, nb_photos=1, auteur_page=None):
    plats = ex.lignes_de_carte(texte)
    dates = ex.dates_evenement(texte, AUJ)
    return ex.classer_avec_motif(texte, nb_photos, plats, dates, auteur_page)


# ── Ce qui ne va nulle part ─────────────────────────────────────────────────
def test_une_vente_d_ordinateur_ne_va_nulle_part():
    genre, motif = _classe("À vendre ordinateur portable HP Core i5, 8 Go, 1 200 000 Ar. Contact 034 12 345 67")
    assert genre == "rien" and "vente" in motif
    assert ex.parle_de_tourisme("Vends laptop Dell état neuf, livraison Tana", 1) is False


def test_des_voeux_de_fete_sans_information_ne_vont_nulle_part():
    genre, motif = _classe("Joyeuse fête nationale à tous nos amis Malagasy ! 🇲🇬")
    assert genre == "rien" and "vœux" in motif


# ── Ce qui nourrit la fiche ─────────────────────────────────────────────────
def test_un_restaurant_qui_souhaite_noel_nourrit_sa_fiche_pas_le_fil():
    texte = ("Joyeux Noël à tous ! Le restaurant Sakamanga vous accueille le 24 au soir. "
             "Réservation au 034 12 345 67.")
    genre, motif = _classe(texte)
    assert genre == "etablissement" and "calendaire" in motif


def test_un_menu_de_reveillon_chiffre_reste_une_carte():
    texte = ("Menu du réveillon !\nFoie gras maison 45 000 Ar\nCrevettes flambées 38 000 Ar\n"
             "Bûche de Noël 15 000 Ar\nRéservation 032 11 222 33")
    genre, motif = _classe(texte)
    assert genre == "carte" and "fête" in motif


def test_une_offre_d_hotel_nourrit_la_fiche_pas_le_fil():
    texte = ("FLASH PROMO À SAINTE-MARIE ! -30 % sur votre séjour du 12 au 30 septembre. "
             "Réservez vite au 034 55 666 77, notre hôtel vous attend.")
    genre, motif = _classe(texte, auteur_page="Hôtel Lakana")
    assert genre == "etablissement" and "offre" in motif


def test_un_voyage_organise_est_une_agence_pas_un_evenement():
    texte = ("Voyage organisé Tana - Tuléar - Tana, 8 jours / 7 nuits, départ le 10 septembre 2026. "
             "Pension complète, transport aller-retour. Places limitées, inscription au 033 11 222 33.")
    genre, motif = _classe(texte)
    assert genre == "etablissement" and "voyage organisé" in motif


def test_la_page_d_un_hotel_qui_parle_d_elle_sans_vecu_va_a_la_fiche():
    texte = ("Nos bungalows vue mer vous attendent. Piscine, restaurant, plage privée. "
             "Contactez-nous au 032 40 000 00 pour vos disponibilités.")
    assert _classe(texte, auteur_page="Nosy Be Hôtel & Spa")[0] == "etablissement"


# ── Ce qui va au calendrier ─────────────────────────────────────────────────
def test_un_festival_date_est_un_evenement():
    genre, motif = _classe("Festival des baleines à Sainte-Marie du 12 au 15 juillet 2026, "
                           "parade des pirogues et concerts sur la plage.")
    assert genre == "evenement"


def test_une_fete_traditionnelle_est_un_evenement():
    assert _classe("Fitampoha 2026 à Belo-sur-Tsiribihina, cérémonie le 20 septembre 2026, "
                   "bain des reliques royales.")[0] == "evenement"


def test_un_match_a_la_tele_le_jour_de_la_fete_nationale_n_est_pas_un_evenement():
    genre, _ = _classe("Demi-finale France vs Espagne le 14 juillet, fête nationale française, "
                       "sur écran géant au bar ! Réservez votre table au 034 00 000 00.")
    assert genre != "evenement"


# ── Ce qui va au fil ────────────────────────────────────────────────────────
def test_un_recit_de_voyage_va_au_fil():
    texte = ("On a passé trois jours à Nosy Iranja, la traversée en bateau était magnifique. "
             "Notre séjour au lodge : simple mais propre, coucher de soleil incroyable.")
    genre, motif = _classe(texte)
    assert genre == "recit" and motif == "vécu"
    assert ex.genre_de_post(texte) == "recit"


def test_une_aventure_culinaire_est_une_assiette():
    texte = "On a mangé un ravitoto sy henakisoa délicieux chez Mariette à Ampefy, 12 000 Ar l'assiette."
    assert _classe(texte)[0] == "recit"
    assert ex.genre_de_post(texte) == "assiette"


def test_une_mesaventure_est_un_avis():
    texte = ("Très déçu de notre passage à cet hôtel : chambre sale, deux heures d'attente "
             "au restaurant, et trop cher pour ce que c'est.")
    assert _classe(texte)[0] == "recit"
    assert ex.genre_de_post(texte) == "avis"


def test_une_belle_photo_d_une_page_va_au_fil():
    genre, motif = _classe("Coucher de soleil sur la baie ce soir 🌅", nb_photos=2,
                           auteur_page="Sakatia Lodge")
    assert genre == "recit" and motif == "photo d'une page"
    assert ex.genre_de_post("Coucher de soleil sur la baie ce soir 🌅") == "photo"


# ── Le modèle ne renverse pas la décision ───────────────────────────────────
def test_le_modele_ne_transforme_pas_des_voeux_en_recit():
    regles = {"genre": "rien", "motif_classement": "vœux de fête calendaire sans information"}
    fusion = analyse_llm.fusionner(regles, {"genre": "recit", "confiance": 90},
                                   texte="Joyeuse fête nationale !")
    assert fusion["genre"] == "rien"
    assert "tenu par les règles" in fusion["llm_doute"]


def test_la_nature_de_recit_du_modele_donne_le_genre_de_post():
    fusion = analyse_llm.fusionner({"genre": "recit", "motif_classement": "vécu"},
                                   {"genre": "recit", "nature_recit": "culinaire", "confiance": 90},
                                   texte="on a goûté")
    assert fusion["post_genre"] == "assiette"


def test_le_chrome_de_facebook_n_est_pas_un_nom_d_etablissement():
    assert ex.nom_etablissement("Indicateur de statut En ligne\nOn a mangé chez Mariette") != \
        "Indicateur de statut En ligne"
    assert ex.nom_etablissement("PRIX : 130.000 ARIARY\nBungalow vue mer") is None or \
        "PRIX" not in (ex.nom_etablissement("PRIX : 130.000 ARIARY\nBungalow vue mer") or "")
