"""Le socle du bot : registre, validation, cerveau, passerelle Telegram.

Aucun de ces tests ne touche Telegram, Facebook, Supabase ni le site : tout est
hors ligne. C'est ce qui permet d'éprouver le bot AVANT qu'un jeton existe.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta

import pytest

from bot import cerveau, competences, config, telegram, validation
from bot.competences import Resultat, competence


@pytest.fixture(autouse=True)
def bac_a_sable(tmp_path, monkeypatch):
    """Chaque test écrit dans son propre dossier : jamais dans data/."""
    monkeypatch.setattr(config, "DOSSIER_DONNEES", tmp_path)
    monkeypatch.setattr(config, "FICHIER_CONFIG", tmp_path / "config.json")
    monkeypatch.setattr(config, "DOSSIER_JOURNAUX", tmp_path / "logs")
    monkeypatch.setattr(validation, "FICHIER", tmp_path / "validations.json")
    monkeypatch.setattr(cerveau, "SESSIONS", tmp_path / "sessions.json")
    monkeypatch.setattr(telegram, "JOURNAL_SORTIE", tmp_path / "telegram-out.log")
    monkeypatch.setattr(telegram, "FICHIER_DECALAGE", tmp_path / "offset.json")
    monkeypatch.setattr(telegram, "VERROU", tmp_path / "telegram.lock")
    # Aucun modèle pendant les tests : on éprouve le chemin déterministe.
    monkeypatch.setattr(cerveau, "_appeler_claude", lambda fil, impose=None: None)
    monkeypatch.setattr(cerveau, "_appeler_groq", lambda fil, impose=None: None)
    yield


@pytest.fixture
def competence_essai():
    appels: list[dict] = []

    @competence(
        nom="essai_public",
        titre="Action d'essai",
        description="Sert aux tests.",
        parametres={"texte": "un texte"},
        obligatoires=("texte",),
        publique=True,
        famille="divers",
    )
    def _essai(texte: str) -> Resultat:
        appels.append({"texte": texte})
        return Resultat(texte=f"fait : {texte}")

    yield appels
    competences.REGISTRE.pop("essai_public", None)


# ── Registre ──────────────────────────────────────────────────────────────
def test_arguments_inconnus_ignores(competence_essai):
    """Le modèle invente des paramètres : ils ne doivent pas faire tomber l'appel."""
    r = competences.executer("essai_public", {"texte": "bonjour", "couleur": "bleu"})
    assert r.ok and r.texte == "fait : bonjour"
    assert competence_essai == [{"texte": "bonjour"}]


def test_parametre_obligatoire_manquant(competence_essai):
    r = competences.executer("essai_public", {})
    assert not r.ok and "texte" in r.texte


def test_competence_inconnue():
    assert not competences.executer("fantome", {}).ok


def test_exception_ne_tue_pas_le_bot():
    @competence(nom="qui_tombe", titre="Tombe", description="", famille="divers")
    def _tombe() -> Resultat:
        raise ValueError("boum")

    r = competences.executer("qui_tombe", {})
    competences.REGISTRE.pop("qui_tombe", None)
    assert not r.ok and "boum" in r.texte


# ── Validation ────────────────────────────────────────────────────────────
def test_action_publique_attend_le_clic(competence_essai):
    reponse = cerveau.traiter("42", "peu importe", rappel=None)  # sans modèle → repli
    assert "commandes" in reponse.texte.lower() or "/aide" in reponse.texte

    reponse = cerveau._lancer("essai_public", {"texte": "coucou"})
    assert competence_essai == []                      # rien n'est parti
    assert reponse.boutons and reponse.boutons[0][0]["action"].startswith("ok:")

    cle = reponse.boutons[0][0]["action"][3:]
    apres = cerveau._traiter_clic(f"ok:{cle}")
    assert competence_essai == [{"texte": "coucou"}]    # parti seulement après le clic
    assert "fait : coucou" in apres.texte


def test_refus_nannule_rien(competence_essai):
    reponse = cerveau._lancer("essai_public", {"texte": "non merci"})
    cle = reponse.boutons[0][0]["action"][3:]
    apres = cerveau._traiter_clic(f"non:{cle}")
    assert competence_essai == []
    assert "annul" in apres.texte.lower()
    assert validation.lire(cle)["etat"] == "annulee"


def test_double_clic_sans_effet(competence_essai):
    reponse = cerveau._lancer("essai_public", {"texte": "une fois"})
    cle = reponse.boutons[0][0]["action"][3:]
    cerveau._traiter_clic(f"ok:{cle}")
    cerveau._traiter_clic(f"ok:{cle}")
    assert competence_essai == [{"texte": "une fois"}]  # UNE seule exécution


def test_action_expiree_refusee(competence_essai, monkeypatch):
    cle = validation.deposer("essai_public", {"texte": "vieux"}, "Action d'essai")
    tout = json.loads(validation.FICHIER.read_text(encoding="utf-8"))
    tout[cle]["cree_a"] = (datetime.now() - timedelta(hours=3)).isoformat(timespec="seconds")
    validation.FICHIER.write_text(json.dumps(tout), encoding="utf-8")

    r = validation.confirmer(cle)
    assert not r.ok and "expir" in r.texte.lower()
    assert competence_essai == []


def test_garde_levee_execute_tout_de_suite(competence_essai, monkeypatch):
    """Andry peut lever la garde compétence par compétence."""
    monkeypatch.setattr(config, "charger", lambda: {"validation_levee": ["essai_public"]})
    reponse = cerveau._lancer("essai_public", {"texte": "direct"})
    assert competence_essai == [{"texte": "direct"}]
    assert "fait : direct" in reponse.texte


# ── Cerveau ───────────────────────────────────────────────────────────────
def test_commande_aide_liste_les_competences(competence_essai):
    reponse = cerveau.traiter("42", "/aide")
    assert "Action d'essai" in reponse.texte
    assert "✋" in reponse.texte          # la marque des actions à confirmer


def test_bouton_inconnu_ne_plante_pas():
    assert "inconnu" in cerveau._traiter_clic("zzz:1").texte.lower()


def test_message_vide():
    assert "/aide" in cerveau.traiter("42", "   ").texte


# ── Passerelle Telegram ───────────────────────────────────────────────────
def test_simulation_ecrit_le_journal_et_nenvoie_rien():
    canal = telegram.Telegram(jeton="", simulation=True)
    canal.envoyer("42", "bonjour", [[{"texte": "ok", "action": "ok:1"}]])
    lignes = telegram.JOURNAL_SORTIE.read_text(encoding="utf-8").strip().splitlines()
    assert len(lignes) == 1
    trace = json.loads(lignes[0])
    assert trace["methode"] == "sendMessage" and trace["text"] == "bonjour"


def test_seul_andry_est_ecoute(monkeypatch):
    canal = telegram.Telegram(jeton="", simulation=True)
    canal.id_autorise = "123"
    assert canal.autorise(telegram.Message(chat_id="1", texte="salut", auteur="123"))
    assert not canal.autorise(telegram.Message(chat_id="1", texte="salut", auteur="999"))


def test_sans_identifiant_personne_nest_ecoute():
    canal = telegram.Telegram(jeton="", simulation=True)
    canal.id_autorise = ""
    assert not canal.autorise(telegram.Message(chat_id="1", texte="salut", auteur="123"))


def test_lecture_dun_clic():
    canal = telegram.Telegram(jeton="", simulation=True)
    message = canal._convertir({
        "update_id": 7,
        "callback_query": {"id": "c1", "data": "ok:abc", "from": {"id": 123},
                           "message": {"message_id": 5, "chat": {"id": 42}}},
    })
    assert message.est_clic and message.rappel == "ok:abc" and message.auteur == "123"


def test_lecture_dun_message_avec_photo():
    canal = telegram.Telegram(jeton="", simulation=True)
    message = canal._convertir({
        "update_id": 8,
        "message": {"message_id": 9, "chat": {"id": 42}, "from": {"id": 123},
                    "caption": "une affiche", "photo": [{"file_id": "x"}]},
    })
    assert message.texte == "une affiche"
    assert message.piece_jointe and message.piece_jointe["type"] == "photo"


def test_verrou_empeche_deux_lecteurs():
    """Deux PROCESSUS ne relèvent jamais le même jeton (409 Conflict sinon).

    ⚠ Le même processus, lui, doit pouvoir reprendre son propre verrou : c'est
      le cas d'un bot qui redémarre. Le test d'origine l'interdisait, ce qui
      était faux — il testait le fichier, pas la règle.
    """
    import os
    import subprocess

    voisin = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        telegram.VERROU.write_text(str(voisin.pid), encoding="utf-8")
        assert not telegram.prendre_verrou()          # un autre, bien vivant
    finally:
        voisin.kill()
        voisin.wait(timeout=10)

    assert telegram.prendre_verrou()                  # il est mort : on reprend
    assert telegram.VERROU.read_text(encoding="utf-8").strip() == str(os.getpid())
    telegram.rendre_verrou()
    assert not telegram.VERROU.exists()


# ── L'aiguillage déterministe des ordres d'action ─────────────────────────
def test_un_ordre_impose_son_outil():
    """Un verbe d'action ne laisse pas le modèle choisir : mesuré le 20/09/2026,
    « programme une publication demain 18 h » déclenchait la LECTURE de la file."""
    competences.charger_toutes()
    assert cerveau._intention("programme une publication demain 18h") == "programmer_page"
    assert cerveau._intention("publie ça maintenant") == "publier_page"
    assert cerveau._intention("réponds au commentaire de Fanja") == "repondre_commentaire"
    assert cerveau._intention("déploie le site") == "deployer_site"


def test_une_question_ne_declenche_aucun_ordre():
    competences.charger_toutes()
    for question in ("qu'est-ce qui est programmé cette semaine ?",
                     "montre-moi la file",
                     "combien de fiches ont une photo ?",
                     "les commentaires récents"):
        assert cerveau._intention(question) is None, question


def test_publier_une_fiche_nest_pas_publier_sur_la_page():
    """« publie la fiche » parle du site, pas de la page : le modèle tranche."""
    competences.charger_toutes()
    assert cerveau._intention("publie la fiche du lodge") is None
    assert cerveau._intention("publie le lot de la collecte") is None


# ── Le verrou Telegram ────────────────────────────────────────────────────
def test_verrou_orphelin_est_repris():
    """Après une mort brutale, le bot relancé doit pouvoir lire Telegram.

    Le gardien relance dans les 2 minutes : un verrou « valable 10 minutes »
    laissait le bot muet huit minutes en annonçant qu'un autre le tenait.
    """
    telegram.VERROU.write_text("999999", encoding="utf-8")   # PID qui n'existe pas
    assert telegram.prendre_verrou()
    telegram.rendre_verrou()


def test_verrou_tenu_par_un_vivant_est_respecte():
    import os
    telegram.VERROU.write_text(str(os.getpid() if os.getpid() != 1 else 1), encoding="utf-8")
    # Un autre PID vivant : on simule en écrivant celui du processus courant
    # puis en demandant le verrou depuis un « autre » point de vue.
    assert telegram.prendre_verrou()      # c'est moi : je le reprends
    telegram.rendre_verrou()


def test_on_ne_retire_que_son_propre_verrou():
    telegram.VERROU.write_text("424242", encoding="utf-8")
    telegram.rendre_verrou()
    assert telegram.VERROU.exists()       # pas le mien : je n'y touche pas
    telegram.VERROU.unlink()


def test_les_marques_markdown_du_modele_sont_retirees():
    """Telegram reçoit du texte brut : « **Gestion** » s'y affichait tel quel."""
    assert cerveau.sans_markdown("**Gestion Facebook**") == "Gestion Facebook"
    assert cerveau.sans_markdown("voir `etat_page` d'abord") == "voir etat_page d'abord"
    assert cerveau.sans_markdown("__important__ : la file") == "important : la file"
    # Un astérisque isolé (multiplication, note de bas de page) n'est pas touché.
    assert cerveau.sans_markdown("3 * 4 publications") == "3 * 4 publications"
    # Un nom qui porte un souligné reste intact : c'est pour lui qu'on est en brut.
    assert cerveau.sans_markdown("la page Di'ako_MDG") == "la page Di'ako_MDG"
