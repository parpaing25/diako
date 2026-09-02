"""Garde-fous sur les doublons : même texte, et même établissement.

Deux problèmes distincts, mesurés dans `data/bot.db` le 24/08/2026 :

  · **Même texte, plusieurs fois.** 2 217 trouvailles pour 2 217 empreintes :
    la déduplication par PERMALIEN marche parfaitement, chaque publication est
    unique. Elle ne voit simplement pas que 163 groupes de textes sont
    identiques mot pour mot — 179 trouvailles en trop, dont **neuf** fois
    « C'est l'heure du repas ! Pensez à Savanna ! ».
  · **Même établissement, des dizaines de fois.** 84 entités reviennent au
    moins deux fois et totalisent 1 238 trouvailles : 83 pour « Nosy Be Hôtel
    & Spa », 61 pour l'« Hôtel Carlton », 55 pour « KIBAN HOTEL Nosy Be ».
    Celles-là ne sont PAS des doublons : ce sont des publications différentes
    du même lieu, qui doivent enrichir UNE fiche. On les regroupe, on ne les
    supprime pas.

    python -m pytest tests/test_doublons.py -q
    python tests/test_doublons.py
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import base  # noqa: E402
from bot import collecteur as co  # noqa: E402


# ════════════════════════════════════════════════════════════════════════════
# ① Le même texte, recollecté ailleurs
# ════════════════════════════════════════════════════════════════════════════

# Le champion de la base : neuf exemplaires, page « Le Savanna Café ».
SAVANNA = """C'est l'heure du repas ! Pensez à Savanna !
Voici le menu de ce Vendredi : du déjeuner jusqu'au dîner !
Rejoignez Le Savanna Café,  hôtel - bar - restaurant à Mandrosoa Ivato,  à 5mn
de l'aéroport,  en face de la Gendarmerie nationale
032 04 760 29
Ouvert de 7h00 à 22h00 7j/7
Sur place ou à emporter
#livraison possible via l'application HOP"""

# Le même, republié : Facebook a remis des majuscules décoratives, changé les
# espaces et ajouté un émoji. Le permalien, lui, est neuf — donc `empreinte()`
# ne le reconnaît pas.
SAVANNA_REPUBLIE = SAVANNA.replace("C'est l'heure", "C’EST L’HEURE").replace(
    " ! ", " ! 🍽 ")


def test_le_meme_texte_a_la_meme_signature_malgre_la_mise_en_forme():
    assert co.empreinte_texte(SAVANNA) == co.empreinte_texte(SAVANNA_REPUBLIE)


def test_deux_textes_differents_ont_deux_signatures():
    autre = SAVANNA.replace("Savanna", "Chez Mariette")
    assert co.empreinte_texte(SAVANNA) != co.empreinte_texte(autre)


def test_un_texte_court_n_a_pas_de_signature():
    """🔴 « Bonne journée à tous 🌞 » écrit par deux hôtels n'est pas un doublon,
    c'est une politesse. Sous 120 caractères utiles, on ne dédoublonne pas."""
    assert co.empreinte_texte("Bonne journée à tous 🌞") == ""
    assert co.empreinte_texte("") == ""
    assert co.empreinte_texte("Réservez vite !") == ""
    assert co.empreinte_texte(SAVANNA) != ""


def test_l_empreinte_de_publication_ne_voit_PAS_le_doublon_de_contenu():
    """Pourquoi une deuxième empreinte est nécessaire : deux permaliens
    différents portant le même texte donnent deux empreintes différentes."""
    a = co.empreinte(SAVANNA, "https://www.facebook.com/savanna/posts/111")
    b = co.empreinte(SAVANNA, "https://www.facebook.com/savanna/posts/222")
    assert a != b
    assert co.empreinte_texte(SAVANNA) == co.empreinte_texte(SAVANNA)


# ════════════════════════════════════════════════════════════════════════════
# ② Le même établissement, des dizaines de publications
# ════════════════════════════════════════════════════════════════════════════
# Les trois clés, dans l'ordre de fiabilité, avec de vraies valeurs de la base.
HOTEL_CARLTON = {
    "page_id": "4cd21b1b-7e51-4648-ab25-5fb062558a51",
    "page_facebook": "https://www.facebook.com/HotelCarltonMadagascar",
    "page_nom": "Hôtel Carlton",
    "nom_etab": "Hotel Carlton Madagascar",
}
KIBAN = {                       # 55 publications, aucune fiche Diako rattachée
    "page_id": None,
    "page_facebook": "https://www.facebook.com/KibanHotelNosybe",
    "page_nom": None,
    "nom_etab": "KIBAN HOTEL Nosy Be",
}


def test_la_fiche_diako_prime_sur_la_page_facebook():
    """Deux pages Facebook rattachées à la MÊME fiche doivent se regrouper."""
    autre_page = dict(HOTEL_CARLTON,
                      page_facebook="https://www.facebook.com/carlton.tana")
    assert base.cle_entite(HOTEL_CARLTON) == base.cle_entite(autre_page)
    assert base.cle_entite(HOTEL_CARLTON).startswith("fiche:")


def test_a_defaut_de_fiche_c_est_la_page_facebook():
    assert base.cle_entite(KIBAN) == "fb:https://www.facebook.com/kibanhotelnosybe"
    # La barre finale et la casse ne doivent pas séparer un groupe en deux.
    avec_barre = dict(KIBAN, page_facebook=KIBAN["page_facebook"].upper() + "/")
    assert base.cle_entite(avec_barre) == base.cle_entite(KIBAN)


def test_a_defaut_de_page_c_est_le_nom():
    """⚠ Accents et gras Unicode repliés : Facebook écrit « Hôtel » et
    « Hotel » indifféremment, parfois « 𝗛𝗢𝗧𝗘𝗟 ». Trois écritures d'un seul
    établissement feraient trois groupes voisins."""
    reference = base.cle_entite({"nom_etab": "Nosy Be Hôtel & Spa"})
    assert reference == "nom:nosybehotelspa"
    assert base.cle_entite({"nom_etab": "NOSY BE HOTEL SPA"}) == reference
    assert base.cle_entite({"nom_etab": "𝗡𝗼𝘀𝘆 𝗕𝗲 𝗛𝗼̂𝘁𝗲𝗹 & 𝗦𝗽𝗮"}) == reference


def test_une_trouvaille_sans_rien_reste_seule():
    """🔴 561 lignes de la base n'ont ni fiche, ni page, ni nom. Les regrouper
    ferait un bloc « Établissement sans nom — 561 publications », inutilisable."""
    assert base.cle_entite({}) == ""
    assert base.cle_entite({"nom_etab": "  "}) == ""
    assert base.cle_entite({"nom_etab": "AB"}) == ""     # trop court


def test_le_nom_du_groupe_prefere_la_fiche_relue():
    assert base.nom_entite(HOTEL_CARLTON) == "Hôtel Carlton"
    assert base.nom_entite(KIBAN) == "KIBAN HOTEL Nosy Be"


def test_le_libelle_d_enregistrement_de_lieu_est_coupe():
    """Le plus gros groupe de la base (83 publications) s'appelle littéralement
    « Nosy Be Hôtel & Spa est à Nosy Be Hôtel & Spa. » — c'est la phrase que
    Facebook écrit quand une page s'enregistre chez elle-même."""
    assert base.nom_entite(
        {"nom_etab": "Nosy Be Hôtel & Spa est à Nosy Be Hôtel & Spa."}
    ) == "Nosy Be Hôtel & Spa"
    assert base.nom_entite(
        {"nom_etab": "Madiro Hôtel - Nosy Be a actualisé son statut"}
    ) == "Madiro Hôtel - Nosy Be"


def test_le_nom_du_groupe_est_aplati_et_coupe():
    """Un `nom_etab` mal extrait peut valoir une phrase entière en gras Unicode :
    « 𝗩𝗼𝘆𝗮𝗴𝗲𝗿, 𝗰'𝗲𝘀𝘁 𝗱𝗲́𝗰𝗼𝘂𝘃𝗿𝗶𝗿… » coiffait un groupe de 52 publications."""
    long_nom = base.nom_entite({"nom_etab": "𝗩𝗼𝘆𝗮𝗴𝗲𝗿, 𝗰’𝗲𝘀𝘁 𝗱𝗲́𝗰𝗼𝘂𝘃𝗿𝗶𝗿. "
                                            "𝗖’𝗲𝘀𝘁 𝗮𝘂𝘀𝘀𝗶 𝗿𝗲𝘀𝗽𝗲𝗰𝘁𝗲𝗿 𝗹𝗲𝘀 𝗴𝗲𝗻𝘀 "
                                            "𝗲𝘁 𝗹𝗲𝘀 𝗹𝗶𝗲𝘂𝘅 𝗾𝘂𝗲 𝗹’𝗼𝗻 𝘃𝗶𝘀𝗶𝘁𝗲"})
    # Le gras Unicode est ramené à des lettres ordinaires…
    assert long_nom.startswith("Voyager, c’est découvrir")
    # …et la phrase est coupée : un titre de bloc, pas un paragraphe.
    assert len(long_nom) <= 61 and long_nom.endswith("…")
    # Un nom court, lui, n'est ni coupé ni décoré.
    assert base.nom_entite({"nom_etab": "Vanila Hotel & Spa Nosy Be"}) \
        == "Vanila Hotel & Spa Nosy Be"


# ════════════════════════════════════════════════════════════════════════════
# ③ De bout en bout, sur une base neuve
# ════════════════════════════════════════════════════════════════════════════
def _base_jetable():
    """Une base SQLite neuve dans un dossier temporaire.

    ⚠ ON NE TOUCHE JAMAIS `data/bot.db` : le bot tourne en permanence sur le
      port 8757, et un test qui écrit dans sa base la corromprait sous ses pieds.
    """
    dossier = Path(tempfile.mkdtemp(prefix="diako-test-"))
    base.BASE = dossier / "essai.db"
    base.DOSSIER_DONNEES = dossier
    base.initialiser()
    return dossier


def test_de_bout_en_bout_signature_et_regroupement():
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()

        # Trois publications du Carlton, dont deux au texte identique.
        for rang, texte in enumerate((SAVANNA, SAVANNA_REPUBLIE,
                                      SAVANNA.replace("Savanna", "Carlton"))):
            base.creer({
                "empreinte": f"permalien-{rang}",
                "empreinte_texte": co.empreinte_texte(texte),
                "texte": texte, "statut": "a_trier", "genre": "carte",
                **HOTEL_CARLTON,
            })

        # ① Le doublon de contenu est reconnu…
        deja = base.texte_deja_vu(co.empreinte_texte(SAVANNA_REPUBLIE))
        assert deja is not None
        # …mais pas confondu avec le texte différent.
        autre = co.empreinte_texte(SAVANNA.replace("Savanna", "Carlton"))
        assert base.texte_deja_vu(autre) != deja

        # ② Les trois sont regroupées sous une seule entité.
        liste = base.lister(statut="a_trier")
        assert len(liste) == 3
        cles = {t["groupe_cle"] for t in liste}
        assert cles == {f"fiche:{HOTEL_CARLTON['page_id']}"}
        assert all(t["groupe_nom"] == "Hôtel Carlton" for t in liste)
        assert all(t["groupe_total"] == 3 for t in liste)
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


def test_le_total_du_groupe_suit_les_filtres_de_la_liste():
    """🔴 Un total « toutes trouvailles confondues » afficherait 61 dans une
    file où trois seulement attendent d'être triées."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        for rang, statut in enumerate(("a_trier", "a_trier", "publiee", "rejetee")):
            base.creer({"empreinte": f"p{rang}", "texte": f"texte numéro {rang}",
                        "statut": statut, **KIBAN})
        a_trier = base.lister(statut="a_trier")
        assert len(a_trier) == 2
        assert all(t["groupe_total"] == 2 for t in a_trier)
        assert all(t["groupe_total"] == 4 for t in base.lister(statut="tous"))
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


def test_une_rejetee_ne_bloque_pas_une_nouvelle_collecte():
    """Écarter à la main une publication ne doit pas interdire de recollecter
    le même texte si l'on change d'avis sur le genre."""
    ancienne_base, ancien_dossier = base.BASE, base.DOSSIER_DONNEES
    try:
        _base_jetable()
        base.creer({"empreinte": "rejet", "empreinte_texte": co.empreinte_texte(SAVANNA),
                    "texte": SAVANNA, "statut": "rejetee"})
        assert base.texte_deja_vu(co.empreinte_texte(SAVANNA)) is None
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne_base, ancien_dossier


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
