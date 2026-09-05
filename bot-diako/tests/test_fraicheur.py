"""Garde-fous sur la fraîcheur : lire la date d'une publication, et n'accepter
que l'année en cours.

Chiffres de départ, relevés dans `data/bot.db` le 24/08/2026 — chacun est la
raison d'être d'un test de ce fichier :

  · 2 217 trouvailles, dont **2 seulement** portent une date lue (`publie_le`).
    Ces deux dates valent littéralement '6\\xa0h' et '7\\xa0h' : le nombre et
    l'unité sont séparés par une ESPACE INSÉCABLE (U+00A0).
  · 2 215 `date_post` étaient donc FABRIQUÉS — `date_de_publication()` rendait
    la date du jour dès que l'âge était inconnu ; une publication de 2019 était
    enregistrée comme publiée ce matin.
  · 138 trouvailles chiffrées portent, à cause de ça, un `prix_vu_le` inventé.

    python -m pytest tests/test_fraicheur.py -q
    python tests/test_fraicheur.py
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import collecteur as co  # noqa: E402
from bot import redaction  # noqa: E402
from bot.config import DEFAUTS  # noqa: E402

# Le jour de référence de tous les tests. Fixé pour que « 12 décembre » sans
# année ait un sens vérifiable — sinon le résultat change à chaque exécution.
AUJ = date(2026, 8, 24)


# ════════════════════════════════════════════════════════════════════════════
# ① L'espace insécable : le détail qui décidait de tout
# ════════════════════════════════════════════════════════════════════════════
# Les deux SEULES dates de la base, copiées telles quelles.
DATE_REELLE_1 = "6\u00a0h"   # <- U+00A0, pas une espace ordinaire
DATE_REELLE_2 = "7\u00a0h"


def test_les_deux_seules_dates_reelles_de_la_base():
    assert co._age_en_jours(DATE_REELLE_1, AUJ) == 0
    assert co._age_en_jours(DATE_REELLE_2, AUJ) == 0
    assert co.date_de_publication(DATE_REELLE_1, AUJ) == "2026-08-24"


def test_les_autres_espaces_exotiques():
    """Insécable étroite, fine, largeur nulle : Facebook FR les emploie aussi."""
    assert co._age_en_jours("1\u202fj", AUJ) == 1
    assert co._age_en_jours("3\u2009sem.", AUJ) == 21
    assert co._age_en_jours("2\u200bj", AUJ) == 2


# ════════════════════════════════════════════════════════════════════════════
# ② Le relatif — et le piège « 8 janvier » lu « 8 j »
# ════════════════════════════════════════════════════════════════════════════
def test_les_formes_relatives():
    assert co._age_en_jours("Hier", AUJ) == 1
    assert co._age_en_jours("yesterday", AUJ) == 1
    assert co._age_en_jours("45 min", AUJ) == 0
    assert co._age_en_jours("il y a 3 heures", AUJ) == 0
    assert co._age_en_jours("2 j", AUJ) == 2
    assert co._age_en_jours("5 sem.", AUJ) == 35
    assert co._age_en_jours("3 mois", AUJ) == 90
    assert co._age_en_jours("2 ans", AUJ) == 730


def test_un_mois_ecrit_en_toutes_lettres_n_est_pas_un_nombre_de_jours():
    """🔴 « 8 janvier » valait « 8 j » : l'ancien motif s'arrêtait au « j ».

    C'est ce défaut qui rendait le filtre de fraîcheur inopérant sur les dates
    absolues : une publication de janvier passait pour vieille de huit jours.
    """
    assert co._age_en_jours("8 janvier", AUJ) == 228     # et non 8
    assert co._age_en_jours("8 juillet", AUJ) == 47      # et non 8
    assert co._age_en_jours("2 mai", AUJ) == 114         # et non 2 ("mn"/"mo")
    assert co._age_en_jours("3 décembre", AUJ) == 264    # et non 3 ("d")


# ════════════════════════════════════════════════════════════════════════════
# ③ L'absolu, avec et sans année, en français, en malgache et en anglais
# ════════════════════════════════════════════════════════════════════════════
def test_dates_absolues_avec_annee():
    for forme in ("12 août 2019", "12 aout 2019", "12 aogositra 2019",
                  "August 12, 2019", "12 Aug 2019", "12/08/2019", "2019-08-12"):
        assert co.date_de_publication(forme, AUJ) == "2019-08-12", forme
        assert co.annee_de_publication(forme, AUJ) == 2019, forme


def test_sans_annee_le_mois_passe_est_cette_annee():
    assert co.date_de_publication("12 août", AUJ) == "2026-08-12"
    assert co.date_de_publication("Aug 12", AUJ) == "2026-08-12"


def test_sans_annee_un_mois_a_venir_est_l_an_dernier():
    """Convention Facebook : « 12 décembre » lu un 24 août, c'est décembre 2025.

    Facebook n'omet l'année que sur les douze derniers mois ; une date qui
    tomberait dans le futur ne peut donc être que celle de l'an passé.
    """
    assert co.date_de_publication("12 décembre", AUJ) == "2025-12-12"
    assert co.annee_de_publication("12 décembre", AUJ) == 2025
    assert co.date_de_publication("25 septembre", AUJ) == "2025-09-25"


def test_une_date_future_ne_donne_jamais_un_age_negatif():
    """Horloge décalée, fuseau : un âge négatif passerait tous les filtres."""
    assert co._age_en_jours("2027-01-01", AUJ) == 0


# ════════════════════════════════════════════════════════════════════════════
# ④ L'inconnu : on GARDE, mais on ne prétend plus que c'est aujourd'hui
# ════════════════════════════════════════════════════════════════════════════
def test_une_date_illisible_ne_devient_plus_aujourd_hui():
    """🔴 LE MENSONGE CORRIGÉ. 2 215 trouvailles sur 2 217 étaient dans ce cas.

    L'ancienne version rendait `date.today()` : un post de 2019 était
    enregistré comme publié ce matin, et `prix_vu_le` reprenait la date.
    """
    for illisible in ("", "   ", "Voir plus", "Facebook", "Sponsorisé"):
        assert co.date_de_publication(illisible, AUJ) == "", illisible
        assert co._age_en_jours(illisible, AUJ) is None, illisible
        assert co.annee_de_publication(illisible, AUJ) is None, illisible


def test_l_annee_inconnue_laisse_passer():
    """⚠⚠ DÉCISION ASSUMÉE : refuser l'inconnu supprimerait 99 % de la collecte.

    Le filtre `annee_minimum` s'écrit `annee is not None and annee < minimum` :
    None ne le déclenche jamais. On vérifie ici la valeur qui sert de garde.
    """
    annee = co.annee_de_publication("aucune date ici", AUJ)
    assert annee is None
    assert not (annee is not None and annee < 2026)


def test_le_reglage_annee_minimum_existe_et_vaut_2026():
    assert DEFAUTS["annee_minimum"] == 2026


def test_ce_que_le_filtre_ecarterait():
    """La règle métier, telle qu'appliquée dans `_parcourir`."""
    minimum = DEFAUTS["annee_minimum"]

    def ecartee(heure):
        annee = co.annee_de_publication(heure, AUJ)
        return annee is not None and annee < minimum

    assert ecartee("12 août 2019") is True
    assert ecartee("2 ans") is True                 # 2024
    assert ecartee("12 décembre") is True           # décembre 2025
    assert ecartee("6\u00a0h") is False
    assert ecartee("12 août") is False              # août 2026
    assert ecartee("") is False                     # l'inconnu passe


# ════════════════════════════════════════════════════════════════════════════
# ⑤ Ce que la date vide change en aval : le prix ne ment plus
# ════════════════════════════════════════════════════════════════════════════
def test_un_prix_sans_date_de_publication_le_dit():
    """« relevé le » date le TARIF ; sans date de publication, on n'a que la
    date de lecture — et la phrase doit le dire."""
    sans_date = {"prix_ar": 120_000, "prix_unite": "nuit", "prix_vu_le": None,
                 "date_post": "", "collecte_le": "2026-08-24T10:00:00+00:00"}
    assert redaction.bloc_prix(sans_date).endswith(
        "lu le 24/08/2026 (date de publication inconnue)")

    avec_date = dict(sans_date, prix_vu_le="2019-08-12")
    assert redaction.bloc_prix(avec_date).endswith("relevé le 12/08/2019")


def test_le_prix_reste_lisible_sans_aucune_date():
    assert redaction.bloc_prix(
        {"prix_ar": 5_000, "prix_unite": "plat"}) == "5 000 Ar le plat"


# ════════════════════════════════════════════════════════════════════════════
# ⑥ Le sélecteur JS : ce qu'on a tenté, faute d'avoir pu inspecter le DOM
# ════════════════════════════════════════════════════════════════════════════
def test_le_selecteur_js_tente_bien_toutes_les_pistes():
    """⚠ LE DOM RÉEL N'A PAS PU ÊTRE INSPECTÉ LE 24/08/2026 (aucune session
    Facebook ouverte, et le bot ne devait pas être relancé). Ce test fige donc
    ce qui EST TENTÉ, pas ce que Facebook répond : le jour où l'une des pistes
    cesse d'exister, on saura laquelle on avait prévue.
    """
    js = co.JS_EXTRAIRE_FIL
    for piste in ("abbr[data-utime]",          # ① horodatage exact
                  "aria-label",                # ② étiquette du lien
                  "data-tooltip-content",      # ③ infobulle
                  'a[href*="/posts/"]',
                  'a[href*="story_fbid"]'):
        assert piste in js, piste
    # ⚠ La date du CORPS du message (« Vendredi 7 août » d'une affiche de
    #   concert) ne doit jamais être prise pour la date de publication.
    assert 'dansLeMessage' in js
    assert '[data-ad-preview="message"]' in js
    # Chaîne Python non brute : un antislash simple casserait la regex JS.
    assert "\\\\s" in repr(js) or "\\s" in js


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
