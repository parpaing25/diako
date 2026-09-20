"""Ce qui a été corrigé le 20/09/2026 après le premier vrai échange avec Andry.

Il avait demandé « fais une publication photo belle de Nosy Be pour souhaiter
une bonne dimanche… » et le bot lui avait répondu « Quel(s) fichier(s) photo(s)
veux-tu joindre ? ». Chaque test ci-dessous tient l'un des défauts trouvés en
réparant ça. Tout est hors ligne : ni Telegram, ni Groq, ni Commons, ni base.
"""
from __future__ import annotations

import json

import pytest

from bot import cerveau, competences, photos, redaction


@pytest.fixture(autouse=True)
def registre_charge():
    competences.charger_toutes()


# ── La photo : on ne demande plus de chemin, on cherche ───────────────────
def test_les_pistes_sortent_le_nom_propre_du_titre():
    """« Bon dimanche depuis Nosy Be » ne désigne aucun lieu : il faut « Nosy Be »."""
    pistes = photos._pistes("Bon dimanche depuis Nosy Be")
    assert pistes[0] == "Nosy Be"


def test_les_pistes_ecartent_les_mots_courants():
    pistes = photos._pistes("belle photo pour dimanche")
    assert all(p.lower() not in {"belle", "photo", "dimanche"} for p in pistes)


def test_une_photo_sans_licence_libre_nest_jamais_retenue(monkeypatch):
    """Une image « reprise avec attribution » n'a pas de licence : elle est écartée."""
    monkeypatch.setattr(photos, "_depuis_base", lambda sujet: [])
    monkeypatch.setattr(photos, "_depuis_commons", lambda sujet, combien=8: [])
    assert photos.photo_pour("Nosy Be") is None


def test_la_photo_de_notre_base_passe_avant_commons(monkeypatch):
    """Commons est bien interrogé pour offrir du choix, mais NOTRE photo sort en tête :
    elle est deja hebergee, deja creditee, et c'est celle que le site montre."""
    nomination = []
    monkeypatch.setattr(photos, "_depuis_base", lambda sujet: [
        {"genre": "lieu", "slug": "nosy-be", "nom": "Nosy Be", "url": "https://x/nosy.jpg",
         "credit": "mwanasimba", "licence": "CC BY-SA 2.0", "source": "https://commons/…"}])
    monkeypatch.setattr(photos, "_depuis_commons",
                        lambda sujet, combien=8: nomination.append(sujet) or [])
    monkeypatch.setattr(photos, "telecharger", lambda c: __import__("pathlib").Path("x.jpg"))
    choisie = photos.photo_pour("Nosy Be")
    assert choisie["genre"] == "lieu" and choisie["slug"] == "nosy-be"
    assert photos.candidats("Nosy Be", 4)[0]["genre"] == "lieu"


# ── Le modèle : ses questions techniques ne bloquent plus ─────────────────
def test_une_question_technique_ne_remplace_pas_l_action():
    """Le modèle réclamait « chemin, auteur, licence » : on agit quand même."""
    secours = cerveau._arguments_de_secours("preparer_publication", "publication sur Nosy Be")
    assert secours == {"sujet": "publication sur Nosy Be"}


def test_un_appel_rejete_par_groq_est_rattrape():
    """400 « tool_use_failed » porte l'appel du modèle : il ne doit pas être perdu."""

    class FausseReponse:
        def json(self):
            return {"error": {"code": "tool_use_failed",
                              "failed_generation": json.dumps(
                                  {"name": "etat_page", "arguments": {}})}}

    rattrape = cerveau._rattraper_groq(FausseReponse())
    assert rattrape["content"][0]["name"] == "etat_page"


def test_une_phrase_rejetee_par_groq_est_rendue_telle_quelle():
    class FausseReponse:
        def json(self):
            return {"error": {"code": "tool_use_failed",
                              "failed_generation": "Quel lieu veux-tu mettre en avant ?"}}

    rattrape = cerveau._rattraper_groq(FausseReponse())
    assert rattrape["content"][0]["type"] == "text"
    assert "Quel lieu" in rattrape["content"][0]["text"]


def test_un_outil_impose_est_le_seul_envoye():
    """Groq rejette toute la requête si le modèle appelle un autre outil."""
    assert len(cerveau._outils("etat_page")) == 1
    assert len(cerveau._outils()) > 20


# ── Le texte : la question n'est posée qu'une fois ────────────────────────
def test_la_question_reformulee_dans_le_corps_est_retiree():
    corps = "Et vous, vous préférez partir en vacances juste après les foules ou pendant ?"
    question = "Préférez-vous partir en vacances juste après les personnes ou pendant les bains de foules ?"
    assert redaction._meme_question(corps, question)


def test_une_autre_question_est_gardee():
    assert not redaction._meme_question(
        "Saviez-vous que le parc abrite l'indri ?",
        "Préférez-vous partir juste après les personnes ?")


def test_le_titre_nest_plus_obligatoire():
    """« Il me manque : titre » n'est pas une réponse à « fais une publication »."""
    assert competences.REGISTRE["preparer_publication"].obligatoires == ()
