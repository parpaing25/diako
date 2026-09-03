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


# ── 03/09/2026, second nettoyage : le malgache et l'anglais des annonces ──────
# 18 des 248 récits restés en ligne après le premier passage étaient des
# annonces en malgache (« ity tolotra ity », « misokatra foana izahay ») ou en
# anglais (« Escape to the paradise of Nosy Sakatia… book now »), que le
# vocabulaire tout français d'`est_une_offre` laissait passer pour du vécu.

from bot import extraction  # noqa: E402


def _classer(texte, page=None, photos=1):
    return extraction.classer_avec_motif(
        texte, photos, extraction.lignes_de_carte(texte),
        extraction.dates_evenement(texte), page)[0]


def test_annonce_malgache_d_un_lodge_nourrit_sa_fiche():
    texte = ("Manankery manomboka volana septembre indray ity tolotra ity : 10h00 à 16h00 : "
             "40.000 Ar, 17h30 à 08h30 : 40.000 Ar. Bungalow Kollins Lodge Ramena. "
             "Antsoy ny 034 12 345 67")
    assert _classer(texte) == "etablissement"


def test_nous_sommes_ouverts_n_est_pas_un_vecu():
    texte = ("Salama tompoko o. Misokatra foana izahay na Alahady ary tongava manandrana "
             "ireo sakafo matsiro. Resto Anjanahary, 033 11 222 33")
    assert _classer(texte) == "etablissement"


def test_un_recit_malgache_avec_izahay_reste_un_recit():
    texte = ("Izahay nandeha tany Ranomafana, nahita gidro sy riandrano. "
             "Tsara be ny lalana, mahafinaritra ny parc.")
    assert _classer(texte) == "recit"


def test_matelas_a_louer_n_a_rien_a_faire_ici():
    texte = ("ho anareo izay mitady #KIDORO AHOFA ETO MAHAJANGA, izahay dia mampanofa "
             "kidoro, TEL : 034 55 666 77")
    assert _classer(texte) == "rien"


def test_annonce_anglaise_d_une_agence_nourrit_sa_fiche():
    texte = ("Discover Nosy Sakatia with Léonard Tour. Escape to the paradise of Nosy "
             "Sakatia, where turquoise water meets white sand. Book now, contact us on "
             "WhatsApp +261 32 12 345 67")
    assert _classer(texte, page="Léonard Tour") == "etablissement"


def test_evenement_annonce_en_malgache_reste_un_evenement():
    texte = ("ONE GUITARE FOR BAKÀKA – ACTION SOCIALE. Amin'ity hetsika ity, dia "
             "hanatanteraka asa soa izahay ny 27 août any Sarimanok Ambatoloaka. "
             "Tongava maro !")
    assert _classer(texte) == "evenement"


def test_un_blender_est_une_vente_d_objets():
    texte = ("BLENDER ULTRA PUISSANT SILVER CREST Professionnelle Mixeur, broyeur, "
             "hachoir 4500W. 180000ar. Service de livraison Tana. 034 00 111 22")
    assert _classer(texte) == "rien"


# ── Le chrome de Facebook collé au texte (03/09/2026) ────────────────────────
# 106 des 213 récits VISIBLES en ligne portaient « Voir moins… », « Contenu
# IA », « · Suivre » ou « Indicateur de statut En ligne » dans leur corps :
# BRUIT_FIL est ancré (^…$) et ne voyait que les lignes entières de bruit.

def test_le_bruit_colle_au_texte_part_aussi():
    from bot import redaction
    texte = "Mbola ilay toerana antsoina hoe Lavanono. #voyage Voir moins\u2026"
    assert redaction.nettoyer(texte) == "Mbola ilay toerana antsoina hoe Lavanono. #voyage"


def test_le_texte_utile_survit_au_bruit_qui_le_precede():
    """« Indicateur de statut … » avalait la LIGNE ENTIÈRE, texte compris."""
    from bot import redaction
    texte = "Indicateur de statut En ligne En ligne TL Voyage \u00b7 Contenu IA \u00b7 LOCATION DE VOITURE"
    assert redaction.nettoyer(texte) == "TL Voyage \u00b7 LOCATION DE VOITURE"


def test_la_provenance_ne_se_repete_pas():
    """Le modèle rendait un corps finissant par la provenance ; le pied la rajoutait."""
    from bot import redaction
    corps = "Un beau r\u00e9cit.\n\nVu sur Facebook \u2014 Andri.matel le 23/08/2026"
    rendu = redaction.corps_recit({"corps": corps, "auteur": "Andri.matel",
                                   "date_post": "2026-08-23"})
    assert rendu.count("Vu sur Facebook") == 1


def test_un_bateau_vendu_n_est_pas_du_tourisme():
    """« A. VENDRE » : le point coupait le motif « a vendre » en deux."""
    texte = "Misy Bateaux A. VENDRE NOSY BE A CRAT\u00c8RE Bateau de p\u00eache mbola tsara mp prix"
    assert extraction.est_vente_d_objets(texte)
    assert _classer(texte) == "rien"
