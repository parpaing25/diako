# -*- coding: utf-8 -*-
"""Banc des compétences « page Facebook » — HORS LIGNE, sans jamais toucher la page.

    python -m pytest bot-telegram/tests/test_meta.py -q

🔴 AUCUN test n'écrit sur la vraie page Di'ako : `_get`, `_post` et `_supprimer`
   sont remplacés dans chaque test, et un test qui laisserait passer un vrai
   appel réseau est arrêté par `pas_de_reseau` (autouse).

Chaque cas protège un incident déjà payé — l'incident est cité au-dessus du test.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent          # …/bot-telegram
if str(RACINE) not in sys.path:
    sys.path.insert(0, str(RACINE))

from bot import meta  # noqa: E402

TANA = timezone(timedelta(hours=3))
PAGE = meta.PAGE


# ── Le filet : aucun appel réseau ne doit sortir d'un test ───────────────
@pytest.fixture(autouse=True)
def pas_de_reseau(monkeypatch, tmp_path):
    def interdit(*a, **k):  # pragma: no cover
        raise AssertionError("appel réseau réel dans un test — interdit")

    monkeypatch.setattr(meta.requests, "get", interdit)
    monkeypatch.setattr(meta.requests, "post", interdit)
    monkeypatch.setattr(meta.requests, "delete", interdit)
    monkeypatch.setattr(meta, "_jeton", lambda: "JETON-BIDON")
    # Le journal vit dans le dossier du test, jamais dans logs/ du dépôt.
    monkeypatch.setattr(meta.config, "DOSSIER_JOURNAUX", tmp_path)
    monkeypatch.setattr(meta, "JOURNAL", tmp_path / "meta.log")
    return tmp_path


class Fausse:
    """Une réponse HTTP de comédie, pour éprouver `_lire_erreur`."""

    def __init__(self, code, charge=None, texte=""):
        self.status_code, self._charge, self.text = code, charge, texte
        self.ok = 200 <= code < 300

    def json(self):
        if self._charge is None:
            raise ValueError("pas de JSON")
        return self._charge


# ═══════════════════════════════════════════════════════════════════
#  Les briques
# ═══════════════════════════════════════════════════════════════════
def test_erreur_graph_porte_le_code_le_sous_code_et_le_sens():
    """Beaucoup de pannes Meta ne se diagnostiquent QU'au sous-code."""
    texte = meta._lire_erreur(Fausse(400, {"error": {
        "message": "The session has been invalidated", "code": 190,
        "error_subcode": 460, "fbtrace_id": "ABC"}}))
    assert "code 190/460" in texte
    assert "session Facebook d'Andry a été déconnectée" in texte
    assert "The session has been invalidated" in texte
    assert "ABC" in texte


def test_erreur_graph_sur_un_corps_illisible_ne_leve_pas():
    texte = meta._lire_erreur(Fausse(502, None, "<html>Bad Gateway</html>"))
    assert "HTTP 502" in texte and "Bad Gateway" in texte


def test_quand_accepte_horodatage_et_iso_et_rend_tana():
    """`scheduled_publish_time` revient tantôt en secondes, tantôt en ISO +0000."""
    attendu = datetime(2026, 9, 20, 12, 0, tzinfo=TANA)
    assert meta._quand(1789894800) == attendu
    assert meta._quand("1789894800") == attendu
    assert meta._quand("2026-09-20T09:00:00+0000") == attendu
    assert meta._quand(None) is None
    assert meta._quand("pas une date") is None


def test_engagement_un_partage_absent_vaut_zero():
    """Vérifié le 20/09/2026 : 11 publications sur 100 n'ont AUCUN champ `shares`."""
    assert meta._engagement({"reactions": {"summary": {"total_count": 7}},
                             "comments": {"summary": {"total_count": 2}}}) == (7, 2, 0)


def test_compter_photos_sur_la_relecture():
    """Un attached_media mal formé donne une publication texte seul, sans erreur."""
    album = {"attachments": {"data": [{"media_type": "album", "subattachments": {
        "data": [{"type": "photo"}] * 4}}]}}
    assert meta._compter_photos(album) == 4
    assert meta._compter_photos({}) == 0


def test_entier_supporte_ce_que_le_modele_invente():
    assert meta._entier("5", 10) == 5
    assert meta._entier("cinq", 10) == 10
    assert meta._entier(None, 10) == 10
    assert meta._entier("9999", 10, maxi=25) == 25


def test_lire_heure_lit_l_heure_de_tana():
    assert meta._lire_heure("2026-10-05 18:00") == datetime(2026, 10, 5, 18, 0, tzinfo=TANA)
    assert meta._lire_heure("05/10/2026 18:00") == datetime(2026, 10, 5, 18, 0, tzinfo=TANA)
    assert meta._lire_heure("05/10/2026 18h00") == datetime(2026, 10, 5, 18, 0, tzinfo=TANA)
    # Une date qui porte un fuseau est CONVERTIE, pas relue telle quelle.
    assert meta._lire_heure("2026-10-05T15:00:00+00:00") == datetime(2026, 10, 5, 18, 0, tzinfo=TANA)
    assert meta._lire_heure("demain") is None


# ═══════════════════════════════════════════════════════════════════
#  Le registre
# ═══════════════════════════════════════════════════════════════════
def test_les_onze_competences_sont_declarees_en_famille_page():
    from bot import competences

    attendues = {"etat_page", "file_programmee", "publications_recentes",
                 "commentaires_recents", "messages_recents", "veille_page",
                 "publier_page", "programmer_page", "annuler_programmee",
                 "repondre_commentaire", "repondre_message"}
    page = {c.nom for c in competences.REGISTRE.values() if c.famille == "page"}
    assert attendues <= page


def test_tout_ce_qui_sort_en_public_est_marque_publique():
    from bot import competences

    ecrit = {"publier_page", "programmer_page", "annuler_programmee",
             "repondre_commentaire", "repondre_message"}
    lit = {"etat_page", "file_programmee", "publications_recentes",
           "commentaires_recents", "messages_recents", "veille_page"}
    for nom in ecrit:
        assert competences.REGISTRE[nom].publique is True, nom
        # La garde qui compte : rien ne part sans un clic d'Andry.
        assert competences.demande_validation(nom) is True, nom
    for nom in lit:
        assert competences.REGISTRE[nom].publique is False, nom
        assert competences.demande_validation(nom) is False, nom


def test_chaque_competence_a_un_exemple_et_ses_parametres_documentes():
    from bot import competences

    for comp in [c for c in competences.REGISTRE.values() if c.famille == "page"]:
        assert comp.exemples, comp.nom
        fonction = comp.fonction.__code__
        args = set(fonction.co_varnames[: fonction.co_argcount])
        assert set(comp.parametres) == args, comp.nom
        assert set(comp.obligatoires) <= args, comp.nom


# ═══════════════════════════════════════════════════════════════════
#  Lecture
# ═══════════════════════════════════════════════════════════════════
def test_etat_page_dit_les_chiffres_et_ne_promet_aucune_portee(monkeypatch):
    """/insights est MORT sur cette page : jamais d'impression estimée."""
    demain = datetime.now(TANA) + timedelta(hours=3)

    def faux_get(chemin, **p):
        if chemin == PAGE:
            return {"name": "Di'ako", "username": "DiakoMDG", "followers_count": 14409}, ""
        if chemin == "debug_token":
            return {"data": {"is_valid": True, "expires_at": 0,
                             "data_access_expires_at": int((demain + timedelta(days=30)).timestamp()),
                             "profile_id": PAGE, "scopes": ["pages_manage_posts"]}}, ""
        raise AssertionError(chemin)

    def faux_parcourir(chemin, **p):
        if chemin.endswith("published_posts"):
            return [{"id": "1", "created_time": "2026-09-19T15:00:28+0000"}], ""
        return [{"id": "2", "scheduled_publish_time": int(demain.timestamp())}], ""

    monkeypatch.setattr(meta, "_get", faux_get)
    monkeypatch.setattr(meta, "_parcourir", faux_parcourir)
    r = meta.etat_page()
    assert r.ok
    assert "14 409 abonnés" in r.texte
    assert "1 publication(s)" in r.texte and "1 publication(s)" in r.texte
    assert r.donnees["programmees"] == 1
    assert "Je ne les estime pas" in r.texte


def test_etat_page_crie_si_le_jeton_pilote_une_autre_page(monkeypatch):
    """104126917813219 est « DiakoMada », PAS la nôtre : un jeton dessus publierait ailleurs."""
    monkeypatch.setattr(meta, "_parcourir", lambda chemin, **p: ([], ""))

    def faux_get(chemin, **p):
        if chemin == PAGE:
            return {"name": "Di'ako", "username": "DiakoMDG", "followers_count": 1}, ""
        return {"data": {"is_valid": True, "expires_at": 0,
                         "profile_id": "104126917813219"}}, ""

    monkeypatch.setattr(meta, "_get", faux_get)
    r = meta.etat_page()
    assert "104126917813219" in r.texte and "pas" in r.texte


def test_sans_jeton_rien_ne_part_et_on_dit_quoi_faire(monkeypatch):
    monkeypatch.setattr(meta, "_jeton", lambda: "")
    for appel, args in ((meta.etat_page, {}),
                        (meta.file_programmee, {}),
                        (meta.publier_page, {"texte": "coucou"}),
                        (meta.programmer_page, {"texte": "x", "quand": "2026-10-05 18:00"}),
                        (meta.annuler_programmee, {"post_id": "1"}),
                        (meta.repondre_commentaire, {"commentaire_id": "1", "texte": "a"}),
                        (meta.repondre_message, {"conversation_id": "t_1", "texte": "a"})):
        r = appel(**args)
        assert r.ok is False
        assert "jeton_page.py" in r.texte


def test_file_programmee_range_par_heure_et_compte_les_images(monkeypatch):
    base = datetime(2026, 9, 20, 12, 0, tzinfo=TANA)
    file_fb = [
        {"id": "b", "message": "Deuxième", "scheduled_publish_time": int((base + timedelta(hours=6)).timestamp()),
         "attachments": {"data": [{"subattachments": {"data": [{"type": "photo"}] * 5}}]}},
        {"id": "a", "message": "Première", "scheduled_publish_time": int(base.timestamp()),
         "attachments": {"data": [{"subattachments": {"data": [{"type": "photo"}] * 4}}]}},
        {"id": "c", "scheduled_publish_time": int((base + timedelta(hours=8)).timestamp())},
    ]
    monkeypatch.setattr(meta, "_parcourir", lambda chemin, **p: (file_fb, ""))
    r = meta.file_programmee(nombre="10")
    assert r.donnees["programmees"] == 3
    noms = [d["id"] for d in r.donnees["liste"]]
    assert noms == ["a", "b", "c"]                      # rangées par heure
    assert "[4 img]" in r.texte and "[5 img]" in r.texte
    assert "reel ou vidéo" in r.texte                   # une programmée sans texte ni photo
    assert "20/09 à 12:00" in r.texte                   # heure de Tana, pas UTC


def test_commentaires_recents_voit_la_reponse_de_la_page(monkeypatch):
    """L'incident Fonenako : sans `comments{}` imbriqué, 7 réponses pour 2 commentaires."""
    def faux_get(chemin, **p):
        if chemin.endswith("published_posts"):
            return {"data": [{"id": "P1", "message": "Un post",
                              "comments": {"summary": {"total_count": 2}}}]}, ""
        return {"data": [
            {"id": "C1", "message": "Déjà traité", "created_time": "2026-09-19T10:00:00+0000",
             "comments": {"data": [{"id": "R1", "message": "Misaotra !",
                                    "from": {"id": PAGE, "name": "Di'ako"},
                                    "created_time": "2026-09-19T11:00:00+0000"}]}},
            {"id": "C2", "message": "Neuf", "created_time": "2026-09-19T12:00:00+0000",
             "comments": {"data": [{"id": "R2", "message": "moi aussi",
                                    "from": {"id": "999", "name": "Une page tierce"}}]}},
        ]}, ""

    monkeypatch.setattr(meta, "_get", faux_get)
    r = meta.commentaires_recents(nombre="10", publications="5")
    par_id = {c["id"]: c for c in r.donnees["liste"]}
    assert par_id["C1"]["repondu_par_la_page"] is True
    # une réponse d'une AUTRE page ne vaut pas la nôtre
    assert par_id["C2"]["repondu_par_la_page"] is False
    assert r.donnees["sans_reponse"] == 1
    assert "déjà répondu" in r.texte


def test_commentaires_recents_n_invente_pas_l_auteur(monkeypatch):
    """Graph retire `from` pour les personnes : on le DIT, on ne le devine pas."""
    def faux_get(chemin, **p):
        if chemin.endswith("published_posts"):
            return {"data": [{"id": "P1", "message": "Un post",
                              "comments": {"summary": {"total_count": 1}}}]}, ""
        return {"data": [{"id": "C1", "message": "Tsara be", "created_time":
                          "2026-09-19T10:00:00+0000"}]}, ""

    monkeypatch.setattr(meta, "_get", faux_get)
    r = meta.commentaires_recents()
    assert r.donnees["liste"][0]["auteur"] is None
    assert "auteur non rendu par Graph" in r.texte


def test_messages_recents_dit_quand_la_fenetre_de_24h_est_fermee(monkeypatch):
    maintenant = datetime.now(TANA)
    recent = (maintenant - timedelta(hours=2)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
    vieux = (maintenant - timedelta(days=12)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
    convs = {"data": [
        {"id": "t_ouverte", "updated_time": recent, "unread_count": 1, "message_count": 2,
         "participants": {"data": [{"id": "111", "name": "Jed"}, {"id": PAGE, "name": "Di'ako"}]},
         "messages": {"data": [{"id": "m1", "message": "Salama", "created_time": recent,
                                "from": {"id": "111", "name": "Jed"}}]}},
        {"id": "t_fermee", "updated_time": vieux, "unread_count": 0, "message_count": 2,
         "participants": {"data": [{"id": "222", "name": "Kaliana"}, {"id": PAGE, "name": "Di'ako"}]},
         "messages": {"data": [{"id": "m2", "message": "Sambava ?", "created_time": vieux,
                                "from": {"id": "222", "name": "Kaliana"}}]}},
    ]}
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: (convs, ""))
    r = meta.messages_recents()
    par_id = {c["id"]: c for c in r.donnees["liste"]}
    assert par_id["t_ouverte"]["fenetre_ouverte"] is True
    assert par_id["t_fermee"]["fenetre_ouverte"] is False
    assert r.donnees["fenetre_ouverte"] == 1
    assert "fenêtre de 24 h dépassée" in r.texte


def test_veille_page_dit_le_refus_au_lieu_d_inventer(monkeypatch):
    """Mesuré le 20/09/2026 : aucune autre page n'est lisible (code 10)."""
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: (
        {}, "HTTP 400 · code 10 · (#10) This endpoint requires … Page Public Content Access"))
    r = meta.veille_page(page="MadagascarTourism")
    assert r.ok is False
    assert "Page Public Content Access" in r.texte
    assert "127.0.0.1:8757" in r.texte           # la porte de repli est nommée


# ═══════════════════════════════════════════════════════════════════
#  Écriture — HORS LIGNE, rien ne part
# ═══════════════════════════════════════════════════════════════════
def _image(tmp_path: Path, nom="affiche.png") -> Path:
    p = tmp_path / nom
    p.write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 64)
    return p


def test_publier_page_refuse_plus_de_cinq_images(tmp_path):
    images = ";".join(str(_image(tmp_path, f"a{i}.png")) for i in range(6))
    r = meta.publier_page(texte="Coucou", images=images)
    assert r.ok is False and "5" in r.texte


def test_publier_page_refuse_une_image_introuvable(tmp_path):
    r = meta.publier_page(texte="Coucou", images=str(tmp_path / "jamais-vue.png"))
    assert r.ok is False and "introuvable" in r.texte


def test_publier_page_relit_et_compte_les_photos(monkeypatch, tmp_path):
    """Un attached_media mal formé donne un post texte seul, accepté sans erreur."""
    envois = []

    def faux_post(chemin, donnees=None, fichier=None, delai=None):
        envois.append((chemin, donnees))
        if chemin.endswith("/photos"):
            return {"id": f"ph{len(envois)}"}, ""
        return {"id": "108742855158464_999"}, ""

    monkeypatch.setattr(meta, "_post", faux_post)
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: ({
        "message": "Coucou", "is_published": True, "permalink_url": "https://fb/999",
        "attachments": {"data": [{"subattachments": {"data": [{"type": "photo"}] * 2}}]}}, ""))
    r = meta.publier_page(texte="Coucou", images=f"{_image(tmp_path,'a.png')};{_image(tmp_path,'b.png')}")
    assert r.ok is True
    assert r.donnees["photos_relues"] == 2 == r.donnees["photos_envoyees"]
    feed = [d for c, d in envois if c.endswith("/feed")][0]
    assert feed["published"] == "true" and "scheduled_publish_time" not in feed
    assert json.loads(feed["attached_media[0]"])["media_fbid"] == "ph1"


def test_publier_page_signale_une_relecture_non_conforme(monkeypatch, tmp_path):
    monkeypatch.setattr(meta, "_post", lambda chemin, donnees=None, fichier=None, delai=None:
                        ({"id": "ph1" if chemin.endswith("/photos") else "P9"}, ""))
    # Facebook a accepté, mais la publication relue n'a AUCUNE photo.
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: (
        {"message": "Coucou", "is_published": True, "attachments": {"data": [{}]}}, ""))
    r = meta.publier_page(texte="Coucou", images=str(_image(tmp_path)))
    assert r.ok is False and "relecture" in r.texte


def test_programmer_page_refuse_avant_dix_minutes():
    quand = (datetime.now(TANA) + timedelta(minutes=3)).strftime("%Y-%m-%d %H:%M")
    r = meta.programmer_page(texte="x", quand=quand)
    assert r.ok is False and r.donnees["cause"] == "trop_tot"


def test_programmer_page_refuse_au_dela_de_soixante_quinze_jours():
    quand = (datetime.now(TANA) + timedelta(days=80)).strftime("%Y-%m-%d %H:%M")
    r = meta.programmer_page(texte="x", quand=quand)
    assert r.ok is False and r.donnees["cause"] == "trop_tard"


def test_programmer_page_refuse_un_doublon_deja_en_file(monkeypatch):
    """Deux séries partagent les mêmes jours : un doublon part EN PUBLIC."""
    texte = "📍 Andasibe — Ny alan'ny babakoto 🌿🇲🇬 Au petit matin, le babakoto appelle."
    monkeypatch.setattr(meta, "_parcourir", lambda chemin, **p: (
        [{"id": "X", "message": texte}], ""))
    quand = (datetime.now(TANA) + timedelta(days=2)).strftime("%Y-%m-%d %H:%M")
    r = meta.programmer_page(texte=texte, quand=quand)
    assert r.ok is False and r.donnees["cause"] == "doublon"


def test_programmer_page_ne_programme_pas_a_l_aveugle_si_la_file_est_illisible(monkeypatch):
    monkeypatch.setattr(meta, "_parcourir", lambda chemin, **p: ([], "HTTP 400 · code 190 · jeton"))
    quand = (datetime.now(TANA) + timedelta(days=2)).strftime("%Y-%m-%d %H:%M")
    r = meta.programmer_page(texte="neuf", quand=quand)
    assert r.ok is False and "aveugle" in r.texte


def test_programmer_page_pose_l_heure_de_tana_et_relit(monkeypatch, tmp_path):
    moment = (datetime.now(TANA) + timedelta(days=2)).replace(second=0, microsecond=0)
    envois = []

    def faux_post(chemin, donnees=None, fichier=None, delai=None):
        envois.append((chemin, donnees))
        return ({"id": "ph1"} if chemin.endswith("/photos") else {"id": "P7"}), ""

    monkeypatch.setattr(meta, "_parcourir", lambda chemin, **p: ([], ""))
    monkeypatch.setattr(meta, "_post", faux_post)
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: ({
        "message": "Andasibe", "is_published": False,
        "scheduled_publish_time": int(moment.timestamp()),
        "attachments": {"data": [{"subattachments": {"data": [{"type": "photo"}]}}]}}, ""))
    r = meta.programmer_page(texte="Andasibe", quand=moment.strftime("%Y-%m-%d %H:%M"),
                             images=str(_image(tmp_path)))
    assert r.ok is True and r.donnees["conforme"] is True
    feed = [d for c, d in envois if c.endswith("/feed")][0]
    assert feed["published"] == "false"
    assert int(feed["scheduled_publish_time"]) == int(moment.timestamp())


def test_programmer_page_previent_au_dela_de_la_fenetre_mesuree(monkeypatch, tmp_path):
    """Mesuré le 18/09/2026 avec cette app : 28,4 j passent, 29,4 j sont refusés."""
    moment = (datetime.now(TANA) + timedelta(days=40)).replace(second=0, microsecond=0)
    monkeypatch.setattr(meta, "_parcourir", lambda chemin, **p: ([], ""))
    monkeypatch.setattr(meta, "_post", lambda chemin, donnees=None, fichier=None, delai=None:
                        ({"id": "P8"}, ""))
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: ({
        "message": "loin", "is_published": False,
        "scheduled_publish_time": int(moment.timestamp()), "attachments": {"data": [{}]}}, ""))
    r = meta.programmer_page(texte="loin", quand=moment.strftime("%Y-%m-%d %H:%M"))
    assert "18/09/2026" in r.texte and "28,4" in r.texte


def test_annuler_programmee_refuse_une_publication_en_ligne(monkeypatch):
    """Supprimer une publication publiée, c'est retirer un contenu public et ses réactions."""
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: (
        {"id": "P1", "message": "En ligne", "is_published": True,
         "created_time": "2026-09-19T15:00:28+0000"}, ""))
    appels = []
    monkeypatch.setattr(meta, "_supprimer", lambda chemin: appels.append(chemin) or ({}, ""))
    r = meta.annuler_programmee(post_id="P1")
    assert r.ok is False and r.donnees["cause"] == "deja_publiee"
    assert appels == []                                  # rien n'a été supprimé


def test_annuler_programmee_supprime_puis_verifie(monkeypatch):
    etats = {"supprime": False}

    def faux_get(chemin, **p):
        if etats["supprime"]:
            return {}, "HTTP 400 · code 100 · Unsupported get request"
        return {"id": "P1", "message": "Programmée", "is_published": False,
                "scheduled_publish_time": 1792335600}, ""

    def faux_supprimer(chemin):
        etats["supprime"] = True
        return {"success": True}, ""

    monkeypatch.setattr(meta, "_get", faux_get)
    monkeypatch.setattr(meta, "_supprimer", faux_supprimer)
    r = meta.annuler_programmee(post_id="P1")
    assert r.ok is True and etats["supprime"]


def test_annuler_programmee_crie_si_la_publication_se_relit_encore(monkeypatch):
    """Une suppression qui « réussit » sans rien supprimer est déjà arrivée."""
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: (
        {"id": "P1", "message": "Programmée", "is_published": False,
         "scheduled_publish_time": 1792335600}, ""))
    monkeypatch.setattr(meta, "_supprimer", lambda chemin: ({"success": True}, ""))
    r = meta.annuler_programmee(post_id="P1")
    assert r.ok is False and "se relit encore" in r.texte


def test_repondre_commentaire_refuse_si_la_page_a_deja_repondu(monkeypatch):
    """Fonenako : 7 réponses pour 2 commentaires en 2 jours, une toutes les 2 h."""
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: ({
        "id": "C1", "message": "Tsara", "created_time": "2026-09-19T10:00:00+0000",
        "comments": {"data": [{"id": "R1", "message": "Misaotra tompoko !",
                               "from": {"id": PAGE, "name": "Di'ako"},
                               "created_time": "2026-09-19T11:00:00+0000"}]}}, ""))
    appels = []
    monkeypatch.setattr(meta, "_post", lambda *a, **k: appels.append(a) or ({}, ""))
    r = meta.repondre_commentaire(commentaire_id="C1", texte="Misaotra !")
    assert r.ok is False and r.donnees["cause"] == "deja_repondu"
    assert appels == []


def test_repondre_commentaire_refuse_si_notre_journal_le_dit(monkeypatch, pas_de_reseau):
    """Seconde garde : si `from` manquait sur notre réponse, le journal la porte."""
    (pas_de_reseau / "meta.log").write_text(json.dumps({
        "quand": "2026-09-19T11:00:00+03:00", "action": "repondre_commentaire",
        "commentaire_id": "C2", "ok": True, "debut": "Misaotra !"}) + "\n", encoding="utf-8")
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: (
        {"id": "C2", "message": "Tsara", "comments": {"data": []}}, ""))
    appels = []
    monkeypatch.setattr(meta, "_post", lambda *a, **k: appels.append(a) or ({}, ""))
    r = meta.repondre_commentaire(commentaire_id="C2", texte="Misaotra !")
    assert r.ok is False and r.donnees["cause"] == "deja_repondu_journal"
    assert appels == []


def test_repondre_commentaire_envoie_puis_relit_et_journalise(monkeypatch, pas_de_reseau):
    lus = {"n": 0}

    def faux_get(chemin, **p):
        lus["n"] += 1
        if lus["n"] == 1:
            return {"id": "C3", "message": "Tsara", "comments": {"data": []}}, ""
        return {"id": "R9", "message": "Misaotra !"}, ""

    monkeypatch.setattr(meta, "_get", faux_get)
    monkeypatch.setattr(meta, "_post", lambda chemin, donnees=None, **k: ({"id": "R9"}, ""))
    r = meta.repondre_commentaire(commentaire_id="C3", texte="Misaotra !")
    assert r.ok is True and r.donnees["reponse_id"] == "R9"
    # Le journal doit désormais empêcher une seconde réponse.
    assert meta._deja_traite("repondre_commentaire", "commentaire_id", "C3")


def test_repondre_message_refuse_hors_fenetre_de_24h(monkeypatch):
    vieux = (datetime.now(TANA) - timedelta(days=12)).astimezone(
        timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: ({
        "id": "t_1", "updated_time": vieux,
        "participants": {"data": [{"id": "111", "name": "Jed"}, {"id": PAGE, "name": "Di'ako"}]},
        "messages": {"data": [{"id": "m1", "message": "Salama", "created_time": vieux,
                               "from": {"id": "111", "name": "Jed"}}]}}, ""))
    appels = []
    monkeypatch.setattr(meta, "_post", lambda *a, **k: appels.append(a) or ({}, ""))
    r = meta.repondre_message(conversation_id="t_1", texte="Salama Jed")
    assert r.ok is False and r.donnees["cause"] == "fenetre_fermee"
    assert appels == []                                  # rien n'est parti


def test_repondre_message_envoie_dans_la_fenetre(monkeypatch):
    recent = (datetime.now(TANA) - timedelta(hours=2)).astimezone(
        timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
    monkeypatch.setattr(meta, "_get", lambda chemin, **p: ({
        "id": "t_2", "updated_time": recent,
        "participants": {"data": [{"id": "111", "name": "Jed"}, {"id": PAGE, "name": "Di'ako"}]},
        "messages": {"data": [{"id": "m1", "message": "Salama", "created_time": recent,
                               "from": {"id": "111", "name": "Jed"}}]}}, ""))
    envoyes = []

    def faux_post(chemin, donnees=None, **k):
        envoyes.append((chemin, donnees))
        return {"message_id": "mid.42", "recipient_id": "111"}, ""

    monkeypatch.setattr(meta, "_post", faux_post)
    r = meta.repondre_message(conversation_id="t_2", texte="Salama Jed, azafady…")
    assert r.ok is True and r.donnees["message_id"] == "mid.42"
    chemin, donnees = envoyes[0]
    assert chemin == f"{PAGE}/messages"
    assert json.loads(donnees["recipient"])["id"] == "111"
    assert json.loads(donnees["message"])["text"].startswith("Salama Jed")
    assert donnees["messaging_type"] == "RESPONSE"


def test_une_erreur_graph_a_l_envoi_ne_leve_jamais(monkeypatch, tmp_path):
    """Un `raise` nu dans une compétence ressemble à une panne du bot."""
    monkeypatch.setattr(meta, "_post", lambda *a, **k: (
        {}, "HTTP 400 · code 368 · temporairement bloqué"))
    r = meta.publier_page(texte="Coucou", images=str(_image(tmp_path)))
    assert r.ok is False and "368" in r.texte


def test_executer_par_le_registre_filtre_les_parametres_inventes():
    """Le modèle invente des paramètres : `executer` ne doit pas lever un TypeError."""
    from bot import competences

    r = competences.executer("programmer_page",
                             {"texte": "x", "quand": "hier", "couleur": "bleu"})
    assert r.ok is False and "Date incomprise" in r.texte
    r2 = competences.executer("programmer_page", {"texte": "x"})
    assert r2.ok is False and "quand" in r2.texte
