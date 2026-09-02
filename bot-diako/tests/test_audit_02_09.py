"""Les défauts trouvés par l'audit du 02/09/2026, figés pour ne pas revenir.

Chaque test porte le chiffre mesuré sur la base réelle au moment de l'audit :
c'est ce qui dit pourquoi la règle existe.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import analyse_llm, base, diako  # noqa: E402
from bot import extraction as ex  # noqa: E402
from bot import sources_prospection as sp  # noqa: E402
from bot import toile  # noqa: E402
from bot import verrou_navigateur as vn  # noqa: E402

AUJ = date(2026, 9, 2)


# ── Extraction ──────────────────────────────────────────────────────────────
def test_la_devise_collee_au_nombre_est_lue():
    """41 % des prix Facebook sont écrits « 60 000Ar » : 172 trouvailles sans prix."""
    for texte in ("Chambre 60000Ar la nuit", "Chambre 60.000ar la nuit", "75 000ar/nuit"):
        assert [m["montant"] for m in ex.montants(texte)] == [60000] or \
            [m["montant"] for m in ex.montants(texte)] == [75000], texte


def test_une_ligne_de_carte_tolere_une_queue_sans_chiffre():
    """428 lignes de carte sur 762 perdues parce que le prix devait finir la ligne."""
    for texte in ("Ravitoto 12 000 Ar.", "Ravitoto 12 000 Ar (avec riz)", "Ravitoto : 12 000 Ar 🔥"):
        lignes = ex.lignes_de_carte(texte)
        assert lignes and lignes[0]["prix_ar"] == 12000, texte
    # Mais pas une chambre, ni une année.
    assert ex.lignes_de_carte("Chambre double 60 000 Ar la nuit") == []
    assert ex.lignes_de_carte("Nos tarifs 2026") == []


def test_le_domaine_d_un_email_n_est_pas_un_site_web():
    """162 trouvailles portaient gmail.com comme site, 50 déjà publiées."""
    assert ex.liens("Mail : sakamanga@gmail.com et site www.sakamanga.mg")["site_web"] \
        == "https://www.sakamanga.mg"
    assert ex.liens("Contact : contact@hotel.mg.")["site_web"] is None
    assert ex.email("écrire à contact@hotel.mg.") == "contact@hotel.mg"


def test_wa_n_est_un_whatsapp_que_comme_mot_entier():
    assert ex.whatsapp("Iwan et Sarah au 0321234567") is None
    assert ex.whatsapp("WhatsApp 034 12 345 67") == "034 12 345 67"


def test_la_date_d_evenement_survit_a_un_nombre_qui_precede():
    """« Nous fêtons nos 10 ans le 20 septembre » : la première correspondance
    n'était pas un mois et la vraie date était perdue."""
    assert ex.dates_evenement("Nous fetons nos 10 ans le 20 septembre 2026 !", AUJ)["debut"] \
        == "2026-09-20"
    assert ex.dates_evenement("Concert 2 heures de live le 20 decembre", AUJ)["debut"] \
        == "2026-12-20"
    assert ex.dates_evenement("Festival le 12/09", AUJ)["debut"] == "2026-09-12"


def test_saison_seule_ne_rend_pas_un_evenement_annuel():
    """36 événements marqués récurrents parce que « haute saison » figurait dans le texte."""
    assert ex.dates_evenement("En haute saison nos bungalows sont a 200 000 Ar", AUJ)["recurrent"] is False
    assert ex.dates_evenement("Chaque annee le 5 mars", AUJ)["recurrent"] is True


def test_un_lieu_se_reconnait_malgre_trait_d_union_et_police_fantaisie():
    """236 trouvailles sans lieu alors que le texte le citait."""
    noms = ["Nosy Boraha", "Sainte-Marie", "Nosy Be", "Madagascar", "Mahajanga"]
    assert ex.lieu_dans_le_texte("Nosy-Be, hotel de charme", noms) == "Nosy Be"
    assert ex.lieu_dans_le_texte("Le lodge se trouve a Sainte Marie", noms) == "Sainte-Marie"
    assert ex.lieu_dans_le_texte("𝗡𝗢𝗦𝗬 𝗕𝗘 : le paradis", noms) == "Nosy Be"
    assert ex.lieu_dans_le_texte("Bienvenue a Madagascar", noms) is None


# ── Rapprochement ───────────────────────────────────────────────────────────
def test_les_noms_francais_des_villes_trouvent_leur_fiche(monkeypatch):
    """65 trouvailles bloquées « sans lieu » : Majunga, Tuléar, Diego, Tamatave."""
    lieux = [{"id": "1", "nom": "Mahajanga", "slug": "mahajanga", "touristique": 1},
             {"id": "2", "nom": "Toliara", "slug": "toliara", "touristique": 1},
             {"id": "3", "nom": "Antsiranana", "slug": "antsiranana", "touristique": 1},
             {"id": "4", "nom": "Madagascar", "slug": "madagascar", "touristique": 0}]
    monkeypatch.setattr(diako.base, "referentiel", lambda table: lieux if table == "ref_lieux" else [])
    assert diako.rapprocher_lieu("Majunga")["nom"] == "Mahajanga"
    assert diako.rapprocher_lieu("Tuléar")["nom"] == "Toliara"
    assert diako.rapprocher_lieu("Diego Suarez")["nom"] == "Antsiranana"
    assert diako.rapprocher_lieu("Madagascar") is None


def test_la_police_fantaisie_ne_vide_plus_un_nom():
    assert diako.similitude("𝗦𝗔𝗞𝗔𝗠𝗔𝗡𝗚𝗔 HOTEL", "Sakamanga") > 0.8
    # Un nombre seul n'est pas un mot distinctif.
    assert diako.similitude("FITAMPOHA 2026", "Fête 2026") == 0.0


def test_un_seul_plat_cite_est_rattache(monkeypatch):
    plats = [{"id": "p1|ravitoto", "nom": "Ravitoto"}, {"id": "p2|romazava", "nom": "Romazava"}]
    monkeypatch.setattr(diako.base, "referentiel", lambda table: plats if table == "ref_plats" else [])
    assert diako.plat_dans_le_texte("On a mangé un ravitoto délicieux")["id"] == "p1"
    assert diako.plat_dans_le_texte("Ravitoto et romazava au menu") is None
    assert diako.plat_dans_le_texte("Rien de tel") is None


# ── Relecture par le modèle ─────────────────────────────────────────────────
def test_un_montant_absent_du_texte_est_ecarte():
    assert analyse_llm.montant_dans_le_texte(25000, "menu à 25 000 Ar")
    assert analyse_llm.montant_dans_le_texte(25000, "menu à 25k ar")
    assert not analyse_llm.montant_dans_le_texte(25000, "menu délicieux")
    fusion = analyse_llm.fusionner(
        {"lieu_texte": "Nosy Be", "genre": "recit"},
        {"genre": "recit", "lieu": "Dubai", "prix": {"montant": 99000, "unite": "plat"}, "confiance": 80},
        texte="Super soirée à Nosy Be, 25 000 Ar le plat", cfg={"llm_confiance_min": 55},
    )
    assert fusion["lieu_texte"] == "Nosy Be"          # le lieu des règles reste
    assert fusion.get("prix_ar") is None              # 99 000 n'est pas dans le texte
    assert "absent du texte" in fusion["llm_doute"]


def test_sous_le_seuil_de_confiance_les_chiffres_restent_aux_regles():
    """`llm_confiance_min` existait dans la configuration et n'était lu nulle part."""
    fusion = analyse_llm.fusionner(
        {"genre": "recit"},
        {"genre": "etablissement", "nom_etablissement": "X",
         "prix": {"montant": 25000, "unite": "plat"}, "confiance": 30},
        texte="25 000 Ar", cfg={"llm_confiance_min": 55},
    )
    assert fusion.get("prix_ar") is None
    assert fusion["nom_etab"] == "X"


# ── Adresses de sites ───────────────────────────────────────────────────────
def test_normaliser_site_ferme_les_quatre_chemins_d_entree():
    assert base.normaliser_site("gmail.com") is None
    assert base.normaliser_site("https://booking.com/hotel/x") is None
    assert base.normaliser_site("linktr.ee/sitrakaresidence5") is None
    assert base.normaliser_site("https://madagascar-tourisme.com/.../rendez-vous") is None
    assert base.normaliser_site("http://www.renala.mg {{dead link|December 2020}}") \
        == "http://www.renala.mg"
    assert base.normaliser_site("www.excursion-djema-forest.com") \
        == "https://www.excursion-djema-forest.com"
    assert base.normaliser_site("HOTELDELAMER-NOSYBE.COM") == "https://hoteldelamer-nosybe.com"


def test_ajouter_source_fond_les_doublons_http_https_www():
    """25 lignes en double sur 250 sites (http/https, avec ou sans www)."""
    dossier = Path(tempfile.mkdtemp())
    ancienne = (base.BASE, base.DOSSIER_DONNEES)
    base.BASE, base.DOSSIER_DONNEES = dossier / "essai.db", dossier
    try:
        base.initialiser()
        a = base.ajouter_source("Niaouly", "http://www.niaouly.com", genre="site")
        b = base.ajouter_source("Niaouly", "https://niaouly.com/", genre="site")
        assert a["id"] == b["id"]
        assert len([s for s in base.sources() if s["genre"] == "site"]) == 1
        try:
            base.ajouter_source("Gmail", "https://gmail.com", genre="site")
            assert False, "gmail.com ne doit pas devenir une source"
        except ValueError:
            pass
    finally:
        base.BASE, base.DOSSIER_DONNEES = ancienne


# ── Lecture du web ──────────────────────────────────────────────────────────
class _Reponse:
    def __init__(self, code, texte="", type_contenu="text/html", url="", en_tetes=None):
        self.status_code = code
        self.text = texte
        self.content = texte.encode("utf-8")
        self.headers = {"Content-Type": type_contenu, **(en_tetes or {})}
        self.url = url
        self.ok = code < 400
        self.encoding = "utf-8"


def test_un_robots_txt_en_403_vaut_autorisation(monkeypatch):
    """34 sites sur 41 « illisibles » se refusaient eux-mêmes : la stdlib lisait
    robots.txt avec l'agent Python-urllib, que les hébergeurs bloquent."""
    monkeypatch.setattr(toile.requests, "get", lambda *a, **k: _Reponse(403, "Forbidden"))
    toile._robots.clear()
    assert toile.robots_autorise("https://cameleonhotel.com/tarifs") is True


def test_un_robots_txt_qui_interdit_s_applique(monkeypatch):
    monkeypatch.setattr(toile.requests, "get",
                        lambda *a, **k: _Reponse(200, "User-agent: *\nDisallow: /\n", "text/plain"))
    toile._robots.clear()
    assert toile.robots_autorise("https://ferme.example/tarifs") is False


def test_la_raison_d_un_echec_est_rendue(monkeypatch):
    toile._robots.clear()
    monkeypatch.setattr(toile, "robots_autorise", lambda url: True)
    monkeypatch.setattr(toile, "_patienter", lambda url: None)

    class Session:
        def get(self, url, **k):
            if "mort" in url:
                raise toile.requests.exceptions.ConnectionError("NameResolutionError: getaddrinfo failed")
            if "absent" in url:
                return _Reponse(404, "", url=url)
            return _Reponse(200, "<html><body>Chambre double 80 000 Ar la nuit</body></html>", url=url)

    assert toile.recuperer("https://mort.example/", Session())[2] == "dns"
    assert toile.recuperer("https://absent.example/", Session())[2] == "404"
    html, _, raison = toile.recuperer("https://ok.example/", Session())
    assert "Chambre" in html and raison == ""


# ── Prospection ─────────────────────────────────────────────────────────────
def test_paris_n_est_pas_un_pari():
    """« Vol Paris Antananarivo » prenait −40 pour « pari » ; « Croissanterie » pour « santé »."""
    def note(nom):
        return sp.noter({"nom": nom, "genre": "groupe", "effectif": 5000, "rythme": 3}, [])
    assert not any("pari" in a for a in note("Vol Paris Antananarivo")["alertes"])
    assert not any("sante" in a for a in note("Croissanterie de Tana")["alertes"])
    assert sp._mot_entier("bar", "bar-restaurant") and not sp._mot_entier("bar", "barbier")


# ── Verrou navigateur ───────────────────────────────────────────────────────
def test_un_fichier_de_verrou_corrompu_ne_bloque_personne(tmp_path, monkeypatch):
    """68 octets nuls laissés par un redémarrage brutal : `prendre()` rendait
    False pour les trois bots, définitivement."""
    monkeypatch.setattr(vn, "FICHIER", str(tmp_path / "verrou.json"))
    Path(vn.FICHIER).write_bytes(b"\x00" * 68)
    assert vn.prendre("diako") is True
    assert vn.qui() == "diako"
    assert vn.prendre("akora") is False      # tenu par diako, vivant
    vn.toucher("diako")
    assert json.load(open(vn.FICHIER))["bot"] == "diako"
    vn.rendre("diako")
    assert vn.prendre("akora") is True
    vn.rendre("akora")
    assert not os.path.exists(vn.FICHIER)
