"""Garde-fous sur le filtre immobilier : Diako est un bot de TOURISME.

Tous les textes de ce fichier sont copiés **verbatim** depuis `data/bot.db` le
24/08/2026. Sur les 2 217 trouvailles de la base, 36 sont des annonces
immobilières — dont **trois déjà publiées sur Diako** (« À vendre : 2 VILLAS
CONTEMPORAINES », « APPARTEMENT MEUBLÉ À LOUER – AMBONARA », « MAISON BASSE À
LOUER ANDRONDRA ») et trois validées, prêtes à partir.

⚠⚠ LA MOITIÉ DE CE FICHIER TESTE CE QU'IL NE FAUT **PAS** ÉCARTER. Un hôtel
   écrit « chambre à louer », « bungalow à louer », « location de vacances » :
   c'est du tourisme. La frontière n'est pas le verbe « louer », c'est la
   DURÉE et l'INTENTION — nuitée contre loyer mensuel.

    python -m pytest tests/test_immobilier.py -q
    python tests/test_immobilier.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import extraction as ex  # noqa: E402

# ════════════════════════════════════════════════════════════════════════════
# ① Ce qui DOIT être écarté — le périmètre de Fonenako
# ════════════════════════════════════════════════════════════════════════════

# Groupe « ANTANANARIVO ATSIMONDRANO ». Vente en malgache ET en français, avec
# les papiers. Le titre suffit : « TRANO AMIDY » = « maison à vendre ».
VENTE_TRANO_AMIDY = """TRANO AMIDY
–, MAISON À VENDRE
16 minutes seulement de l'Aéroport d'Ivato.
Prix : 180.000.000 Ar
Mitady trano lehibe amin'ny vidiny mirary ve ianao?
Maison 2 étages
10 pièces lehibe
Mipetraka eo ambony terrain 400 m²
Titré et borné
Idéal pour habitation, location na investissement.
Contact : 038 89 837 55"""

# Groupe « bizna nosy be hell ville ». Terrain nu : ni hôtel ni séjour.
VENTE_TERRAIN = (
    "Terrain à vendre. 40m sur 29m ( 1160m² ). Vue mer. Accessible en voiture. "
    "Pas titré borné. Papier, Acte de vente au Fonkontany. Quartier à "
    "Belazalaza. Plus d’info,  mp où contacter 0326078035. "
    "Droit de visite 10.000ar."
)

# Groupe « Vacances Majunga_Bons Plans 401 » — publié dans un groupe VACANCES,
# et c'est bien un bail : loyer mensuel, caution, commission d'agence.
BAIL_TRANO_AHOFA = """trano vato ahofa eto MAHAJANGA
Spécial hoany mpianatra na couple na mpivady vao na céliba reny
- Quartier: Akaiky village
- 1ch ciment + calbano kely
- cuisine eo @ vérrande
- misy jiro sy rano
- loyer: 800 mille fmg tsis caution
- visite: 10.000 ar / 50% Agence immobilier
- contact: 0343720195"""

# Groupe « Nosy be hell Mbizna ». Celle-ci EST PUBLIÉE sur Diako aujourd'hui.
# ⚠ Elle contient « réservation » : ce mot ne fait donc PAS un séjour.
BAIL_APPARTEMENT_PUBLIE = """APPARTEMENT MEUBLÉ À LOUER – AMBONARA
Découvrez ce magnifique appartement spacieux et confortable, situé dans un
endroit calme, avec un accès facile et à proximité de toutes les commodités.
Caractéristiques : • 3 chambres
• Salon spacieux
• Cuisine entièrement équipée
• Appartement meublé
Loyer : 2 000 000 Ar / mois
Disponible à partir de septembre
Location longue durée
Pour plus d’informations ou réservation :
032 05 483 14"""

# 🔴 LE CAS DES POLICES FANTAISIE. Écrit en gras Unicode : `sans_accent()`
#    normalise en NFD, qui laisse « 𝗠𝗔𝗜𝗦𝗢𝗡 » intact et ne voit donc pas
#    « maison ». Sans le NFKD d'`_aplati()`, cette annonce passait au travers.
BAIL_MAISON_EN_GRAS = (
    "𝗠𝗔𝗜𝗦𝗢𝗡 INDEPENDENT A louer 𝗩𝗜𝗗𝗘 Neuf 𝗻𝗮 𝗧𝗥𝗔𝗚𝗡𝗢 HAFODRO eto amin'ny "
    "Quartier: LA BATTERIE Hell-Ville à 𝗡𝗼𝘀𝘆-𝗕𝗲, endroit Calme\n"
    "𝗟𝗢𝗨𝗘𝗥: 1000.000𝗔𝗥 par Mois, tsisy Caution\n"
    "• 3 Grande Chambre à Couches\n"
    "• Droit de visite 10.000Ar, et 50% commission obligatoire"
)

ECARTES = {
    "vente malgache + française": VENTE_TRANO_AMIDY,
    "terrain nu": VENTE_TERRAIN,
    "bail malgache": BAIL_TRANO_AHOFA,
    "bail publié par erreur": BAIL_APPARTEMENT_PUBLIE,
    "bail en gras Unicode": BAIL_MAISON_EN_GRAS,
}


def test_les_annonces_immobilieres_sont_ecartees():
    for quoi, texte in ECARTES.items():
        assert ex.parle_d_immobilier(texte), quoi


def test_le_motif_est_dit_et_non_devine():
    """Le journal doit pouvoir écrire POURQUOI : « écartée » seul ne se vérifie pas."""
    assert "vente d'un bien" in ex.raisons_immobilier(VENTE_TRANO_AMIDY)
    assert "papiers fonciers" in ex.raisons_immobilier(VENTE_TERRAIN)
    assert "loyer au mois" in ex.raisons_immobilier(BAIL_APPARTEMENT_PUBLIE)
    assert "agence immobilière" in ex.raisons_immobilier(BAIL_TRANO_AHOFA)


def test_le_gras_unicode_ne_cache_plus_le_mot_maison():
    """🔴 NFKD, pas NFD. C'est une annonce sur trente-six."""
    assert ex._aplati(BAIL_MAISON_EN_GRAS).startswith("maison independent a louer")


# ════════════════════════════════════════════════════════════════════════════
# ② Ce qu'il ne faut SURTOUT PAS écarter — le piège
# ════════════════════════════════════════════════════════════════════════════

# Groupe « Vacances Majunga_Bons Plans 401 ». Le MÊME mot malgache « ahofa »
# que le bail ci-dessus, et pourtant : le prix est à la NUITÉE.
TOURISME_AHOFA_A_LA_NUITEE = """Appartement ahofa eto Mahajanga #PELINE  ville
2chambreS total ( raika salon raika chambre a coucher ) un cuisine équipée,
douche et wc interne,, #quartier #PLEINE #VILLE A #MAHABIBO
DISPONIBLE TOUTE SUITE ( AFAKA TONGA DIA MIDITRA KOA METY AMINAO LE TRANO
PRIX AZO ATAO PAR JOUR( 60 000ariary/nuitée)
PLUS INFOS #Tompiny #MIVATANA MIVATANA:0326169640"""

# Groupe « Expat : Madagascar », VALIDÉE dans la base. Elle dit trois fois
# « longue durée » — et loue quand même à la nuitée, aux vacanciers.
TOURISME_MAISON_DE_VACANCES = """Bonjour à tous
Je propose des locations de vacances à Foulpointe, Majunga , Nosy Be, Tana
Je propose aussi des locations longue durée
FOULPOINTE maison actuellement disponible pour location courte durée ou longue durée
Grande maison plain pied dans une cour
A 10 minutes à pied de la plage
Peut accueillir 8 personnes au maximum
1 chambre parentale avec Salle d'eau ( eau chaude ) et WC
Tarif pour une nuitée : 50 euros ou 250 000 ariary
Tarif mensuel si vous restez un mois ou plusieurs mois : 350 euros"""

# Site de Regina Lodge (Diego-Suarez), PUBLIÉ sur Diako. « Possibilité de
# location longue durée » figure sur la page tarifs d'un hôtel.
TOURISME_LODGE = """Regina Lodge - Hôtel Diego Suarez, Madagascar
5 Chambres Maki et Orchidée · 3 Appartements Ylang, Caméléon, Frangipane
Mid-Week de 11 h au lendemain 18 h.
Possibilité de location longue durée.
Tarifs en Euros — Maki €30 Nuitée"""

# 🔴 LE MOT-DIÈSE QUI TROMPE. « Tian'immo », agence de Tuléar, publie AUSSI
#    des séjours en bord de mer. Écarter sur « #immo » supprimait ces deux-là.
TOURISME_MALGRE_LE_HASHTAG_IMMO = """#tiannimmo
Séjournez dans un cadre exceptionnel en bord de mer à Beravy, Tuléar !
Que ce soit pour un déplacement professionnel, un séjour personnel ou des
vacances en bord de mer, profitez d’un hébergement confortable.
La Cabane vous offre : 3 grands lits doubles, une vue panoramique sur la mer
Location disponible à la journée, au week-end ou à la semaine.
Réservations & renseignements"""

TOURISME_LOCATION_VOITURE = """LOCATION DE VOITURES À TULÉAR
Nissan Patrol  et Terracan – 7 places : Idéal pour les voyages en famille
Tous nos véhicules sont climatisés pour un trajet agréable et confortable.
Réservez dès maintenant !
#Locationdevoiture #locationventevoiture #Locationtulear #tianimmo #tulearrent"""

# 🔴 « MIVAROTRA » VEUT DIRE « VENDRE » N'IMPORTE QUOI. Ce restaurant vend de
#    la viande, pas un terrain. Six textes de la base tombaient sur ce mot.
TOURISME_RESTAURANT_QUI_VEND = """Mivarotra "VIANDES PRÉPARÉES ko izahay
raha te hanao #grillade any antrano
- Cuisse de poulet
- Echine
- Entrecote/ Steak
Restaurant Happy Nouilles
Mahafaly Vatofotsy Antsirabe
034 03 681 17"""

# Le mot « terrain » d'un hôtel : terrain de pétanque, terrain de jeu.
TOURISME_TERRAIN_DE_PETANQUE = """Mazava Loha Resort — baie du tonnerre et
villages de pêcheurs. Services : profitez pleinement de vos vacances.
Terrain de Pétanque et Multi-Activités : profitez de nos terrains de pétanque
ainsi que de beach-volley, beach-tennis. Chambres à partir de 90 000 Ar la nuit."""

GARDES = {
    "« ahofa » mais à la nuitée": TOURISME_AHOFA_A_LA_NUITEE,
    "maison de vacances": TOURISME_MAISON_DE_VACANCES,
    "lodge qui propose du long séjour": TOURISME_LODGE,
    "séjour d'une agence qui fait aussi de l'immo": TOURISME_MALGRE_LE_HASHTAG_IMMO,
    "location de voitures": TOURISME_LOCATION_VOITURE,
    "restaurant qui vend de la viande": TOURISME_RESTAURANT_QUI_VEND,
    "terrain de pétanque": TOURISME_TERRAIN_DE_PETANQUE,
}


def test_le_tourisme_n_est_jamais_ecarte():
    for quoi, texte in GARDES.items():
        assert not ex.parle_d_immobilier(texte), \
            f"{quoi} : écartée à tort ({ex.raisons_immobilier(texte)})"


def test_le_verbe_louer_ne_decide_de_rien():
    """« louer » / « location » sont des deux côtés. Seule la durée tranche.

    Les deux textes déclenchent `MOTIF_LOUER`, et les deux disent « longue
    durée » ; seul le premier parle d'un loyer mensuel sans jamais nommer une
    nuitée. C'est ce qui les sépare, et rien d'autre.
    """
    for texte in (BAIL_APPARTEMENT_PUBLIE, TOURISME_MAISON_DE_VACANCES):
        assert ex.MOTIF_LOUER.search(ex._aplati(texte))
        assert "longue duree" in ex._aplati(texte)
    assert ex.parle_d_immobilier(BAIL_APPARTEMENT_PUBLIE)
    assert not ex.parle_d_immobilier(TOURISME_MAISON_DE_VACANCES)


def test_une_chambre_d_hotel_a_louer_reste_du_tourisme():
    """La forme la plus courante, et la plus dangereuse pour ce filtre."""
    for texte in (
        "Chambre à louer à Nosy Be, 80 000 Ar la nuit, petit déjeuner inclus.",
        "Bungalow à louer les pieds dans l'eau — 150 000 Ar la nuitée.",
        "Villa meublée pour vos vacances à Ifaty, location de vacances, "
        "à partir de 3 nuits.",
    ):
        assert not ex.parle_d_immobilier(texte), texte


def test_un_terrain_qui_n_est_pas_a_vendre_ne_declenche_rien():
    for texte in (
        "Ce qui n’était autrefois qu’un terrain à l’abandon est aujourd’hui un "
        "restaurant entièrement pensé pour vous.",
        "Le lagon de la mer d’Émeraude est un terrain de jeux presque infini "
        "pour les kitesurfers.",
        "Un terrain d’aviation en herbe permet aux avions de tourisme d’y accéder.",
    ):
        assert not ex.parle_d_immobilier(texte), texte


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
