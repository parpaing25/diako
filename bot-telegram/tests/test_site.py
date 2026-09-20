"""Le banc des compétences « site » — entièrement HORS LIGNE.

🔴 AUCUN TEST NE TOUCHE LA PRODUCTION. Une suite de tests n'écrit jamais dans
   une base ni sur un serveur : le garde `aucun_reseau` casse tout appel réseau
   qui n'aurait pas été remplacé, pour qu'un monkeypatch oublié tombe ici et
   non sur la vraie base. (Règle payée ailleurs : des lignes de test lues dans
   /api/etat et prises pour de l'activité réelle.)

Chaque cas protège une chose qui a déjà coûté cher, et le dit :

  · le préambule admin manquant → `pages_avant_ecriture` annule l'écriture
    SANS erreur (0 fiche publiée sur 333, 02/09/2026) ;
  · le multipart vers ce domaine → 406 du pare-feu (19/09/2026) ;
  · la page de blocage d'o2switch prise pour le site (05/09/2026) ;
  · un `like` dont les jokers ne sont pas échappés balaie la table ;
  · le code de sortie de `redeploy.sh`, pas son dernier message, fait foi.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import competences, site  # noqa: E402

SOURCE = (Path(site.__file__)).read_text(encoding="utf-8")


# ── Le garde : rien ne sort de la machine ──────────────────────────────────
@pytest.fixture(autouse=True)
def aucun_reseau(monkeypatch):
    def refus(*_a, **_k):
        raise AssertionError(
            "appel réseau réel depuis le banc — un monkeypatch manque"
        )
    monkeypatch.setattr(site.requests, "post", refus)
    monkeypatch.setattr(site.requests, "get", refus)
    monkeypatch.setattr(site.subprocess, "run", refus)


class FauxSQL:
    """Remplace `_sql` : garde les requêtes vues, rend des lignes préparées."""

    def __init__(self, *reponses):
        self.reponses = list(reponses)
        self.requetes: list[tuple[str, bool]] = []

    def __call__(self, requete, delai=90, admin=False):
        self.requetes.append((requete, admin))
        return self.reponses.pop(0) if self.reponses else []


class FausseReponse:
    def __init__(self, code=200, texte="", entetes=None, json_=None):
        self.status_code = code
        self.text = texte
        self.headers = entetes or {}
        self._json = json_
        self.ok = 200 <= code < 300

    def json(self):
        if self._json is None:
            raise ValueError("pas de JSON")
        return self._json


# ── Ce que la source doit et ne doit pas contenir ──────────────────────────
def test_aucun_select_etoile():
    """Un `select *` sur `pages` fait échouer la requête ENTIÈRE en 401 dès
    qu'une colonne est protégée : on énumère toujours."""
    assert "select *" not in SOURCE.lower()


def test_aucun_secret_en_dur():
    """Le dépôt est public. Jeton et clé se lisent à l'exécution."""
    for interdit in ("sbp_", "eyJhbGciOi", "O2SWITCH_UPLOAD_API_KEY="):
        assert interdit not in SOURCE, f"secret probable dans la source : {interdit}"
    assert "config.jeton_supabase()" in SOURCE
    assert "config.cle_env_diako()" in SOURCE


def test_aucun_envoi_multipart():
    """🔴 Sur diako.fonenako.mg, TOUT multipart portant un fichier reçoit 406
    avant d'atteindre PHP (mesuré le 19/09/2026, même sur une image 8x8).
    Un repli multipart ne ferait que doubler le temps d'envoi."""
    envoi = SOURCE.split("def envoyer_image_site")[1]
    assert "files=" not in envoi          # pas de multipart requests
    assert "FormData" not in envoi
    assert "data=json.dumps(corps)" in envoi.replace("\n", " ").replace("  ", " ")
    assert "base64.b64encode" in envoi


def test_les_neuf_competences_sont_declarees():
    competences.charger_toutes()
    attendues = {
        "etat_site", "chiffres_site", "chercher_contenu", "journal_erreurs_site",
        "sante_base", "deployer_site", "envoyer_image_site",
        "masquer_publication_fil", "publier_fiche", "depublier_fiche",
    }
    presentes = {n for n, c in competences.REGISTRE.items() if c.famille == "site"}
    assert attendues <= presentes
    publiques = {n for n in attendues if competences.REGISTRE[n].publique}
    assert publiques == {"deployer_site", "envoyer_image_site",
                         "masquer_publication_fil", "publier_fiche", "depublier_fiche"}


# ── Les littéraux SQL ──────────────────────────────────────────────────────
def test_texte_double_les_apostrophes():
    assert site._texte("Chez l'Ami") == "'Chez l''Ami'"
    assert site._texte(None) == "NULL"
    assert site._texte("") == "NULL"


def test_motif_neutralise_les_jokers():
    """Sans ça, une recherche sur « 100 % » ou « chez_moi » balaie la table."""
    assert site._motif("100%") == "'%100\\%%'"
    assert site._motif("chez_moi") == "'%chez\\_moi%'"
    assert site._motif("a\\b") == "'%a\\\\b%'"
    assert site._motif("L'Ami") == "'%l''ami%'"


# ── chercher_contenu ───────────────────────────────────────────────────────
def test_chercher_refuse_deux_lettres(monkeypatch):
    faux = FauxSQL()
    monkeypatch.setattr(site, "_sql", faux)
    r = site.chercher_contenu("ab")
    assert not r.ok and not faux.requetes


def test_chercher_borne_la_limite_et_echappe(monkeypatch):
    faux = FauxSQL([])
    monkeypatch.setattr(site, "_sql", faux)
    site.chercher_contenu("chez_moi", "999")
    requete, admin = faux.requetes[0]
    assert not admin
    assert "limit 25" in requete          # plafonnée, pas 999
    assert "chez\\_moi" in requete        # le joker est neutralisé


def test_chercher_ne_dit_pas_publiee_pour_un_lieu(monkeypatch):
    """`places` et `dishes` n'ont pas de colonne de publication : écrire
    « publiée » serait un état inventé."""
    monkeypatch.setattr(site, "_sql", FauxSQL([
        {"genre": "lieu", "slug": "nosy-komba", "nom": "Nosy Komba",
         "lieu": "Diana", "details": "ile", "photo": True, "tel": "",
         "is_published": None, "vues": 12},
        {"genre": "fiche", "slug": "x", "nom": "X", "lieu": "", "details": "",
         "photo": False, "tel": "", "is_published": False, "vues": 0},
    ]))
    r = site.chercher_contenu("nosy komba")
    lignes = r.texte.splitlines()
    ligne_lieu = next(l for l in lignes if "[lieu]" in l)
    assert "publiée" not in ligne_lieu
    assert "/lieu/nosy-komba" in r.texte
    assert "NON publiée" in r.texte       # la fiche, elle, a bien cet état


# ── chiffres_site ──────────────────────────────────────────────────────────
def test_chiffres_recomptes_et_pourcentages(monkeypatch):
    monkeypatch.setattr(site, "_sql", FauxSQL([{
        "fiches": 200, "fiches_photo": 10, "fiches_tel": 50, "fiches_prix": 0,
        "fiches_lieu": 200, "fiches_toutes": 250, "lieux": 1000,
        "lieux_touristiques": 30, "sites": 40, "sites_tous": 45, "plats": 95,
        "publications": 183, "publications_masquees": 235, "evenements": 88,
        "membres": 2,
    }]))
    r = site.chiffres_site()
    assert r.ok
    assert "200 sur 250" in r.texte
    assert "photo 10 (5 %)" in r.texte
    assert "prix 0 (0 %)" in r.texte
    assert r.donnees["plats"] == 95


def test_chiffres_sans_reponse_echoue(monkeypatch):
    """Rendre 0 en succès ferait annoncer « le site est vide » à tort."""
    monkeypatch.setattr(site, "_sql", FauxSQL([]))
    assert not site.chiffres_site().ok


# ── journal_erreurs_site ───────────────────────────────────────────────────
def test_journal_borne_la_fenetre(monkeypatch):
    faux = FauxSQL([])
    monkeypatch.setattr(site, "_sql", faux)
    r = site.journal_erreurs_site("9999")
    assert "interval '90 days'" in faux.requetes[0][0]
    assert "plus personne ne remonte rien" in r.texte  # l'absence n'est pas une preuve


# ── sante_base ─────────────────────────────────────────────────────────────
def test_base_en_pause_ne_lance_aucun_select(monkeypatch):
    """Une base en pause ne répond à aucun SELECT : insister masquerait la
    vraie cause derrière un timeout."""
    faux = FauxSQL()
    monkeypatch.setattr(site, "_sql", faux)
    monkeypatch.setattr(site.config, "jeton_supabase", lambda: "jeton-de-test")
    monkeypatch.setattr(site.requests, "get", lambda *a, **k: FausseReponse(
        json_={"status": "INACTIVE", "name": "Diako", "region": "eu-west-3"}))
    r = site.sante_base()
    assert not r.ok and "INACTIVE" in r.texte and not faux.requetes


def test_sante_sans_jeton(monkeypatch):
    monkeypatch.setattr(site.config, "jeton_supabase", lambda: "")
    r = site.sante_base()
    assert not r.ok and "jeton" in r.texte.lower()


# ── etat_site ──────────────────────────────────────────────────────────────
PAGE = ('<!doctype html><html><head><title>Diako</title>'
        '<script src="/assets/index-B7wXQhSy.js"></script></head><body></body></html>')


def _pose_site(monkeypatch, reponse, bundle_local="assets/index-B7wXQhSy.js"):
    monkeypatch.setattr(site.requests, "get", lambda *a, **k: reponse)
    monkeypatch.setattr(site, "_bundle_du_depot", lambda: bundle_local)
    monkeypatch.setattr(site, "_git", lambda *a: "main")


def test_etat_site_accord(monkeypatch):
    _pose_site(monkeypatch, FausseReponse(
        200, PAGE, {"Last-Modified": "Sat, 19 Sep 2026 04:28:26 GMT"}))
    r = site.etat_site()
    assert r.ok and r.donnees["identiques"]
    assert "19/09 07:28" in r.texte          # heure de Tana, pas UTC


def test_etat_site_ecart_de_bundle(monkeypatch):
    _pose_site(monkeypatch, FausseReponse(200, PAGE, {}),
               bundle_local="assets/index-AUTRE123.js")
    r = site.etat_site()
    assert not r.ok and "ÉCART" in r.texte


def test_etat_site_refuse_la_page_de_blocage(monkeypatch):
    """🔴 o2switch sert un tigre aux clients HTTP nus. Conclure dessus, c'est
    décrire une page qu'aucun visiteur ne voit (audit AKORA, 05/09/2026)."""
    _pose_site(monkeypatch, FausseReponse(
        429, '<html><body><img id="img" src="tiger.svg"></body></html>', {}))
    r = site.etat_site()
    assert not r.ok and r.donnees.get("blocage") is True


def test_etat_site_pose_un_agent_credible(monkeypatch):
    vu = {}

    def faux_get(url, headers=None, timeout=None):
        vu.update(headers or {})
        return FausseReponse(200, PAGE, {})
    monkeypatch.setattr(site.requests, "get", faux_get)
    monkeypatch.setattr(site, "_bundle_du_depot", lambda: "assets/index-B7wXQhSy.js")
    monkeypatch.setattr(site, "_git", lambda *a: "main")
    site.etat_site()
    assert "Mobile Safari" in vu.get("User-Agent", "")


# ── publier_fiche / depublier_fiche ────────────────────────────────────────
def test_publier_refuse_un_slug_invalide(monkeypatch):
    faux = FauxSQL()
    monkeypatch.setattr(site, "_sql", faux)
    r = site.publier_fiche("Sakamanga; drop table pages")
    assert not r.ok and not faux.requetes


def test_publier_inconnu(monkeypatch):
    monkeypatch.setattr(site, "_sql", FauxSQL([]))
    r = site.publier_fiche("fiche-qui-nexiste-pas")
    assert not r.ok and "Aucune fiche" in r.texte


def test_publier_deja_publiee_n_ecrit_rien(monkeypatch):
    faux = FauxSQL([{"slug": "s", "name": "S", "is_published": True,
                     "lieu": "Tana", "tel": "033", "photo": True}])
    monkeypatch.setattr(site, "_sql", faux)
    r = site.publier_fiche("s")
    assert r.ok and r.donnees["deja"] is True
    assert len(faux.requetes) == 1 and faux.requetes[0][1] is False


def test_publier_pose_le_preambule_et_prouve_par_returning(monkeypatch):
    """🔴 SANS PRÉAMBULE, L'UPDATE PASSE ET NE FAIT RIEN : le déclencheur
    `pages_avant_ecriture` remet `is_published` à l'ancienne valeur, sans
    erreur. 333 fiches créées, 0 publiée (02/09/2026)."""
    faux = FauxSQL(
        [{"slug": "s", "name": "Sakamanga", "is_published": False,
          "lieu": "Antananarivo", "tel": "", "photo": False}],
        [{"slug": "s", "name": "Sakamanga", "is_published": True, "admin": True}],
    )
    monkeypatch.setattr(site, "_sql", faux)
    r = site.publier_fiche("s")
    assert r.ok
    ecriture, admin = faux.requetes[1]
    assert admin is True                              # le préambule est demandé
    assert "where slug = 's'" in ecriture             # bornée sur la clé
    assert "returning slug, name, is_published" in ecriture
    assert "is_published = true" in ecriture
    assert "⚠ La fiche n'a pas de photo ni de téléphone." in r.texte
    assert "/p/s" in r.texte


def test_le_preambule_contient_le_garde_is_admin():
    """Le garde lève une exception, donc toute la transaction est annulée —
    c'est ce qui distingue « refusé » de « écrit à moitié »."""
    assert "set_config('request.jwt.claims'" in site.PREAMBULE_ADMIN
    assert "public.is_admin()" in site.PREAMBULE_ADMIN
    assert "raise exception" in site.PREAMBULE_ADMIN
    assert site.PREAMBULE_ADMIN.count(";") >= 2


def test_publier_detecte_le_refus_silencieux(monkeypatch):
    """Le `returning` rend l'ancienne valeur : le déclencheur a gagné."""
    monkeypatch.setattr(site, "_sql", FauxSQL(
        [{"slug": "s", "name": "S", "is_published": False,
          "lieu": "", "tel": "", "photo": False}],
        [{"slug": "s", "name": "S", "is_published": False, "admin": False}],
    ))
    r = site.publier_fiche("s")
    assert not r.ok and "SILENCE" in r.texte.upper()


def test_publier_detecte_la_course(monkeypatch):
    """Zéro ligne modifiée : l'état a changé entre la lecture et l'écriture."""
    monkeypatch.setattr(site, "_sql", FauxSQL(
        [{"slug": "s", "name": "S", "is_published": False,
          "lieu": "", "tel": "", "photo": False}],
        [],
    ))
    assert not site.publier_fiche("s").ok


def test_depublier_ecrit_false(monkeypatch):
    faux = FauxSQL(
        [{"slug": "bellevue-hotel", "name": "Bellevue", "is_published": True,
          "lieu": "Antsiranana", "tel": "033", "photo": True}],
        [{"slug": "bellevue-hotel", "name": "Bellevue", "is_published": False,
          "admin": True}],
    )
    monkeypatch.setattr(site, "_sql", faux)
    r = site.depublier_fiche("bellevue-hotel")
    assert r.ok and "dépubliée" in r.texte
    ecriture, admin = faux.requetes[1]
    assert admin is True and "is_published = false" in ecriture


# ── masquer_publication_fil ────────────────────────────────────────────────
UUID = "6f1c2f6a-1111-4222-8333-444455556666"


def test_masquer_refuse_ce_qui_n_est_pas_un_uuid(monkeypatch):
    faux = FauxSQL()
    monkeypatch.setattr(site, "_sql", faux)
    for mauvais in ("12", "' or 1=1 --", "post-du-fil"):
        r = site.masquer_publication_fil(mauvais)
        assert not r.ok
    assert not faux.requetes


def test_masquer_deja_masquee(monkeypatch):
    faux = FauxSQL([{"id": UUID, "debut": "texte", "status": "hidden",
                     "kind": "recit", "pose_le": "12/09 08:00"}])
    monkeypatch.setattr(site, "_sql", faux)
    r = site.masquer_publication_fil(UUID)
    assert r.ok and r.donnees["deja"] is True and len(faux.requetes) == 1


def test_masquer_borne_et_prouve(monkeypatch):
    faux = FauxSQL(
        [{"id": UUID, "debut": "Un beau coucher de soleil", "status": "published",
          "kind": "recit", "pose_le": "12/09 08:00"}],
        [{"id": UUID, "status": "hidden", "debut": "Un beau coucher de soleil"}],
    )
    monkeypatch.setattr(site, "_sql", faux)
    r = site.masquer_publication_fil(UUID)
    assert r.ok
    ecriture, _ = faux.requetes[1]
    assert f"where id = '{UUID}'::uuid" in ecriture
    assert "returning" in ecriture and "status <> 'hidden'" in ecriture
    assert "Un beau coucher de soleil" in r.texte
    assert "rien n'est supprimé" in r.texte.lower()


def test_masquer_echoue_si_le_retour_ne_prouve_rien(monkeypatch):
    monkeypatch.setattr(site, "_sql", FauxSQL(
        [{"id": UUID, "debut": "t", "status": "published", "kind": "recit",
          "pose_le": "12/09 08:00"}],
        [{"id": UUID, "status": "published", "debut": "t"}],
    ))
    assert not site.masquer_publication_fil(UUID).ok


# ── envoyer_image_site ─────────────────────────────────────────────────────
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture
def image(tmp_path):
    chemin = tmp_path / "kirindy.png"
    chemin.write_bytes(PNG)
    return chemin


def test_envoi_refuse_ce_que_le_serveur_refuserait(monkeypatch, tmp_path, image):
    monkeypatch.setattr(site.config, "cle_env_diako", lambda *a, **k: "cle-de-test")
    assert not site.envoyer_image_site(str(tmp_path / "absent.png")).ok
    assert not site.envoyer_image_site(str(image), "uploads").ok      # dossier
    mauvais = tmp_path / "note.txt"
    mauvais.write_text("x", encoding="utf-8")
    assert not site.envoyer_image_site(str(mauvais)).ok               # extension


def test_envoi_sans_cle(monkeypatch, image):
    monkeypatch.setattr(site.config, "cle_env_diako", lambda *a, **k: "")
    r = site.envoyer_image_site(str(image))
    assert not r.ok and "Fonenako" in r.texte   # la clé de Diako n'est pas celle-là


def test_envoi_en_json_base64(monkeypatch, image):
    """🔴 JSON base64, jamais multipart : le pare-feu d'o2switch rend 406 à
    toute requête multipart portant un fichier sur ce domaine (19/09/2026)."""
    vu = {}

    def faux_post(url, headers=None, data=None, timeout=None, **reste):
        vu["url"] = url
        vu["headers"] = headers or {}
        vu["corps"] = json.loads(data)
        vu["reste"] = reste
        return FausseReponse(200, json_={
            "success": True, "url": "https://diako.fonenako.mg/uploads/pages/x.png",
            "thumb_url": "…thumb.webp", "variants": {"480": "a", "960": "b"},
        })
    monkeypatch.setattr(site.requests, "post", faux_post)
    monkeypatch.setattr(site.config, "cle_env_diako", lambda *a, **k: "cle-de-test")

    r = site.envoyer_image_site(str(image), "pages")
    assert r.ok
    assert "files" not in vu["reste"]                       # aucun multipart
    assert vu["headers"]["Content-Type"] == "application/json"
    assert vu["headers"]["X-API-Key"] == "cle-de-test"
    assert vu["corps"]["folder"] == "pages"
    assert vu["corps"]["filename"].endswith(".png")
    donnees = vu["corps"]["file"].split("base64,", 1)[1]
    assert base64.b64decode(donnees) == PNG                 # l'image, intacte
    assert r.donnees["variantes"] == {"480": "a", "960": "b"}


def test_envoi_nettoie_le_nom(monkeypatch, image):
    """Le serveur n'accepte que [A-Za-z0-9._/-] dans le nom (o2upload.php)."""
    vu = {}
    monkeypatch.setattr(site.requests, "post", lambda url, headers=None, data=None,
                        timeout=None, **k: (vu.update(json.loads(data)),
                                            FausseReponse(200, json_={
                                                "success": True, "url": "u",
                                                "variants": {}}))[1])
    monkeypatch.setattr(site.config, "cle_env_diako", lambda *a, **k: "cle")
    site.envoyer_image_site(str(image), "pages", "Nosy Bé (couverture).png")
    assert site.re.match(r"^[A-Za-z0-9._/-]+$", vu["filename"])


def test_envoi_406_est_nomme(monkeypatch, image):
    monkeypatch.setattr(site.requests, "post", lambda *a, **k: FausseReponse(
        406, "<html>index</html>"))
    monkeypatch.setattr(site.config, "cle_env_diako", lambda *a, **k: "cle")
    r = site.envoyer_image_site(str(image))
    assert not r.ok and "blocage" in r.texte.lower()


def test_envoi_refuse_trop_lourd(monkeypatch, tmp_path):
    gros = tmp_path / "gros.jpg"
    gros.write_bytes(b"\xff\xd8\xff" + b"0" * (site.POIDS_MAX_IMAGE + 1))
    monkeypatch.setattr(site.config, "cle_env_diako", lambda *a, **k: "cle")
    r = site.envoyer_image_site(str(gros))
    assert not r.ok and "10 Mo" in r.texte


# ── deployer_site ──────────────────────────────────────────────────────────
SORTIE_OK = """>> [diako] build...
en ligne avant : 300 fichiers ; a envoyer : 342
bascule faite : index.html envoye en dernier (342 fichiers, 18.4 Mo, 214 s)
nettoyage : 3 orphelin(s) de l'ancienne version efface(s) dans assets/
local   : assets/index-B7wXQhSy.js
en ligne: assets/index-B7wXQhSy.js
type MIME du bundle en ligne : application/javascript
DEPLOIEMENT VERIFIE
"""

SORTIE_ECART = """bascule faite : index.html envoye en dernier (342 fichiers, 18.4 Mo, 210 s)
local   : assets/index-NEUF1234.js
en ligne: assets/index-VIEUX999.js
ECART : la page en ligne ne reference pas le bundle du build local
"""


class FauxProcessus:
    def __init__(self, code, sortie):
        self.returncode = code
        self.stdout = sortie
        self.stderr = ""


def _pose_deploiement(monkeypatch, code, sortie, libre=4000):
    monkeypatch.setattr(site.Path, "exists", lambda self: True)
    monkeypatch.setattr(site, "_memoire_virtuelle_libre_mo", lambda: libre)
    monkeypatch.setattr(site.subprocess, "run",
                        lambda *a, **k: FauxProcessus(code, sortie))


def test_deploiement_verifie(monkeypatch):
    _pose_deploiement(monkeypatch, 0, SORTIE_OK)
    r = site.deployer_site()
    assert r.ok and r.donnees["fichiers"] == 342
    assert "342 fichiers" in r.texte and "index-B7wXQhSy.js" in r.texte


def test_deploiement_ecart_de_hash(monkeypatch):
    """🔴 redeploy.sh MENT quand on ne lit que son dernier message : le code de
    sortie (3) et la ligne ECART font foi."""
    _pose_deploiement(monkeypatch, 3, SORTIE_ECART)
    r = site.deployer_site()
    # ⚠ Le script écrit « ECART » sans accent : chercher « ÉCART » ne trouve
    #   rien et le banc passerait au vert sur un déploiement cassé.
    assert not r.ok
    assert "ECART" in r.texte and "index-VIEUX999.js" in r.texte


def test_deploiement_code_non_nul_meme_avec_verifie(monkeypatch):
    _pose_deploiement(monkeypatch, 1, SORTIE_OK)
    assert not site.deployer_site().ok


def test_deploiement_refuse_si_la_memoire_manque(monkeypatch):
    """Sous ce seuil, esbuild meurt en silence (exit 0, dist/ absent) et la
    prod garde l'ancien bundle — constaté sur AKORA le 03/09/2026."""
    appels = []
    monkeypatch.setattr(site.Path, "exists", lambda self: True)
    monkeypatch.setattr(site, "_memoire_virtuelle_libre_mo", lambda: 600)
    monkeypatch.setattr(site.subprocess, "run",
                        lambda *a, **k: appels.append(a) or FauxProcessus(0, ""))
    r = site.deployer_site()
    assert not r.ok and "600 Mo" in r.texte and not appels


def test_deploiement_script_absent(monkeypatch):
    monkeypatch.setattr(site.Path, "exists", lambda self: False)
    r = site.deployer_site()
    assert not r.ok and "introuvable" in r.texte


def test_deploiement_delai_depasse(monkeypatch):
    def tombe(*_a, **_k):
        raise site.subprocess.TimeoutExpired(cmd="bash", timeout=1800)
    monkeypatch.setattr(site.Path, "exists", lambda self: True)
    monkeypatch.setattr(site, "_memoire_virtuelle_libre_mo", lambda: 4000)
    monkeypatch.setattr(site.subprocess, "run", tombe)
    r = site.deployer_site()
    assert not r.ok and "inconnu" in r.texte.lower()


# ── Le filtre d'arguments du registre ──────────────────────────────────────
def test_une_competence_survit_a_un_parametre_invente(monkeypatch):
    """Le modèle invente des paramètres ; `executer` n'en garde que les siens."""
    competences.charger_toutes()
    monkeypatch.setattr(site, "_sql", FauxSQL([]))
    r = competences.executer("chercher_contenu",
                             {"nom": "sakamanga", "ville": "Tana", "tri": "date"})
    assert r.ok
