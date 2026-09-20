# -*- coding: utf-8 -*-
"""Banc de l'atelier et de la rédaction — HORS LIGNE, sans navigateur, sans réseau.

    python -m pytest bot-telegram/tests/test_atelier.py -q

🔴 AUCUN test ne publie, ne programme, n'appelle un modèle ni ne lance Playwright :
   `hors_du_monde` (autouse) casse `requests.post`, `subprocess.run` et le rendu. Un
   monkeypatch oublié tombe ici, pas sur la page Di'ako.
🔴 AUCUN test n'écrit dans `marketing/atelier/` : les séries de 12 h et 18 h y sont
   déjà programmées. Les tests qui écrivent redirigent `SORTIES`, `AFFICHES` et
   `config.ATELIER` vers un dossier temporaire, puis vérifient que l'atelier réel
   n'a rien reçu.

Chaque cas protège un incident déjà payé — il est cité au-dessus du test.

⚠ Console cp1252 : sans PYTHONIOENCODING, pytest rend une sortie VIDE et un code de
  sortie 45 dès qu'un emoji entre dans un message. Les emoji de ce fichier sont donc
  construits par chr() ou relus dans le code, jamais tapés.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent          # …/bot-telegram
if str(RACINE) not in sys.path:
    sys.path.insert(0, str(RACINE))

from bot import atelier, competences, config, redaction  # noqa: E402

ICONE_LIEU = redaction.RUBRIQUES["lieu"][0]
MAIN_LEVEE = chr(0x1F64B)          # 🙋 — la ligne de la question
DOIGT = chr(0x1F449)               # 👉 — la ligne du lien
FINE_INSECABLE = chr(0x202F)       # l'espace de milliers d'Intl.NumberFormat("fr-FR")


@pytest.fixture(autouse=True)
def hors_du_monde(monkeypatch):
    """Ni modèle, ni sous-processus, ni navigateur."""
    def interdit(*a, **k):  # pragma: no cover
        raise AssertionError("appel réel dans un test — interdit")

    monkeypatch.setattr(redaction.requests, "post", interdit)
    monkeypatch.setattr(atelier.subprocess, "run", interdit)
    monkeypatch.setattr(atelier, "_rendre", lambda pages: ([], "rendu neutralisé (test)"))
    monkeypatch.setattr(atelier, "_gabarits_atelier", lambda: (None, None))


@pytest.fixture
def atelier_temporaire(tmp_path, monkeypatch):
    """Un atelier jetable : rien n'est lu ni écrit dans le vrai."""
    faux = tmp_path / "atelier"
    (faux / "photos").mkdir(parents=True)
    (faux / "choix").mkdir()
    monkeypatch.setattr(config, "ATELIER", faux)
    monkeypatch.setattr(atelier, "PHOTOS_ATELIER", faux / "photos")
    monkeypatch.setattr(atelier, "SORTIES", tmp_path / "sorties")
    monkeypatch.setattr(atelier, "AFFICHES", tmp_path / "affiches")
    monkeypatch.setattr(config, "DOSSIER_DONNEES", tmp_path)
    monkeypatch.setattr(atelier, "_lancer_verifier", lambda: (0, []))
    return faux


def photo_bidon(chemin: Path) -> Path:
    from PIL import Image
    chemin.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (1200, 800), "#0E7C86").save(chemin, "JPEG")
    return chemin


# ══════════════════════════ le texte ══════════════════════════

def test_la_forme_est_celle_que_verifier_exige():
    """verifier.py refuse un texte qui ne commence pas par l'icône de sa rubrique,
    qui n'a pas exactement 5 hashtags avec #Diako en tête, ou dont le lien ne porte
    pas son utm_content. Cette forme se vérifie ici, avant la fabrication."""
    r = redaction.rediger_publication(sujet="Ampefy", titre="Ampefy", lien="/lieu/ampefy",
                                      sous_titre_mg="Ny farihy sy ny riana")
    texte = r.donnees["texte"]
    lignes = texte.splitlines()
    assert lignes[0].split(" ", 1)[0] == ICONE_LIEU
    assert "utm_content=ampefy" in texte
    assert config.SITE + "/lieu/ampefy" in texte
    assert any(l.startswith(MAIN_LEVEE) for l in lignes)
    derniere = lignes[-1].split()
    assert len(derniere) == 5 and derniere[0] == "#Diako"
    assert all(h.startswith("#") for h in derniere)
    assert r.donnees["defauts"] == []


def test_aucun_chiffre_sans_source():
    """03/09/2026, Fonenako : « 2000 annonces » annoncé pour 1 878 en base — une
    promesse fausse, vérifiable par n'importe quel visiteur. Sans `chiffres`, le
    texte n'en porte aucun, et un nombre qui apparaît quand même est un défaut."""
    r = redaction.rediger_publication(sujet="Diako", titre="Diako",
                                      corps="Nous avons 2000 annonces.")
    assert not r.ok
    assert any("2000" in d for d in r.donnees["defauts"])

    ok = redaction.rediger_publication(sujet="Diako", titre="Diako",
                                       corps="3 377 pages et 95 plats.",
                                       chiffres="3 377 pages publiées, 95 plats (base, 19/09)")
    assert ok.ok and ok.donnees["defauts"] == []


def test_les_espaces_fines_ne_font_pas_deux_nombres():
    """07/09/2026 : Intl.NumberFormat écrit « 170 000 » avec une fine insécable que
    la plupart des services rendent en espace ordinaire ; comparés tels quels, les
    deux nombres n'étaient jamais égaux."""
    assert redaction.nombres("170" + FINE_INSECABLE + "000") == ["170000"]
    assert redaction.chiffres_non_sources("170" + FINE_INSECABLE + "000 Ar", "170 000 Ar") == []


def test_un_chiffre_du_lien_ne_compte_pas_pour_une_promesse():
    """Un slug ou un utm peut porter des chiffres sans rien promettre au lecteur :
    les lignes de service sont écartées, sinon tout lien devient un faux défaut."""
    texte = f"{DOIGT} La fiche : https://diako.fonenako.mg/lieu/nosy-be-2?utm_content=x"
    assert redaction.chiffres_non_sources(texte, "") == []


def test_question_fermee_malgache_prend_la_particule_ve():
    """Règle d'Andry, corrigée à l'écoute de la première narration : une question
    fermée prend « ve » (« Efa nandeha tany Ampefy ve ianao ? »). Les alternatives
    en « sa » n'en prennent pas, les questions ouvertes non plus."""
    assert redaction.defaut_particule_ve("Efa nandeha tany Ampefy ianao ?")
    assert redaction.defaut_particule_ve("Efa nandeha tany Ampefy ve ianao ?") == ""
    assert redaction.defaut_particule_ve("Trano sa tany no tadiavinao ?") == ""
    assert redaction.defaut_particule_ve("Aiza no tianao halehana ?") == ""
    # et la question que le gabarit écrit tout seul la porte
    r = redaction.rediger_publication(sujet="Romazava", titre="Romazava", rubrique="plat",
                                      langue="mg", sous_titre_mg="Anana sy nofon-kena")
    assert " ve " in r.donnees["question"]


def test_aucun_mot_hors_alphabet_malgache():
    """c, u, q, w, x et ç n'existent pas en malgache : un mot étranger y est massacré
    (caution → antoka, condition → fepetra). Les noms propres restent admis."""
    assert redaction.mots_hors_alphabet("Ny fepetra sy ny condition") == ["condition"]
    assert redaction.mots_hors_alphabet("Ao Diego-Suarez", ["Diego-Suarez"]) == []
    fautif = redaction.controler_texte(
        ICONE_LIEU + " Test — Ny condition tsara\n\n" + MAIN_LEVEE + " Misy ve ?\n\n"
        + DOIGT + f" {config.SITE}/lieu/x?utm_content=test\n\n#Diako #A #B #C #D",
        cle="test", lignes_malgaches=["Ny condition tsara"])
    assert any("condition" in d for d in fautif)


def test_le_malgache_part_toujours_avec_sa_relecture():
    """Consigne permanente : toute narration ou phrase malgache passe par Andry avant
    publication. Le résultat le dit, sinon personne ne le fait."""
    r = redaction.rediger_publication(sujet="Ampefy", titre="Ampefy",
                                      sous_titre_mg="Ny farihy")
    assert "RELIRE PAR ANDRY" in r.texte


def test_cinq_hashtags_avec_diako_en_tete():
    assert redaction.cinq_hashtags("Nosy Be", "") == ["#Diako", "#NosyBe", "#Madagascar",
                                                      "#VoyageMadagascar", "#TourismeMadagascar"]
    assert redaction.cinq_hashtags("Nosy Be", "#Plage #Nord")[0] == "#Diako"
    assert len(redaction.cinq_hashtags("X", "#a #b #c #d #e #f #g")) == 5


def test_un_lien_sans_utm_est_un_defaut():
    texte = (ICONE_LIEU + " Ampefy\n\n" + MAIN_LEVEE + " Et vous ?\n\n"
             + DOIGT + f" {config.SITE}/lieu/ampefy\n\n#Diako #A #B #C #D")
    defauts = redaction.controler_texte(texte, cle="ampefy")
    assert any("utm_content=ampefy" in d for d in defauts)


# ══════════════════════════ les idées ══════════════════════════

def test_aucune_idee_sans_matiere_reelle(atelier_temporaire):
    """Un sujet inventé promet une page que le site n'a pas : mieux vaut ne rien
    proposer et le dire."""
    r = redaction.idees_publications()
    assert not r.ok and "aucune matière réelle" in r.texte


def test_un_sujet_deja_programme_nest_pas_repropose(atelier_temporaire):
    """18/09/2026 : trois séries quotidiennes partagent les mêmes jours ; reproposer
    un sujet déjà en file, c'est un doublon public sur la page."""
    (atelier_temporaire / "sortie" / "2026-09-20-andasibe").mkdir(parents=True)
    r = redaction.idees_publications(lieux="Andasibe | /lieu/andasibe\nAmpefy | /lieu/ampefy")
    proposes = [i["cle"] for i in r.donnees["idees"]]
    assert proposes == ["ampefy"]
    assert any("Andasibe" in e for e in r.donnees["ecartes"])


def test_les_idees_ne_promettent_aucun_chiffre(atelier_temporaire):
    """Un sujet ne doit rien annoncer qui se compte (« nos 30 plages ») : les nombres
    se comptent en base avant d'écrire, jamais au moment de proposer. Le compte des
    idées affichées, lui, n'est pas une promesse — on contrôle les sujets eux-mêmes."""
    r = redaction.idees_publications(lieux="Ampefy | /lieu/ampefy\nAndasibe | /lieu/andasibe")
    for idee in r.donnees["idees"]:
        assert redaction.nombres(idee["titre"] + " " + idee["angle"]) == []
    assert "les nombres se comptent avant d'écrire" in r.texte


# ══════════════════════════ l'affiche ══════════════════════════

def test_affiche_aux_deux_formats_et_a_la_charte():
    for largeur, hauteur in ((1080, 1080), (1080, 1350)):
        html = atelier.gabarit_affiche(titre="Ampefy", sous_titre="Ny farihy",
                                       rubrique="Lieux emblématiques", lien="/lieu/ampefy",
                                       largeur=largeur, hauteur=hauteur)
        assert f"width:{largeur}px" in html and f"height:{hauteur}px" in html
        assert atelier.defauts_de_charte(html) == []
        assert "serif" in html
        assert "lamba" in html          # pas de photo : motif de lamba


def test_le_corail_ne_porte_jamais_de_texte():
    """Charte Diako : #F4633A est une couleur de décor. La garde doit distinguer
    « background-color:#F4633A » (légitime) de « color:#F4633A » (interdit)."""
    html = atelier.gabarit_affiche(titre="X")
    assert atelier.defauts_de_charte(html) == []
    assert atelier.defauts_de_charte(html + ".x{color:" + atelier.CORAIL + "}")
    assert atelier.defauts_de_charte(html + ".x{background-color:" + atelier.CORAIL + "}") == []


def test_le_script_de_l_affiche_est_isole():
    """19/09/2026, série 2 Di'ako : `page.set_content` garde les variables du rendu
    précédent ; un second « const » au niveau haut levait une erreur SILENCIEUSE et
    onze affiches sur douze avaient leur texte collé en haut."""
    html = atelier.gabarit_affiche(titre="X")
    script = html.split("<script>")[1]
    assert "(() => {" in script
    assert "\nconst " not in script


def test_le_titre_est_echappe():
    html = atelier.gabarit_affiche(titre="Thé & <script>alert(1)</script>")
    assert "<script>alert(1)" not in html
    assert "&amp;" in html


def test_photo_commons_sans_credit_est_refusee(tmp_path, atelier_temporaire):
    """CC BY et CC BY-SA exigent l'auteur et la licence AVEC l'œuvre, et un crédit
    deviné est un crédit faux : la photo est refusée ici, pas plus loin."""
    p = photo_bidon(tmp_path / "vue.jpg")
    r = atelier.fabriquer_affiche(titre="Vue", photo=str(p),
                                  source="https://commons.wikimedia.org/wiki/File:Vue.jpg",
                                  rendu="non")
    assert not r.ok and "REFUS" in r.texte

    ok = atelier.fabriquer_affiche(titre="Vue", photo=str(p), auteur="Heinonlein",
                                   licence="CC BY-SA 4.0",
                                   source="https://commons.wikimedia.org/wiki/File:Vue.jpg",
                                   rendu="non")
    assert ok.ok and "Heinonlein" in ok.donnees["credit"]
    assert "CC BY-SA 4.0" in Path(ok.donnees["html"][0]).read_text(encoding="utf-8")


def test_le_credit_est_relu_dans_choix(tmp_path, atelier_temporaire):
    """commons.py écrit l'auteur et la licence dans choix/<clé>.json depuis les
    métadonnées du fichier : on les relit là plutôt que de les redemander."""
    photo_bidon(atelier.PHOTOS_ATELIER / "andasibe.jpg")
    (atelier_temporaire / "choix" / "andasibe.json").write_text(json.dumps({
        "1": {"titre": "File:Indri.JPG", "credit": "Heinonlein", "licence": "CC BY-SA 4.0",
              "source": "https://commons.wikimedia.org/wiki/File:Indri.JPG",
              "fichier": "andasibe.jpg"}}), encoding="utf-8")
    connu = atelier.credit_connu(atelier.PHOTOS_ATELIER / "andasibe.jpg")
    assert connu["auteur"] == "Heinonlein" and connu["licence"] == "CC BY-SA 4.0"
    r = atelier.fabriquer_affiche(titre="Andasibe", photo="andasibe.jpg", rendu="non")
    assert r.ok and "Heinonlein" in r.donnees["credit"]


def test_sans_navigateur_le_gabarit_est_quand_meme_ecrit(atelier_temporaire):
    """Le PC manque de mémoire : le rendu peut être impossible. Le HTML doit rester
    sur le disque, et le résultat doit le dire au lieu de faire croire à une image."""
    r = atelier.fabriquer_affiche(titre="Ampefy", rendu="non")
    assert r.images == []
    assert all(Path(f).exists() for f in r.donnees["html"])
    assert "Aucune image rendue" in r.texte


# ══════════════════════════ la publication ══════════════════════════

def test_la_publication_va_dans_data_sorties_pas_dans_l_atelier(atelier_temporaire):
    """Les séries de 12 h et 18 h sont déjà programmées : une publication du bot
    n'entre jamais dans `marketing/atelier/sortie*`."""
    r = atelier.preparer_publication(titre="Essai", cle="essai", lien="/lieu/ampefy",
                                     sous_titre_mg="Fitsapana", jour="2026-12-01", rendu="non")
    dossier = Path(r.donnees["dossier"])
    assert dossier.parent == atelier.SORTIES
    assert (dossier / "brouillon.txt").exists() and (dossier / "fiche.json").exists()
    assert list(atelier_temporaire.glob("sortie*")) == []
    fiche = json.loads((dossier / "fiche.json").read_text(encoding="utf-8"))
    assert fiche["programme"] is False
    # ⚠ la fiche ne déclare que les images RÉELLEMENT rendues, pas celles prévues
    assert fiche["images"] == [] and "affiche-fil.png" in fiche["images_prevues"]


def test_un_creneau_deja_pris_est_refuse(atelier_temporaire):
    """Deux publications à la même heure se font de l'ombre, et l'une des deux est
    toujours celle d'une série déjà programmée."""
    pris = atelier.SORTIES / "2026-12-02-autre"
    pris.mkdir(parents=True)
    (pris / "fiche.json").write_text(json.dumps({"heure": "16:00"}), encoding="utf-8")
    r = atelier.preparer_publication(titre="Essai", cle="essai", jour="2026-12-02",
                                     heure="16:00", rendu="non")
    assert not r.ok and "déjà pris" in r.texte


def test_le_creneau_libre_evite_les_heures_des_series(atelier_temporaire):
    """12 h, 18 h et 20 h appartiennent aux séries et aux reels : le bot vise 16 h."""
    assert atelier.HEURE_PAR_DEFAUT not in ("12:00", "18:00", "20:00")
    r = atelier.preparer_publication(titre="Essai", cle="essai", rendu="non")
    assert r.donnees["heure"] == atelier.HEURE_PAR_DEFAUT
    assert r.donnees["date"] > date.today().isoformat()


def test_une_photo_introuvable_arrete_tout(atelier_temporaire):
    r = atelier.preparer_publication(titre="Essai", cle="essai", photos="nexiste-pas.jpg",
                                     rendu="non")
    assert not r.ok and "introuvable" in r.texte


# ══════════════════════════ les outils de l'atelier ══════════════════════════

def test_verifier_est_lance_en_sous_processus(monkeypatch, atelier_temporaire):
    """verifier.py lit `--sortie` DANS sys.argv À L'IMPORT et le résout relativement à
    son propre dossier : l'importer ferait porter le contrôle sur la mauvaise série.
    Et sans PYTHONIOENCODING, la console cp1252 rend une sortie vide."""
    monkeypatch.undo()          # on veut ce _lancer_verifier-ci, pas le faux
    monkeypatch.setattr(atelier, "_rendre", lambda pages: ([], ""))
    vus = {}

    class Fausse:
        returncode = 0
        stdout = "OK      2026-12-01-essai   4 img\n"
        stderr = ""

    def faux_run(cmd, **k):
        vus["cmd"], vus["kw"] = cmd, k
        return Fausse()

    monkeypatch.setattr(atelier.subprocess, "run", faux_run)
    code, lignes = atelier._lancer_verifier()
    assert code == 0 and lignes
    assert cmd_contient(vus["cmd"], "verifier.py") and "--sortie" in vus["cmd"]
    assert vus["kw"]["env"]["PYTHONIOENCODING"] == "utf-8"
    assert str(vus["kw"]["cwd"]) == str(config.ATELIER)
    assert "verifier" not in sys.modules      # jamais importé


def cmd_contient(cmd, morceau: str) -> bool:
    return any(morceau in str(c) for c in cmd)


def test_annee_dune_date_sans_annee():
    """La file de Facebook ne montre que « 19/09 » : l'année se déduit de la plus
    proche. Le 29 février n'existant pas toutes les années, chercher sur trois ans
    rendait une liste vide et le calendrier tombait sur un min() sans candidat."""
    auj = date(2026, 9, 20)
    assert atelier.annee_probable(19, 9, auj) == date(2026, 9, 19)
    assert atelier.annee_probable(5, 10, auj) == date(2026, 10, 5)
    assert atelier.annee_probable(2, 1, auj) == date(2027, 1, 2)
    assert atelier.annee_probable(29, 2, auj) == date(2028, 2, 29)


def test_le_calendrier_lit_les_trois_sources(atelier_temporaire):
    (atelier_temporaire / "sortie" / "2026-12-03-lieu").mkdir(parents=True)
    (atelier_temporaire / "sortie2" / "2026-12-03-decouvrir").mkdir(parents=True)
    (atelier.SORTIES / "2026-12-03-bot").mkdir(parents=True)
    (atelier.SORTIES / "2026-12-03-bot" / "fiche.json").write_text(
        json.dumps({"heure": "16:00"}), encoding="utf-8")
    occupes = atelier._jours_occupes()
    assert set(occupes["2026-12-03"]) == {"18:00", "12:00", "16:00"}
    r = atelier.calendrier_publications(jours="4", depuis="2026-12-01", heure="16:00")
    assert "2026-12-03" not in r.donnees["libres"]
    assert "File Facebook non relue" in r.texte


def test_la_file_facebook_nest_pas_inventee_quand_elle_est_illisible(monkeypatch,
                                                                     atelier_temporaire):
    """Un jeton absent ou un réseau coupé ne doit pas passer pour un calendrier vide
    et sûr : la compétence le DIT, elle ne devine pas."""
    monkeypatch.undo()
    (config.ATELIER / "etat_file.py").write_text("", encoding="utf-8")

    def echec(cmd, **k):
        raise OSError("réseau coupé")

    monkeypatch.setattr(atelier.subprocess, "run", echec)
    assert atelier._file_facebook() == {}


# ══════════════════════════ le contrat des compétences ══════════════════════════

def test_les_six_competences_sont_declarees():
    noms = {c.nom for c in competences.REGISTRE.values() if c.famille == "marketing"}
    assert {"rediger_publication", "idees_publications", "fabriquer_affiche",
            "preparer_publication", "calendrier_publications",
            "verifier_publication"} <= noms


def test_aucun_parametre_obligatoire_nest_absent_du_schema():
    """`competences.executer` ne garde que les arguments DÉCLARÉS avant de chercher
    les obligatoires : un obligatoire non déclaré rend la compétence inappelable."""
    for comp in competences.REGISTRE.values():
        manquants = set(comp.obligatoires) - set(comp.parametres)
        assert not manquants, f"{comp.nom} : {manquants}"


def test_les_competences_de_l_atelier_ne_sortent_rien_en_public():
    """Fabriquer et contrôler ne sont pas publier : la publication est une autre
    compétence, derrière un clic d'Andry."""
    for nom in ("rediger_publication", "idees_publications", "fabriquer_affiche",
                "preparer_publication", "calendrier_publications", "verifier_publication"):
        assert competences.REGISTRE[nom].publique is False


def test_les_boutons_proposes_ont_la_forme_attendue():
    """cerveau.py lit `texte` et `action`, et n'exécute que « faire:<compétence>|<json> »."""
    r = redaction.rediger_publication(sujet="Ampefy", titre="Ampefy")
    for suite in r.suites:
        assert set(suite) == {"texte", "action"}
        nom, _, brut = suite["action"].removeprefix("faire:").partition("|")
        assert nom in competences.REGISTRE
        if brut:
            json.loads(brut)
