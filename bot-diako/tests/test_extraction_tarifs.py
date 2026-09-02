"""Garde-fous sur les tarifs : chambres, circuits, véhicules, droits d'entrée.

Chaque texte de ce fichier vient de `data/bot.db`, relevé le 24/08/2026, et
chacun a été un défaut mesuré avant d'être un test. Les chiffres qui vont avec :
94 chambres collectées dont 55 SANS PRIX (et `room_types.base_price_ar` est NOT
NULL, donc jamais publiées), 0 circuit, 1 ligne de véhicule sans tarif, 0 parc
renseigné.

    python -m pytest tests/test_extraction_tarifs.py -q
    python tests/test_extraction_tarifs.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import analyse_llm  # noqa: E402
from bot import extraction as ex  # noqa: E402


# ════════════════════════════════════════════════════════════════════════════
# ① Les chambres sans prix — 55 sur 94
# ════════════════════════════════════════════════════════════════════════════

# Couleur Café (Antsirabe) : le libellé est un titre, le prix arrive deux
# lignes plus bas, et il est en euros. Trois raisons de le rater, cumulées.
COULEUR_CAFE = """Tarifs en Euros (€) à titre indicatif

Bungalow Double ou Twin

Salle d’eau & cheminée

50€ HT

Bungalow triple : 1 pièce

1 grand lit + 1 petit lit ou 3 lits séparées

63€ HT

Bungalow Familiale pour 4 personnes

1 pièce avec lit double + 1 pièce avec Twin

+ 1 salle d’eau + Cheminée

75€ HT
"""

# Les Paillottes de Babaomby : la devise est écrite DEVANT le nombre, et cinq
# lignes séparent le libellé du prix.
BABAOMBY = """Bungalows
Options d'hébergement

D'un confort simple mais douillet, tous nos bungalows sont construits en bois...
* Taxe touristique incluse

€ 70.00
Prix par chambre

Détails

Bungalows de luxe
Options d'hébergement

D'un confort luxueux et douillet, nos suites de luxe sont construites en dure et
offrent tout le confort nécessaire à votre détente.
* Taxe touristique incluse

€ 80.00
Prix par chambre
"""

# Ecolodge Libertalia : la saison porte elle-même le prix.
LIBERTALIA = """Location de villa exclusive avec service hotelier

Capacité d’accueil: jusqu’à 6 personnes.

Tarifs: (3 nuits minimum)

Basse Saison: 100€/nuit

05/01/26 au 31/03/26

Moyenne Saison: 120€/nuit

Haute Saison: 140€/nuit
"""

# Time + Tide Tsara Komba : un tableau de tarifs aplati en lignes. Deux
# chambres, deux occupations, quatre prix — impossible à recoller.
TSARA_KOMBA = """OCEAN VIEW ROOMS90 m2

Ocean View Suites 120 m2

Sharing

Single

Peak Season1 - 10 Jan 20269 July - 31 Aug 2026

Adult

€403

€604

€466

€699
"""


def test_le_prix_en_euros_est_converti_et_trace():
    """14 chambres sur 55 n'avaient de prix qu'en euros.

    `montants()` refusait les devises étrangères en silence — le bon réflexe,
    mais `room_types.base_price_ar` est NOT NULL : sans conversion ces chambres
    ne partent jamais. La conversion est donc permise, à condition qu'elle se
    voie : le montant d'origine part avec le prix.
    """
    chambres = ex.types_de_chambre(COULEUR_CAFE)
    par_nom = {c["nom"]: c for c in chambres}
    assert "Bungalow Double ou Twin" in par_nom, [c["nom"] for c in chambres]
    double = par_nom["Bungalow Double ou Twin"]
    assert double["prix_ar"] == 50 * ex.TAUX_ARIARY["EUR"]
    assert "50 €" in double["description"], double["description"]
    assert str(ex.TAUX_ARIARY["EUR"]) in double["description"].replace(" ", "")


def test_les_quatre_bungalows_gardent_chacun_leur_prix():
    """« 1 pièce avec lit double + 1 pièce avec Twin » décrit le couchage.

    Cette ligne nomme un « double » et un « twin » : prise pour un libellé,
    elle volait son prix au bungalow familial annoncé juste au-dessus.
    """
    noms = [c["nom"] for c in ex.types_de_chambre(COULEUR_CAFE)]
    assert "Bungalow Familiale pour 4 personnes" in noms, noms
    assert not any(n.startswith("1 ") for n in noms), noms


def test_la_devise_peut_preceder_le_nombre():
    """« € 70.00 » : MOTIF_MONTANT ne lisait que « 70 € »."""
    chambres = {c["nom"]: c["prix_ar"] for c in ex.types_de_chambre(BABAOMBY)}
    assert chambres == {"Bungalows": 70 * ex.TAUX_ARIARY["EUR"],
                        "Bungalows de luxe": 80 * ex.TAUX_ARIARY["EUR"]}, chambres


def test_la_saison_qui_porte_son_prix_se_rattache_a_la_villa():
    saisons = {c["saison"]: c["prix_ar"] for c in ex.types_de_chambre(LIBERTALIA)}
    assert saisons == {"Basse Saison": 100 * ex.TAUX_ARIARY["EUR"],
                       "Moyenne Saison": 120 * ex.TAUX_ARIARY["EUR"],
                       "Haute Saison": 140 * ex.TAUX_ARIARY["EUR"]}, saisons
    noms = {c["nom"] for c in ex.types_de_chambre(LIBERTALIA)}
    assert noms == {"Location de villa exclusive avec service hotelier"}, noms


def test_un_tableau_de_tarifs_aplati_ne_se_devine_pas():
    """Mieux vaut aucune chambre qu'une chambre au prix de sa voisine."""
    assert ex.types_de_chambre(TSARA_KOMBA) == []


def test_l_ariary_gagne_sur_la_devise():
    """« Bungalow Saline : 165 000 Ar / 35 € » — le même tarif, écrit deux fois.

    Le motif est paresseux : il lit le DERNIER nombre, donc les 35 €, et
    publiait 178 500 Ar au lieu des 165 000 Ar affichés (Ecolodge de Menabe).
    """
    lues = ex.types_de_chambre("Bungalow Saline : 165 000 Ar / 35 €")
    assert [(c["nom"], c["prix_ar"]) for c in lues] == [("Bungalow Saline", 165_000)]
    assert lues[0]["description"] is None


def test_sans_taux_la_chambre_reste_sans_prix():
    """Le refus de convertir reste possible, et il est explicite."""
    assert ex.types_de_chambre(COULEUR_CAFE, taux={}) == []


def test_le_petit_dejeuner_n_est_pas_une_chambre():
    """« standard » est un mot de chambre ; « Petit déjeuner standard » non.

    Relevé chez Regina lodge : il entrait comme un type de chambre à 23 000 Ar
    la nuit.
    """
    assert ex.types_de_chambre("Petit déjeuner standard : 23 000 Ar") == []


def test_une_phrase_de_brochure_n_est_pas_un_libelle():
    """« détente » contient « tente », « nécessaire » contient « case »."""
    texte = ("Bungalows de luxe\n\n"
             "offrent tout le confort nécessaire à votre détente.\n\n"
             "€ 80.00\n")
    noms = [c["nom"] for c in ex.types_de_chambre(texte)]
    assert noms == ["Bungalows de luxe"], noms


def test_une_ligne_de_prix_ne_sert_qu_une_chambre():
    """Sur une grille aplatie, trois libellés se servaient dans les mêmes prix."""
    texte = "Chambre standard\n\nChambre confort\n\n250 000 Ar\n\n300 000 Ar\n"
    lues = ex.types_de_chambre(texte)
    assert len(lues) <= 1, [(c["nom"], c["prix_ar"]) for c in lues]


def test_montants_ne_rend_les_devises_que_si_on_les_demande():
    assert ex.montants("chambre à 50 €") == []
    lus = ex.montants("chambre à 50 €", avec_devises=True)
    assert lus[0]["montant"] == 50 and lus[0]["devise"] == "EUR"
    # L'ariary, lui, n'a jamais de clé `devise` : rien ne change pour l'existant.
    assert "devise" not in ex.montants("chambre à 80 000 Ar la nuit")[0]


# ════════════════════════════════════════════════════════════════════════════
# ② Les circuits — 0 en base, parce que seul le LLM savait les lire
# ════════════════════════════════════════════════════════════════════════════

MADAZUR = """EXCURSION / CAMPING AMPEFY 2JOURS
LIBERTÉ
AVENTURE
NATURE
05 _06 SEPTEMBRE
TARIF : 160 000 ariary /pers
SI ÉTRANGERS + 50 000 ar
Zaza 3 ans midina gratuit
INCLUS :
Transport aller retour et sur sites
Ticket d'entrée par sites
Frais de guidage
Repas (soir,matin,midi)
NON INCLUS :
Besoin personnel
Bouteille d'eau
Reservation place 50 000 ar/pers
Départ : INSTAT ANOSY 7h00
038 91 683 83/032 45 495 05
"""

VOYAGE_ORGANISE = """Voyage organisé
TANA- TULÉAR -TANA
10 Septembre au 17 Septembre 2026 (8 jours)
Tarif lite: 1.590.000 ariary par personne
Tarif luxe: 2.090.000 ariary par personne
8 places disponibles
#Starex fona ny fiara andeanana
"""

DJEMA = """PACK Tour du Nord Madagascar – 7 Jours / 6 Nuits ( Antsiranana - Nosy bé )
Djema Forest Tour
Programme
– Découverte d'Antsiranana
– Aventure à la Montagne d'Ambre
"""


def test_un_circuit_se_lit_sans_le_modele():
    circuit = ex.circuits(MADAZUR, ["Ampefy", "Antananarivo"])[0]
    assert circuit["jours"] == 2
    assert circuit["titre"] == "EXCURSION / CAMPING AMPEFY 2JOURS"
    assert circuit["prix_ar"] == 160_000
    assert circuit["prix_unite"] == "personne"
    assert "Ampefy" in circuit["resume"]


def test_l_acompte_n_est_pas_le_prix_du_voyage():
    """« Reservation place 50 000 ar/pers » et « SI ÉTRANGERS + 50 000 ar ».

    Deux montants par personne, plus bas que le tarif : pris pour le prix
    d'appel, ils bradaient le séjour de 160 000 à 50 000 Ar.
    """
    assert ex.circuits(MADAZUR, [])[0]["prix_ar"] == 160_000


def test_les_inclusions_s_arretent_a_non_inclus():
    inclus = ex.circuits(MADAZUR, [])[0]["inclus"]
    assert "transport" in inclus and "guide" in inclus and "repas" in inclus
    assert "droits d'entrée" in inclus
    # « Bouteille d'eau » est sous NON INCLUS : rien de ce qui suit n'entre.
    assert "boissons" not in inclus


def test_la_date_n_est_pas_le_titre_du_circuit():
    """Le titre devient le nom du circuit sur Diako, et son adresse web."""
    circuit = ex.circuits(VOYAGE_ORGANISE, [])[0]
    assert circuit["titre"] == "TANA- TULÉAR -TANA", circuit["titre"]
    assert circuit["jours"] == 8
    # Le tarif d'appel est le plus bas des deux annoncés.
    assert circuit["prix_ar"] == 1_590_000


def test_jours_et_nuits_du_meme_titre():
    circuit = ex.circuits(DJEMA, ["Antsiranana", "Nosy Be"])[0]
    assert (circuit["jours"], circuit["nuits"]) == (7, 6)
    assert circuit["depart"] == "Antsiranana"


def test_une_duree_citee_en_passant_ne_fait_pas_un_circuit():
    """« Au-delà de 7 jours les prix seront adaptés » est une note de bas de page.

    Relevé chez Regina lodge et dans une FAQ visa (« 15 jours ») : les deux
    fabriquaient un circuit.
    """
    texte = ("Regina lodge, chambres et appartements à Diego.\n"
             + "Nous sommes ouverts toute l'année et le séjour est libre.\n" * 6
             + "Au-delà de 7 jours les prix seront adaptés.\n")
    assert ex.circuits(texte, []) == []


def test_un_recit_de_vacances_n_est_pas_une_offre():
    assert ex.circuits("On a passé 3 jours magnifiques à Nosy Be.", []) == []


def test_madagascar_n_est_pas_une_etape():
    """Le référentiel porte 18 334 lieux : « Madagascar » sortait en tête."""
    etapes = ex.etapes_citees("Circuit à Madagascar : Nosy Be puis Nosy Iranja.",
                              ["Madagascar", "Nosy Iranja", "Nosy Be", "Nosy"])
    assert etapes == ["Nosy Be", "Nosy Iranja"], etapes


# ════════════════════════════════════════════════════════════════════════════
# ③ La grille des loueurs — 1 ligne en base, aucune tarifée
# ════════════════════════════════════════════════════════════════════════════

TL_VOYAGE = """LOCATION DE VOITURE AVEC CHAUFFEUR INCLUS
Confort, sécurité et élégance pour tous vos déplacements !
Nos véhicules :
Hyundai Santa Fe et Kia Sorento 4WD — SUV 7 places, propres, spacieux et climatisés.
Disponibilité 24h/24 et 7j/7
Nos tarifs : A partir de
100 000 Ar en ville
250 000 Ar en province
(Journée de 8h à 18h — Carburant non inclus)
Contactez-nous dès maintenant :
032 64 297 73 (WhatsApp)
"""


def test_un_suv_4wd_est_un_4x4():
    """Aucune des 58 annonces ne produisait d'offre : « 4WD » et « SUV »
    n'étaient pas des mots connus, et « 4*4 » s'écrit avec une étoile."""
    assert ex._type_vehicule("kia sorento 4wd — suv 7 places")[0] == "4x4"
    assert ex._type_vehicule("starex, 4*4, bus")[0] == "4x4"
    assert ex._type_vehicule("location voiture 4×4 tulear")[0] == "4x4"


def test_le_prix_journalier_se_lit_meme_a_trois_lignes_du_mot_jour():
    offres = ex.lignes_vehicule(TL_VOYAGE)
    assert len(offres) == 1, offres
    offre = offres[0]
    assert offre["type_vehicule"] == "4x4"
    # Le prix d'appel, pas le plus cher : « 250 000 Ar en province » était seul
    # collé au mot « Journée », et sortait comme tarif du loueur.
    assert offre["prix_jour_ar"] == 100_000, offre
    assert "250 000" in (offre["note_prix"] or "")


def test_carburant_non_inclus_ne_veut_pas_dire_inclus():
    """« Carburant non inclus » contient « carburant … inclus »."""
    assert ex.lignes_vehicule(TL_VOYAGE)[0]["carburant_inclus"] is False


def test_avec_ou_sans_chauffeur_ne_tranche_rien():
    """`vehicle_offers.with_driver` a un défaut en base : à elle de trancher."""
    texte = ("Locamad Nosy Be : nos véhicules 4x4 sont disponibles avec "
             "chauffeur ou sans chauffeur, à 200 000 Ar par jour.")
    assert ex.lignes_vehicule(texte)[0]["avec_chauffeur"] is None


def test_un_modele_d_un_autre_type_n_est_pas_le_modele():
    """« Starex, 4*4, bus et tête de cortège » énumère une flotte."""
    offre = ex.lignes_vehicule(
        "MADA CAR Location : Starex, 4*4, bus à partir de 100 000ar")[0]
    assert offre["type_vehicule"] == "4x4"
    assert offre["modele"] is None, offre


def test_le_modele_connu_bat_le_mot_vehicule():
    """« Hyundai Tucson » sortait en type 'autre' : le mot « véhicule »
    apparaît dans presque toutes les annonces."""
    texte = ("Location : profitez de notre Hyundai Tucson avec chauffeur privé. "
             "Véhicule confortable et climatisé.")
    assert ex.lignes_vehicule(texte)[0]["type_vehicule"] == "4x4"


def test_un_pack_de_voyage_n_entre_pas_dans_la_flotte():
    """« PACK VOYAGE D'ÉTUDES À PARTIR DE 235 000 Ar / pers » n'est pas une
    location : un véhicule se loue au véhicule, pas à la personne."""
    texte = ("PACK VOYAGE D’ÉTUDES OU GROUPE A PARTIR DE 235 000 Ar / pers.\n"
             "TRANSPORT (LOCATION + CARBURANT)\n")
    assert ex.lignes_vehicule(texte) == []


def test_une_excursion_en_bateau_n_est_pas_une_location():
    texte = ("EXCURSION KATSEPY en bateau, la journée.\n"
             "Adulte : 95 000 Ar / personne\n")
    assert ex.lignes_vehicule(texte) == []


# ════════════════════════════════════════════════════════════════════════════
# ④ Les droits d'entrée des parcs — 0 rempli
# ════════════════════════════════════════════════════════════════════════════

EXCURSIONS_NOSY_BE = """Salama daholo !
Voici le tarif de nos excursions ( par personne)
Iranja : Malagasy 110.000ar / étranger 155.000ar
Komba et Tanikely : Malagasy 110.000ar / étranger 155.000ar.
Sakatia : Malagasy 70.000ar / étranger 80.000ar.
Compris :
- transfert bateau aller retour
"""


def test_le_parc_lit_ses_deux_tarifs_et_son_guide():
    tarifs = ex.droits_entree(
        "Parc national Ranomafana. Droit d'entrée : vazaha 55 000 Ar, "
        "malagasy 5 000 Ar. Le guide est obligatoire, frais de guide "
        "40 000 Ar par groupe.", "Ranomafana")
    assert tarifs == {"resident_ar": 5_000, "nonresident_ar": 55_000,
                      "guide_obligatoire": True, "guide_groupe_ar": 40_000}


def test_un_prix_d_excursion_n_est_pas_un_droit_d_entree():
    """C'était la SEULE lecture de droits d'entrée du corpus, et elle allait
    écrire 110 000 Ar dans `attractions.fee_resident_ar` du parc de Nosy
    Tanikely — alors que c'est le prix d'une sortie en bateau, déjeuner
    compris."""
    assert ex.droits_entree(EXCURSIONS_NOSY_BE, "Parc National Nosy Tanikely") == {
        "resident_ar": None, "nonresident_ar": None,
        "guide_obligatoire": None, "guide_groupe_ar": None}


def test_un_supplement_etranger_n_est_pas_un_tarif():
    """« (étranger + 20.000 ar) » se paie EN PLUS d'un forfait bungalow."""
    tarifs = ex.droits_entree("175.000 Ariary/personne : Bungalow "
                              "(étranger + 20.000 ar)")
    assert tarifs["nonresident_ar"] is None


def test_plusieurs_parcs_dans_un_texte_sans_nom_de_site_ne_se_devinent_pas():
    liste = ("Entrée Ankarana : malagasy 25 000 Ar.\n"
             "Entrée Montagne d'Ambre : malagasy 45 000 Ar.\n")
    assert ex.droits_entree(liste)["resident_ar"] is None
    # Nommer le site lève l'ambiguïté.
    assert ex.droits_entree(liste, "Parc National Ankarana")["resident_ar"] == 25_000


# ════════════════════════════════════════════════════════════════════════════
# ⑤ Le raccord modèle / règles — c'est là que les prix se perdaient
# ════════════════════════════════════════════════════════════════════════════
def test_le_modele_n_efface_pas_le_prix_lu_par_les_regles():
    """Le prompt interdit au modèle de convertir : sur un site en euros il rend
    des chambres bien nommées et SANS PRIX, et sa liste remplaçait celle des
    règles. C'est l'origine exacte des 55 chambres sans prix."""
    regles = {"lignes_chambre": [
        {"nom": "Bungalow Double ou Twin", "prix_ar": 255_000, "saison": None,
         "description": "Tarif affiché 50 €, converti…"},
    ]}
    llm = {"chambres": [{"nom": "Bungalow Double ou Twin", "prix_ar": None}]}
    fusion = analyse_llm.fusionner_site(regles, llm)
    assert fusion["lignes_chambre"][0]["prix_ar"] == 255_000
    assert "50 €" in fusion["lignes_chambre"][0]["description"]


def test_le_modele_reformule_le_libelle_et_garde_sa_saison():
    """« Location de la villa (jusqu'à 6 personnes) » côté modèle,
    « Location de villa exclusive avec service hotelier » sur la page."""
    regles = {"lignes_chambre": [
        {"nom": "Location de villa exclusive avec service hotelier",
         "prix_ar": 510_000, "saison": "Basse Saison"},
        {"nom": "Location de villa exclusive avec service hotelier",
         "prix_ar": 714_000, "saison": "Haute Saison"},
    ]}
    llm = {"chambres": [
        {"nom": "Location de la villa (jusqu'à 6 personnes)", "prix_ar": None,
         "saison": "Haute Saison"},
    ]}
    lues = analyse_llm.fusionner_site(regles, llm)["lignes_chambre"]
    assert lues[0]["prix_ar"] == 714_000, lues[0]
    # La saison que le modèle n'a pas reprise n'est pas perdue pour autant.
    assert any(c["prix_ar"] == 510_000 for c in lues), lues


def test_une_chambre_sans_prix_nulle_part_reste_sans_prix():
    fusion = analyse_llm.fusionner_site(
        {"lignes_chambre": [{"nom": "Suite", "prix_ar": 300_000, "saison": None}]},
        {"chambres": [{"nom": "Chambre dont le tarif n'est pas publié",
                       "prix_ar": None}]})
    sans = [c for c in fusion["lignes_chambre"] if not c["prix_ar"]]
    assert len(sans) == 1 and sans[0]["nom"].startswith("Chambre dont")


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
