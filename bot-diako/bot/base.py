"""Base SQLite locale : sources, trouvailles, photos, lignes de carte, journal.

Une seule base, un seul fichier (data/bot.db) : facile à sauvegarder, facile à
jeter. Rien de sensible dedans — des numéros publics d'établissements et le
texte de publications publiques.

Le cache du référentiel Diako (pages, lieux, plats) vit ici aussi : c'est lui
qui permet de rapprocher une trouvaille d'une fiche existante **sans requête
réseau** au milieu de la collecte, dans les fils de l'atelier.
"""
from __future__ import annotations

import contextlib
import json
import re
import shutil
import sqlite3
import threading
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone

from .config import BASE, DOSSIER_DONNEES

_verrou = threading.Lock()

# ⚠ UNE TROUVAILLE N'EST PAS UNE ANNONCE. Le bot immobilier collectait un seul
#   type d'objet ; ici une même publication peut être un établissement, une
#   carte de restaurant, un événement ou un récit. `genre` décide de la table
#   d'arrivée sur Diako, et donc des champs qui comptent.
SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nom               TEXT NOT NULL,
    url               TEXT NOT NULL UNIQUE,
    -- groupe | page | fil | recherche  (Facebook)  ·  site  (le web ouvert)
    genre             TEXT NOT NULL DEFAULT 'groupe',
    actif             INTEGER NOT NULL DEFAULT 1,
    derniere_collecte TEXT,
    nb_trouvees       INTEGER NOT NULL DEFAULT 0,
    -- ⭐ Une source « site » sait DE QUELLE FICHE elle parle. C'est tout
    --   l'intérêt du web par rapport à Facebook : le site officiel d'un hôtel
    --   ne laisse aucun doute sur l'établissement, donc les tarifs qu'on y lit
    --   n'ont pas à être rapprochés au jugé.
    page_id           TEXT,
    page_nom          TEXT,
    origine           TEXT              -- 'annuaire' | 'osm' | 'facebook' | 'main'
);

CREATE TABLE IF NOT EXISTS trouvailles (
    id            TEXT PRIMARY KEY,
    empreinte     TEXT UNIQUE,
    -- ⭐ Signature du CONTENU, à côté de l'empreinte de la PUBLICATION.
    --   `empreinte` porte sur le permalien : deux copies du même menu publiées
    --   sur deux pages sont deux publications distinctes pour elle. Celle-ci
    --   porte sur le texte. Elle n'est PAS UNIQUE : les 179 doublons de contenu
    --   déjà en base doivent pouvoir y rester sans bloquer la migration.
    empreinte_texte TEXT,
    permalien     TEXT,
    source_id     INTEGER,
    source_nom    TEXT,
    source_genre  TEXT,
    auteur        TEXT,
    publie_le     TEXT,          -- la date TELLE QUE LUE (« 6 h », « 12 août 2019 »)
    date_post     TEXT,          -- date estimée (ISO). VIDE quand on ne sait pas.
    collecte_le   TEXT NOT NULL,
    texte         TEXT NOT NULL,
    dossier       TEXT,
    statut        TEXT NOT NULL DEFAULT 'a_trier',
    manques       TEXT NOT NULL DEFAULT '[]',
    note          TEXT,

    genre         TEXT NOT NULL DEFAULT 'recit',   -- etablissement|carte|evenement|recit
    titre         TEXT,

    -- ── Établissement ────────────────────────────────────────────────────
    nom_etab      TEXT,
    categories    TEXT NOT NULL DEFAULT '[]',
    sous_categorie TEXT,
    resume        TEXT,           -- pages.short_desc
    presentation  TEXT,           -- pages.long_desc
    adresse       TEXT,
    repere        TEXT,           -- pages.landmark : « en face de la station Jovenna »
    lat           REAL,
    lng           REAL,
    telephone     TEXT,
    whatsapp      TEXT,
    email         TEXT,
    site_web      TEXT,
    page_facebook TEXT,
    horaires      TEXT,
    equipements   TEXT NOT NULL DEFAULT '[]',
    niveau_prix   INTEGER,

    -- ── Prix relevé (jamais seul : montant + unité + date) ────────────────
    prix_ar       INTEGER,
    prix_unite    TEXT,           -- nuit | plat | personne | jour | circuit
    prix_vu_le    TEXT,

    -- ── Événement ────────────────────────────────────────────────────────
    evt_debut     TEXT,
    evt_fin       TEXT,
    evt_recurrent INTEGER NOT NULL DEFAULT 0,
    evt_genre     TEXT,
    organisateur  TEXT,

    -- ── Récit ────────────────────────────────────────────────────────────
    corps         TEXT,           -- posts.body, écrit par nous
    post_genre    TEXT,           -- recit | photo | bon_plan | avis | alerte

    -- ── Rapprochement avec le référentiel Diako ──────────────────────────
    page_id       TEXT,
    page_nom      TEXT,
    page_score    REAL,
    page_candidats TEXT NOT NULL DEFAULT '[]',
    lieu_id       TEXT,
    lieu_nom      TEXT,
    lieu_score    REAL,
    lieu_texte    TEXT,           -- le lieu tel qu'écrit dans la publication
    plat_id       TEXT,
    plat_nom      TEXT,

    -- ── Notation et relecture ────────────────────────────────────────────
    score         INTEGER NOT NULL DEFAULT 0,
    niveau        TEXT,
    lu_par_llm    INTEGER NOT NULL DEFAULT 0,
    llm_confiance INTEGER,
    llm_doute     TEXT,
    doublon_de    TEXT,

    -- ── Publication ──────────────────────────────────────────────────────
    cible_table   TEXT,
    cible_id      TEXT,
    lien_diako    TEXT,
    publie_a      TEXT
);

CREATE TABLE IF NOT EXISTS photos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trouvaille_id TEXT NOT NULL,
    fichier       TEXT NOT NULL,
    url_source    TEXT,
    largeur       INTEGER,
    hauteur       INTEGER,
    garder        INTEGER NOT NULL DEFAULT 1,
    couverture    INTEGER NOT NULL DEFAULT 0,
    est_la_carte  INTEGER NOT NULL DEFAULT 0,   -- photo d'une carte papier -> menu_photos
    ordre         INTEGER NOT NULL DEFAULT 0,
    url_o2        TEXT,
    FOREIGN KEY (trouvaille_id) REFERENCES trouvailles(id) ON DELETE CASCADE
);

-- Une ligne de carte : « Ravitoto sy henakisoa — 12 000 Ar ». C'est CE QUI
-- MANQUE LE PLUS à Diako (4 lignes en base pour 1 862 restaurants).
CREATE TABLE IF NOT EXISTS lignes_carte (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trouvaille_id TEXT NOT NULL,
    nom           TEXT NOT NULL,
    description   TEXT,
    prix_ar       INTEGER,
    unite         TEXT NOT NULL DEFAULT 'portion',
    section       TEXT,
    plat_id       TEXT,           -- rattachement au référentiel des 95 plats
    plat_nom      TEXT,
    garder        INTEGER NOT NULL DEFAULT 1,
    ordre         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (trouvaille_id) REFERENCES trouvailles(id) ON DELETE CASCADE
);

-- Un type de chambre : « Bungalow vue mer, 180 000 Ar la nuit ». 1 442 hôtels
-- de Diako n'ont AUCUN tarif ; c'est sur leur propre site qu'il se trouve.
CREATE TABLE IF NOT EXISTS lignes_chambre (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trouvaille_id TEXT NOT NULL,
    nom           TEXT NOT NULL,
    description   TEXT,
    prix_ar       INTEGER,
    unite         TEXT NOT NULL DEFAULT 'chambre',   -- chambre | personne
    capacite      INTEGER,
    sdb_privee    INTEGER NOT NULL DEFAULT 1,
    eau_chaude    INTEGER NOT NULL DEFAULT 0,
    vue           TEXT,
    saison        TEXT,           -- libellé de saison quand le site en donne
    garder        INTEGER NOT NULL DEFAULT 1,
    ordre         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (trouvaille_id) REFERENCES trouvailles(id) ON DELETE CASCADE
);

-- Une offre de location : « 4x4 Hilux avec chauffeur, 250 000 Ar/jour ».
-- Miroir local des colonnes utiles de `vehicle_offers` (migration 0114) : la
-- catégorie location_vehicule comptait 24 trouvailles et ne produisait AUCUNE
-- grille tarifaire — les prix restaient dans le texte, invisibles au site.
CREATE TABLE IF NOT EXISTS lignes_vehicule (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trouvaille_id   TEXT NOT NULL,
    -- valeurs de la contrainte vehicle_offers_vehicle_type, rien d'autre :
    -- 4x4 | berline | citadine | minibus | van | moto | quad | bateau | velo
    -- | camion | autre
    type_vehicule   TEXT NOT NULL DEFAULT 'autre',
    modele          TEXT,
    places          INTEGER,
    -- NULL = le texte ne le dit pas. C'est la base Diako qui applique alors
    -- son défaut (avec chauffeur, la norme à Madagascar) — pas nous.
    avec_chauffeur  INTEGER,
    carburant_inclus INTEGER,
    km_par_jour     INTEGER,
    prix_jour_ar    INTEGER,          -- NULLABLE, comme price_day_ar en prod
    note_prix       TEXT,
    caution_ar      INTEGER,
    garder          INTEGER NOT NULL DEFAULT 1,
    ordre           INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (trouvaille_id) REFERENCES trouvailles(id) ON DELETE CASCADE
);

-- Un circuit raconté par une agence : « Ampefy 2 jours, 180 km, 350 000 Ar ».
-- `tours` est VIDE sur Diako (0 ligne) alors que les agences en racontent dans
-- chaque publication : c'est le contenu le plus décrit et le moins exploité.
CREATE TABLE IF NOT EXISTS lignes_circuit (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trouvaille_id TEXT NOT NULL,
    titre         TEXT NOT NULL,
    resume        TEXT,
    jours         INTEGER,
    nuits         INTEGER,
    prix_ar       INTEGER,
    prix_unite    TEXT NOT NULL DEFAULT 'personne',
    base_personnes INTEGER,
    depart        TEXT,           -- lieu de départ, tel qu'écrit
    depart_id     TEXT,           -- rattaché au référentiel
    arrivee       TEXT,
    arrivee_id    TEXT,
    transports    TEXT NOT NULL DEFAULT '[]',
    inclus        TEXT NOT NULL DEFAULT '[]',
    garder        INTEGER NOT NULL DEFAULT 1,
    ordre         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (trouvaille_id) REFERENCES trouvailles(id) ON DELETE CASCADE
);

-- ── Cache du référentiel Diako ──────────────────────────────────────────
-- Rechargé depuis Supabase, jamais écrit vers lui. Sert au rapprochement, au
-- dédoublonnage et au tableau « ce qui manque ».
CREATE TABLE IF NOT EXISTS ref_pages (
    id         TEXT PRIMARY KEY,
    nom        TEXT NOT NULL,
    jeu        TEXT NOT NULL,      -- jetons normalisés, pour le rapprochement
    slug       TEXT,
    categories TEXT,
    lieu_id    TEXT,
    lieu_nom   TEXT,
    telephone  TEXT,
    cover_url  TEXT,
    site_web   TEXT,
    nb_carte   INTEGER NOT NULL DEFAULT 0,
    nb_chambre INTEGER NOT NULL DEFAULT 0
);

-- Les sites et parcs (`attractions`) : 2 521 fiches, 226 illustrées. Un récit
-- sur les Tsingy de Bemaraha doit pouvoir donner sa photo à la fiche du parc,
-- pas seulement passer sur le fil.
CREATE TABLE IF NOT EXISTS ref_sites (
    id        TEXT PRIMARY KEY,
    nom       TEXT NOT NULL,
    jeu       TEXT NOT NULL,
    slug      TEXT,
    genre     TEXT,
    lieu_id   TEXT,
    cover_url TEXT
);

CREATE TABLE IF NOT EXISTS ref_lieux (
    id      TEXT PRIMARY KEY,
    nom     TEXT NOT NULL,
    jeu     TEXT NOT NULL,
    slug    TEXT,
    genre   TEXT,
    region  TEXT,
    touristique INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ref_plats (
    id   TEXT PRIMARY KEY,
    nom  TEXT NOT NULL,
    jeu  TEXT NOT NULL,
    slug TEXT
);

CREATE TABLE IF NOT EXISTS journal (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    niveau  TEXT NOT NULL,
    message TEXT NOT NULL
);

-- Groupes et pages repérés par la prospection, en attente de votre verdict.
-- `ecarte` est une mémoire volontaire : sans elle, chaque prospection
-- reproposerait les mêmes trente groupes déjà refusés.
CREATE TABLE IF NOT EXISTS candidats_sources (
    cle        TEXT PRIMARY KEY,          -- identifiant Facebook du groupe/page
    genre      TEXT NOT NULL,             -- 'groupe' | 'page'
    nom        TEXT NOT NULL,
    url        TEXT NOT NULL,
    effectif   INTEGER,                   -- membres (groupe) ou abonnés (page)
    rythme     INTEGER,                   -- publications par jour, si affiché
    prive      INTEGER NOT NULL DEFAULT 0,
    lieu       TEXT,
    categorie  TEXT,
    requete    TEXT,                      -- la recherche qui l'a fait sortir
    -- Comment on l'a connu, et ce qu'il a RÉELLEMENT donné. Une source vue à
    -- l'œuvre sur le fil vaut mieux qu'une source jugée sur son nombre de
    -- membres : « 5 annonces retenues sur 6 vues » est une preuve, pas un
    -- pronostic.
    origine    TEXT NOT NULL DEFAULT 'recherche',   -- 'recherche' | 'fil'
    vues       INTEGER NOT NULL DEFAULT 0,   -- publications croisées
    retenues   INTEGER NOT NULL DEFAULT 0,   -- celles qui remplissaient nos critères
    publiees   INTEGER NOT NULL DEFAULT 0,   -- celles qui ont fini sur le site
    vu_dabord  TEXT,                         -- première fois qu'on l'a croisé
    note       INTEGER NOT NULL DEFAULT 0,
    niveau     TEXT,
    alertes    TEXT,                      -- JSON
    details    TEXT,                      -- JSON, pour montrer le pourquoi
    vu_le      TEXT NOT NULL,
    statut     TEXT NOT NULL DEFAULT 'nouveau',   -- nouveau | adopte | ecarte
    decide_le  TEXT
);

CREATE TABLE IF NOT EXISTS etat (
    cle    TEXT PRIMARY KEY,
    valeur TEXT
);

CREATE INDEX IF NOT EXISTS idx_trouvailles_statut ON trouvailles(statut);
CREATE INDEX IF NOT EXISTS idx_trouvailles_texte  ON trouvailles(empreinte_texte);
CREATE INDEX IF NOT EXISTS idx_trouvailles_genre  ON trouvailles(genre);
CREATE INDEX IF NOT EXISTS idx_trouvailles_tel    ON trouvailles(telephone);
CREATE INDEX IF NOT EXISTS idx_photos_trouvaille  ON photos(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_lignes_trouvaille  ON lignes_carte(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_journal_ts         ON journal(ts DESC);
CREATE INDEX IF NOT EXISTS idx_trouvailles_collecte ON trouvailles(collecte_le);
CREATE INDEX IF NOT EXISTS idx_chambres_trouvaille  ON lignes_chambre(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_circuits_trouvaille  ON lignes_circuit(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_vehicules_trouvaille ON lignes_vehicule(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_ref_pages_jeu      ON ref_pages(jeu);
CREATE INDEX IF NOT EXISTS idx_ref_lieux_jeu      ON ref_lieux(jeu);
"""

# Colonnes que l'interface a le droit de modifier.
CHAMPS_EDITABLES = {
    "statut", "note", "genre", "titre", "nom_etab", "categories", "sous_categorie",
    "resume", "presentation", "adresse", "repere", "lat", "lng", "telephone",
    "whatsapp", "email", "site_web", "page_facebook", "horaires", "equipements",
    "niveau_prix", "prix_ar", "prix_unite", "prix_vu_le", "evt_debut", "evt_fin",
    "evt_recurrent", "evt_genre", "organisateur", "corps", "post_genre",
    "page_id", "page_nom", "page_score", "page_candidats", "lieu_id", "lieu_nom",
    "lieu_score", "lieu_texte", "plat_id", "plat_nom", "site_id", "site_nom",
    "origine_cle",
    "score", "niveau",
    "lu_par_llm", "llm_confiance", "llm_doute", "doublon_de", "manques",
    "dossier", "cible_table", "cible_id", "lien_diako", "publie_a", "date_post",
}

CHAMPS_JSON = ("categories", "equipements", "manques", "page_candidats")


def maintenant() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextlib.contextmanager
def connexion():
    """Une connexion, validée à la sortie et FERMÉE.

    ⚠ `with sqlite3.connect(...) as cx` valide la transaction mais ne ferme
      pas la connexion : avec six travailleurs, le serveur et un `logguer` par
      ligne de journal, les descripteurs et lecteurs WAL s'accumulaient jusqu'au
      ramasse-miettes. Ici la fermeture est garantie.
    """
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    cx = sqlite3.connect(BASE, check_same_thread=False, timeout=20)
    try:
        cx.row_factory = sqlite3.Row
        cx.execute("PRAGMA foreign_keys = ON")
        cx.execute("PRAGMA journal_mode = WAL")
        with cx:
            yield cx
    finally:
        cx.close()


def _migrer(cx: sqlite3.Connection) -> None:
    """Rattrape les bases créées avant l'ouverture du bot au web ouvert.

    Doit tourner AVANT les `CREATE TABLE IF NOT EXISTS` : ceux-ci ne modifient
    pas une table qui existe déjà, et un `ALTER` manquant ne se voit qu'au
    premier accès à la colonne — c'est-à-dire trop tard.
    """
    tables = {
        l["name"] for l in cx.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    ajouts = {
        "sources": (("page_id", "TEXT"), ("page_nom", "TEXT"), ("origine", "TEXT"),
                    # Ce que la dernière lecture d'un site a donné, et depuis
                    # combien de passages elle échoue : 88 sources mortes sur
                    # 250 mangeaient 35 % de chaque tournée (mesuré le 02/09/2026).
                    ("dernier_resultat", "TEXT"),
                    ("echecs", "INTEGER NOT NULL DEFAULT 0")),
        "ref_pages": (("site_web", "TEXT"),
                      ("nb_chambre", "INTEGER NOT NULL DEFAULT 0")),
        "trouvailles": (("site_id", "TEXT"), ("site_nom", "TEXT"),
                        ("origine_cle", "TEXT"),
                        # ⚠ SANS `NOT NULL` NI `UNIQUE` : la base porte déjà
                        #   179 doublons de contenu, et un ALTER contraint
                        #   échouerait sur eux — la migration ne passerait
                        #   jamais. Les anciennes lignes restent à NULL ; seules
                        #   les nouvelles portent leur signature.
                        ("empreinte_texte", "TEXT")),
        "candidats_sources": (("origine", "TEXT NOT NULL DEFAULT 'recherche'"),
                              ("vues", "INTEGER NOT NULL DEFAULT 0"),
                              ("retenues", "INTEGER NOT NULL DEFAULT 0"),
                              ("publiees", "INTEGER NOT NULL DEFAULT 0"),
                              ("vu_dabord", "TEXT")),
    }
    for table, colonnes in ajouts.items():
        if table not in tables:
            continue
        presentes = {l["name"] for l in cx.execute(f"PRAGMA table_info({table})")}
        for nom, declaration in colonnes:
            if nom not in presentes:
                cx.execute(f"ALTER TABLE {table} ADD COLUMN {nom} {declaration}")


def initialiser() -> None:
    with _verrou, connexion() as cx:
        _migrer(cx)
        cx.executescript(SCHEMA)


# ── Petit état persistant (clé -> valeur) ───────────────────────────────────
def lire_etat(cle: str, defaut: str = "") -> str:
    with _verrou, connexion() as cx:
        ligne = cx.execute("SELECT valeur FROM etat WHERE cle = ?", (cle,)).fetchone()
    return ligne["valeur"] if ligne else defaut


def ecrire_etat(cle: str, valeur) -> None:
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT INTO etat (cle, valeur) VALUES (?, ?) "
            "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
            (cle, str(valeur)),
        )


# ── Journal ─────────────────────────────────────────────────────────────────
_ecritures_journal = 0


def logguer(message: str, niveau: str = "info") -> None:
    global _ecritures_journal
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT INTO journal (ts, niveau, message) VALUES (?, ?, ?)",
            (maintenant(), niveau, message),
        )
        # Le plafond se contrôle toutes les 50 écritures, pas à chacune : un
        # balayage par ligne coûtait plus que l'écriture elle-même. 4 000
        # lignes = plusieurs jours de collecte ; 500 n'en gardaient pas une.
        _ecritures_journal += 1
        if _ecritures_journal % 50 == 0:
            cx.execute(
                "DELETE FROM journal WHERE id NOT IN "
                "(SELECT id FROM journal ORDER BY id DESC LIMIT 4000)"
            )
    try:
        print(f"[{niveau}] {message}", flush=True)
    except UnicodeEncodeError:
        # Console Windows en cp1252 : le journal de l'interface reste complet.
        print(f"[{niveau}] {message.encode('ascii', 'replace').decode()}", flush=True)


def lire_journal(limite: int = 120) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT ts, niveau, message FROM journal ORDER BY id DESC LIMIT ?",
            (limite,),
        ).fetchall()
    return [dict(l) for l in lignes]


# ── Sources ─────────────────────────────────────────────────────────────────
def sources(actives_seulement: bool = False, pour_collecte: bool = False) -> list[dict]:
    """Les sources surveillées.

    `pour_collecte` change l'ordre : **la plus anciennement visitée d'abord**,
    jamais-visitées en tête. Sans ça, un ordre par identifiant ferait passer
    toujours les mêmes en premier et un tour interrompu n'atteindrait jamais la
    fin de la liste (défaut vécu sur le bot immobilier : les pages, ajoutées
    après les groupes, n'étaient jamais visitées).
    """
    requete = "SELECT * FROM sources"
    if actives_seulement:
        requete += " WHERE actif = 1"
    requete += (
        " ORDER BY derniere_collecte IS NOT NULL, derniere_collecte, id"
        if pour_collecte else " ORDER BY genre, id"
    )
    with _verrou, connexion() as cx:
        return [dict(l) for l in cx.execute(requete).fetchall()]


# 🔴 CE QUI N'EST PAS UN SITE D'ÉTABLISSEMENT. Réseaux (ils se collectent
#    autrement), agrégateurs de réservation (leurs conditions interdisent la
#    réutilisation), moteurs, messageries (« https://gmail.com » a été inscrit
#    comme site d'un restaurant), raccourcisseurs, plateformes.
HOTES_REFUSES = re.compile(
    r"(facebook|instagram|tiktok|youtube|twitter|x\.com|linkedin|wa\.me|whatsapp"
    r"|messenger|telegram|snapchat|pinterest"
    r"|booking\.com|tripadvisor|expedia|airbnb|agoda|hotels\.com|trivago|kayak"
    r"|hostelworld|makemytrip|viator|getyourguide"
    r"|google\.|bing\.com|yandex\.|duckduckgo|qwant"
    r"|gmail\.|yahoo\.|hotmail\.|outlook\.|live\.com|icloud\.|orange\.mg|moov\."
    r"|bit\.ly|tinyurl|linktr\.ee|t\.co$|goo\.gl|capto\.app|urls\.fr|calendly\.com"
    r"|cutt\.ly|rb\.gy|shorturl|s\.id$"
    r"|wikipedia\.|wikivoyage\.|paypal\.|gofundme)",
    re.I,
)


def normaliser_site(url: str) -> str | None:
    """L'adresse d'un site d'établissement, propre — ou None si ce n'en est pas une.

    🔴 UN SEUL POINT DE CONTRÔLE POUR QUATRE CHEMINS D'ENTRÉE. L'annuaire,
       OpenStreetMap, les liens des publications et la saisie manuelle
       inscrivaient chacun l'adresse à leur façon ; seule la saisie était
       filtrée. Résultat mesuré le 02/09/2026 : 18 sources sans schéma (donc
       invisibles au filtre des hôtes, `urlsplit("gmail.com").netloc == ""`),
       5 adresses portant un balisage Wikivoyage (« … {{dead link|…}} »),
       25 doublons d'hôte (http/https, avec ou sans www), et linktr.ee passé
       au travers.
    """
    texte = (url or "").strip()
    # Balisage wiki, espace, chevron : l'adresse s'arrête là.
    texte = re.split(r"[\s{<>\"']", texte)[0]
    if not texte:
        return None
    # « …/... » : c'est l'affichage abrégé de Facebook, pas une adresse.
    if "/..." in texte or "…" in texte:
        return None
    if not re.match(r"^https?://", texte, re.I):
        texte = "https://" + texte
    from urllib.parse import urlsplit, urlunsplit
    try:
        d = urlsplit(texte)
    except ValueError:
        return None
    hote = (d.hostname or "").lower()
    if not hote or "." not in hote or not re.match(r"^[a-z0-9.-]+$", hote):
        return None
    if HOTES_REFUSES.search(hote):
        return None
    chemin = re.sub(r"/+$", "", d.path) or ""
    # utm_ et fbclid ne désignent pas une page.
    return urlunsplit((d.scheme.lower(), hote, chemin, "", "")).rstrip("/")


def _cle_site(url: str) -> str:
    """Deux adresses du même site : sans schéma, sans www, sans barre finale."""
    u = (url or "").strip().lower().rstrip("/")
    u = re.sub(r"^https?://", "", u)
    return re.sub(r"^www\.", "", u)


def ajouter_source(nom: str, url: str, genre: str = "groupe", page_id: str = "",
                   page_nom: str = "", origine: str = "main") -> dict:
    if genre == "site":
        propre = normaliser_site(url)
        if not propre:
            raise ValueError(f"Ce n'est pas l'adresse d'un site d'établissement : {url!r}")
        url = propre
    with _verrou, connexion() as cx:
        if genre == "site":
            # Un site déjà connu sous une autre écriture (http/https, www) ne
            # s'ajoute pas une deuxième fois.
            for ligne in cx.execute("SELECT * FROM sources WHERE genre = 'site'"):
                if _cle_site(ligne["url"]) == _cle_site(url):
                    return dict(ligne)
        cx.execute(
            "INSERT OR IGNORE INTO sources (nom, url, genre, page_id, page_nom, origine)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (nom, url, genre, page_id or None, page_nom or None, origine),
        )
        ligne = cx.execute("SELECT * FROM sources WHERE url = ?", (url,)).fetchone()
    return dict(ligne)


# -- Candidats repérés par la prospection de sources -------------------------
def urls_sources() -> set[str]:
    """Les adresses déjà surveillées, pour ne pas les reproposer."""
    with _verrou, connexion() as cx:
        lignes = cx.execute("SELECT url FROM sources").fetchall()
    # Facebook écrit la même source de dix façons : on compare sur l'essentiel.
    return {_cle_url(l["url"]) for l in lignes} | {l["url"] for l in lignes}


def _cle_url(url: str) -> str:
    u = (url or "").strip().lower().rstrip("/")
    u = re.sub(r"^https?://(www\.|m\.|web\.)?facebook\.com", "", u)
    return re.sub(r"\?.*$", "", u)


def candidats_ecartes() -> set[str]:
    with _verrou, connexion() as cx:
        return {
            l["cle"] for l in cx.execute(
                "SELECT cle FROM candidats_sources WHERE statut IN ('ecarte', 'adopte')"
            ).fetchall()
        }


def ajouter_candidat(c: dict) -> bool:
    """Range un candidat. Renvoie True s'il est nouveau.

    Un candidat déjà jugé n'est pas réveillé : on rafraîchit seulement ses
    chiffres, parce qu'un groupe grossit et que sa note doit suivre.
    """
    with _verrou, connexion() as cx:
        existe = cx.execute(
            "SELECT statut FROM candidats_sources WHERE cle = ?", (c["cle"],)
        ).fetchone()
        if existe:
            cx.execute(
                "UPDATE candidats_sources SET effectif = ?, rythme = ?, note = ?, "
                "niveau = ?, alertes = ?, details = ?, vu_le = ? WHERE cle = ?",
                (c.get("effectif"), c.get("rythme_par_jour"), c.get("note", 0),
                 c.get("niveau"), json.dumps(c.get("alertes") or [], ensure_ascii=False),
                 json.dumps(c.get("details") or [], ensure_ascii=False),
                 maintenant(), c["cle"]),
            )
            return False
        cx.execute(
            "INSERT INTO candidats_sources (cle, genre, nom, url, effectif, rythme, "
            "prive, lieu, categorie, requete, note, niveau, alertes, details, vu_le) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (c["cle"], c["genre"], c["nom"], c["url"], c.get("effectif"),
             c.get("rythme_par_jour"), int(bool(c.get("prive"))), c.get("lieu"),
             c.get("categorie"), c.get("requete"), c.get("note", 0), c.get("niveau"),
             json.dumps(c.get("alertes") or [], ensure_ascii=False),
             json.dumps(c.get("details") or [], ensure_ascii=False), maintenant()),
        )
        return True


def observer_source(cle: str, genre: str, nom: str, url: str,
                    retenue: bool = False, deja_vue: bool = False) -> None:
    """Note qu'on a croisé une publication venant de cette source.

    C'est la mesure la plus honnête dont on dispose : elle ne prédit pas ce
    qu'une source vaut, elle constate ce qu'elle a donné. Un groupe croisé
    douze fois sur le fil sans qu'une seule publication remplisse nos critères
    n'a pas à devenir une source, quel que soit son nombre de membres.

    Une source DÉJÀ surveillée ou DÉJÀ écartée n'est pas comptée : le fil sert
    à découvrir, pas à re-proposer ce qui est tranché.
    """
    if not cle or not nom:
        return
    with _verrou, connexion() as cx:
        deja = cx.execute(
            "SELECT statut FROM candidats_sources WHERE cle = ?", (cle,)
        ).fetchone()
        if deja and deja["statut"] != "nouveau":
            return
        if cx.execute("SELECT 1 FROM sources WHERE url = ?", (url,)).fetchone():
            return
        if deja:
            # `deja_vue` : la vue a été comptée avant le tri, on n'ajoute ici
            # que la retenue. Sans ça, une publication gardée compterait deux
            # vues et fausserait le rendement vers le bas.
            if deja_vue:
                cx.execute(
                    "UPDATE candidats_sources SET retenues = retenues + 1, "
                    "vu_le = ? WHERE cle = ?", (maintenant(), cle))
            else:
                cx.execute(
                    "UPDATE candidats_sources SET vues = vues + 1, "
                    "retenues = retenues + ?, vu_le = ? WHERE cle = ?",
                    (1 if retenue else 0, maintenant(), cle))
        else:
            cx.execute(
                "INSERT INTO candidats_sources (cle, genre, nom, url, origine, "
                "vues, retenues, vu_le, vu_dabord) VALUES (?,?,?,?,'fil',1,?,?,?)",
                (cle, genre, nom, url, 1 if retenue else 0,
                 maintenant(), maintenant()),
            )


def compter_publication_source(cle: str) -> None:
    """Une annonce venue de cette source est passée en ligne : la meilleure preuve."""
    if not cle:
        return
    with _verrou, connexion() as cx:
        cx.execute(
            "UPDATE candidats_sources SET publiees = publiees + 1 WHERE cle = ?",
            (cle,),
        )


def candidats(statut: str = "nouveau", limite: int = 300) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT * FROM candidats_sources WHERE statut = ? "
            "ORDER BY note DESC, effectif DESC LIMIT ?",
            (statut, limite),
        ).fetchall()
    sortie = []
    for l in lignes:
        d = dict(l)
        for cle in ("alertes", "details"):
            try:
                d[cle] = json.loads(d[cle] or "[]")
            except (json.JSONDecodeError, TypeError):
                d[cle] = []
        sortie.append(d)
    return sortie


def decider_candidat(cle: str, statut: str) -> dict | None:
    """« adopte » ou « ecarte ». Adopter crée la source du même coup."""
    with _verrou, connexion() as cx:
        c = cx.execute(
            "SELECT * FROM candidats_sources WHERE cle = ?", (cle,)
        ).fetchone()
        if not c:
            return None
        cx.execute(
            "UPDATE candidats_sources SET statut = ?, decide_le = ? WHERE cle = ?",
            (statut, maintenant(), cle),
        )
        c = dict(c)
    if statut == "adopte":
        ajouter_source(c["nom"], c["url"], c["genre"], origine="prospection")
    return c


def compter_candidats() -> dict:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT statut, COUNT(*) n FROM candidats_sources GROUP BY statut"
        ).fetchall()
    return {l["statut"]: l["n"] for l in lignes}


def source_connue(url: str) -> bool:
    with _verrou, connexion() as cx:
        return cx.execute(
            "SELECT 1 FROM sources WHERE url = ?", (url,)
        ).fetchone() is not None


def modifier_source(sid: int, **champs) -> None:
    permis = {"nom", "url", "genre", "actif", "derniere_collecte", "nb_trouvees",
              "page_id", "page_nom", "origine", "dernier_resultat", "echecs"}
    champs = {k: v for k, v in champs.items() if k in permis}
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(f"UPDATE sources SET {set_sql} WHERE id = ?", (*champs.values(), sid))


def supprimer_source(sid: int) -> None:
    with _verrou, connexion() as cx:
        cx.execute("DELETE FROM sources WHERE id = ?", (sid,))


# ── Trouvailles ─────────────────────────────────────────────────────────────
def existe(empreinte: str) -> bool:
    with _verrou, connexion() as cx:
        return cx.execute(
            "SELECT 1 FROM trouvailles WHERE empreinte = ?", (empreinte,)
        ).fetchone() is not None


def texte_deja_vu(empreinte_texte: str, sauf: str = "") -> str | None:
    """L'id de la trouvaille qui porte DÉJÀ ce texte mot pour mot, sinon None.

    ⚠ On ne regarde pas les rejetées : une publication écartée à la main ne doit
      pas empêcher de recollecter le même texte si l'on change d'avis sur le
      genre. On ne regarde pas non plus les vides — `empreinte_texte` est NULL
      sur les 2 217 lignes d'avant cette colonne, et sur les textes trop courts.
    """
    if not empreinte_texte:
        return None
    with _verrou, connexion() as cx:
        ligne = cx.execute(
            "SELECT id FROM trouvailles WHERE empreinte_texte = ? AND id != ? "
            "AND statut != 'rejetee' ORDER BY collecte_le LIMIT 1",
            (empreinte_texte, sauf),
        ).fetchone()
    return ligne["id"] if ligne else None


def _encoder(donnees: dict) -> dict:
    donnees = dict(donnees)
    for cle in CHAMPS_JSON:
        if isinstance(donnees.get(cle), (list, dict)):
            donnees[cle] = json.dumps(donnees[cle], ensure_ascii=False)
    return donnees


def creer(donnees: dict) -> str:
    """Insère une trouvaille. Renvoie son id, ou '' si c'est un doublon."""
    tid = donnees.get("id") or str(uuid.uuid4())
    donnees = _encoder(
        dict(donnees, id=tid, collecte_le=donnees.get("collecte_le") or maintenant())
    )
    fixes = {
        "id", "empreinte", "empreinte_texte", "permalien", "source_id",
        "source_nom", "source_genre", "auteur", "publie_le", "collecte_le", "texte",
    }
    colonnes = [c for c in donnees if c in CHAMPS_EDITABLES | fixes]
    valeurs = [donnees[c] for c in colonnes]
    trous = ", ".join("?" for _ in colonnes)
    with _verrou, connexion() as cx:
        try:
            cx.execute(
                f"INSERT INTO trouvailles ({', '.join(colonnes)}) VALUES ({trous})",
                valeurs,
            )
        except sqlite3.IntegrityError as e:
            # ⚠ Seule la collision d'empreinte veut dire « doublon ». Un NOT
            #   NULL ou une clé étrangère violés sont des bugs d'écriture : les
            #   compter comme doublons les ferait disparaître sans bruit.
            if "UNIQUE" in str(e).upper():
                return ""
            raise
    return tid


def modifier(tid: str, champs: dict) -> None:
    champs = _encoder({k: v for k, v in champs.items() if k in CHAMPS_EDITABLES})
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(
            f"UPDATE trouvailles SET {set_sql} WHERE id = ?", (*champs.values(), tid)
        )


def supprimer(tid: str) -> None:
    with _verrou, connexion() as cx:
        cx.execute("DELETE FROM trouvailles WHERE id = ?", (tid,))


def purger_interrompues(age_minutes: int = 30) -> int:
    """Retire les trouvailles restées « en lecture » après un arrêt du bot.

    🔴 POURQUOI. Une trouvaille est créée `en_traitement` par le navigateur,
    puis terminée dans un fil de l'atelier (photos, lecture, rapprochement,
    score). Si le processus meurt entre les deux — le 23 et le 24/08/2026 la
    machine a tué les bots par manque de mémoire, le 02/09 elle a redémarré
    brutalement trois fois — la ligne reste `en_traitement` POUR TOUJOURS :
    rien ne la reprend, aucun écran ne la propose, et son empreinte empêche la
    même publication d'être recollectée. Mesuré le 02/09 : **311 lignes** dans
    cet état depuis dix jours, sans une photo (elles se téléchargent après).

    On les SUPPRIME plutôt que de les marquer : rien n'a été lu ni décidé, et
    les adresses des photos Facebook (CDN) ne sont plus valides. Effacer
    l'empreinte est ce qui permet à la prochaine collecte de reprendre la
    publication à zéro si elle repasse dans le fil.

    `age_minutes` protège une collecte réellement en cours : au démarrage du
    serveur il n'y en a jamais, mais la fonction peut aussi servir en
    entretien.
    """
    limite = (datetime.now(timezone.utc) - timedelta(minutes=age_minutes)).isoformat(
        timespec="seconds"
    )
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT id, dossier FROM trouvailles "
            "WHERE statut = 'en_traitement' AND collecte_le < ?", (limite,),
        ).fetchall()
        for ligne in lignes:
            cx.execute("DELETE FROM photos WHERE trouvaille_id = ?", (ligne["id"],))
            cx.execute("DELETE FROM trouvailles WHERE id = ?", (ligne["id"],))
    for ligne in lignes:
        if ligne["dossier"]:
            shutil.rmtree(DOSSIER_DONNEES / ligne["dossier"], ignore_errors=True)
    return len(lignes)


def _habiller(ligne: sqlite3.Row) -> dict:
    t = dict(ligne)
    for cle in CHAMPS_JSON:
        try:
            t[cle] = json.loads(t.get(cle) or "[]")
        except (json.JSONDecodeError, TypeError):
            t[cle] = []
    return t


def trouvaille(tid: str) -> dict | None:
    with _verrou, connexion() as cx:
        ligne = cx.execute("SELECT * FROM trouvailles WHERE id = ?", (tid,)).fetchone()
        if not ligne:
            return None
        t = _habiller(ligne)
        t["photos"] = [
            dict(p) for p in cx.execute(
                "SELECT * FROM photos WHERE trouvaille_id = ? "
                "ORDER BY couverture DESC, ordre", (tid,)
            ).fetchall()
        ]
        t["lignes_carte"] = [
            dict(l) for l in cx.execute(
                "SELECT * FROM lignes_carte WHERE trouvaille_id = ? ORDER BY ordre, id",
                (tid,)
            ).fetchall()
        ]
        t["lignes_chambre"] = [
            dict(l) for l in cx.execute(
                "SELECT * FROM lignes_chambre WHERE trouvaille_id = ? ORDER BY ordre, id",
                (tid,)
            ).fetchall()
        ]
        t["lignes_circuit"] = [
            _habiller_circuit(l) for l in cx.execute(
                "SELECT * FROM lignes_circuit WHERE trouvaille_id = ? ORDER BY ordre, id",
                (tid,)
            ).fetchall()
        ]
        t["lignes_vehicule"] = [
            dict(l) for l in cx.execute(
                "SELECT * FROM lignes_vehicule WHERE trouvaille_id = ? ORDER BY ordre, id",
                (tid,)
            ).fetchall()
        ]
    return t


TRIS = {
    "score": "t.score DESC, t.collecte_le DESC",
    "recent": "t.collecte_le DESC",
    "manque": "t.score DESC, t.collecte_le DESC",
}


# Ce qu'une trouvaille APPORTE, indépendamment de son genre et de son statut.
# ⚠ C'est la question que pose vraiment le tableau de bord : « montre-moi les
#   tarifs que j'ai récoltés », pas « montre-moi les établissements à trier ».
#   Sans ces filtres, les deux compteurs les plus précieux du bandeau — plats et
#   chambres — n'étaient que des nombres qu'on ne pouvait pas ouvrir.
APPORTS = {
    "plats": "EXISTS (SELECT 1 FROM lignes_carte c "
             "WHERE c.trouvaille_id = t.id AND c.garder = 1)",
    "chambres": "EXISTS (SELECT 1 FROM lignes_chambre h "
                "WHERE h.trouvaille_id = t.id AND h.garder = 1 AND h.prix_ar IS NOT NULL)",
    # ⚠ LA PERTE SILENCIEUSE RENDUE VISIBLE : 46 chambres sur 77 étaient jetées
    #   sans bruit faute de prix (`base_price_ar` est NOT NULL côté Diako). Ce
    #   filtre les montre, pour qu'on puisse saisir le prix à la main.
    "chambres_sans_prix": "EXISTS (SELECT 1 FROM lignes_chambre h "
                          "WHERE h.trouvaille_id = t.id AND h.garder = 1 "
                          "AND h.prix_ar IS NULL)",
    "vehicules": "EXISTS (SELECT 1 FROM lignes_vehicule v "
                 "WHERE v.trouvaille_id = t.id AND v.garder = 1)",
    "photos": "EXISTS (SELECT 1 FROM photos p "
              "WHERE p.trouvaille_id = t.id AND p.garder = 1)",
    "circuits": "EXISTS (SELECT 1 FROM lignes_circuit r "
                "WHERE r.trouvaille_id = t.id AND r.garder = 1)",
    "prix": "t.prix_ar IS NOT NULL",
    "site": "t.source_genre = 'site'",
    "rattachees": "t.page_id IS NOT NULL",
    "a_creer": "t.page_id IS NULL AND t.genre IN ('etablissement','carte')",
}


# ── Regrouper ce qui vient du même établissement ────────────────────────────
# ⭐ POURQUOI (mesuré le 24/08/2026 sur les 2 217 trouvailles). Quatre-vingt-
#   quatre établissements reviennent au moins deux fois, et ils totalisent
#   1 238 trouvailles : 83 pour « Nosy Be Hôtel & Spa », 61 pour l'« Hôtel
#   Carlton », 55 pour « KIBAN HOTEL Nosy Be ». En file de tri, ce sont 83
#   lignes à ouvrir une par une pour enrichir UNE seule fiche Diako.
#
# ⚠ L'ORDRE DES CLÉS N'EST PAS INTERCHANGEABLE. `page_id` est la fiche Diako
#   réelle : deux pages Facebook rattachées à la même fiche DOIVENT se
#   regrouper. La page Facebook vient ensuite, le nom d'établissement en
#   dernier — c'est le moins sûr, l'extraction le tire parfois d'une phrase.
def cle_entite(t: dict) -> str:
    """La clé de regroupement d'une trouvaille. '' = elle reste seule.

    ⚠ LE NOM EST APLATI EN NFKD avant d'être réduit : « Hôtel Carlton » et
      « Hotel Carlton » désignent le même établissement, et Facebook écrit
      indifféremment l'un ou l'autre — parfois en gras Unicode. Sans ce
      repliage, un même hôtel se retrouvait dans deux groupes voisins.
    """
    if t.get("page_id"):
        return f"fiche:{t['page_id']}"
    page = (t.get("page_facebook") or "").strip().lower().rstrip("/")
    if page:
        return f"fb:{page}"
    plat = "".join(
        c for c in unicodedata.normalize("NFKD", t.get("nom_etab") or "")
        if unicodedata.category(c) != "Mn"
    ).lower()
    nom = re.sub(r"[^a-z0-9]", "", plat)
    return f"nom:{nom}" if len(nom) >= 3 else ""


def nom_entite(t: dict) -> str:
    """Le nom à afficher en tête du groupe.

    ⚠ `page_nom` D'ABORD : c'est le nom de la fiche Diako, donc le seul qui
      ait été relu par un humain. `nom_etab` est extrait d'un texte, et il
      arrive qu'il ramasse une phrase entière en gras Unicode (« 𝗩𝗼𝘆𝗮𝗴𝗲𝗿,
      𝗰'𝗲𝘀𝘁 𝗱𝗲́𝗰𝗼𝘂𝘃𝗿𝗶𝗿… » coiffait un groupe de 52 publications). D'où
      l'aplatissement NFKD et la coupe : un titre de bloc, pas un paragraphe.
    """
    nom = (t.get("page_nom") or t.get("nom_etab")
           or (t.get("page_facebook") or "").rsplit("/", 1)[-1] or "").strip()
    nom = unicodedata.normalize("NFKC", nom)
    # ⚠ « Nosy Be Hôtel & Spa est à Nosy Be Hôtel & Spa. » — c'est le libellé
    #   d'un enregistrement de lieu, et il coiffe le plus gros groupe de la base
    #   (83 publications). On coupe à la tournure, on ne réécrit rien.
    nom = re.split(r"\s+(?:est à|est chez|a actualisé|est en direct)\b", nom)[0]
    nom = nom.strip(" .,-–—")
    return nom[:60].rstrip() + "…" if len(nom) > 60 else nom


def lister(statut: str | None = None, genre: str | None = None,
           source_id: int | None = None, recherche: str | None = None,
           tri: str = "score", limite: int = 300,
           apport: str | None = None) -> list[dict]:
    conditions, params = [], []
    if statut and statut != "tous":
        conditions.append("t.statut = ?")
        params.append(statut)
    if genre and genre != "tous":
        conditions.append("t.genre = ?")
        params.append(genre)
    if apport and apport in APPORTS:
        conditions.append(APPORTS[apport])
    if source_id:
        conditions.append("t.source_id = ?")
        params.append(source_id)
    if recherche:
        conditions.append(
            "(t.texte LIKE ? OR t.nom_etab LIKE ? OR t.lieu_texte LIKE ? "
            "OR t.telephone LIKE ? OR t.titre LIKE ?)"
        )
        params += [f"%{recherche}%"] * 5
    ou = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            f"""SELECT t.*,
                   (SELECT COUNT(*) FROM photos p
                     WHERE p.trouvaille_id = t.id AND p.garder = 1) AS nb_photos,
                   (SELECT p.fichier FROM photos p WHERE p.trouvaille_id = t.id
                     ORDER BY p.couverture DESC, p.ordre LIMIT 1) AS vignette,
                   (SELECT COUNT(*) FROM lignes_carte c
                     WHERE c.trouvaille_id = t.id AND c.garder = 1) AS nb_plats,
                   (SELECT COUNT(*) FROM lignes_chambre h
                     WHERE h.trouvaille_id = t.id AND h.garder = 1) AS nb_chambres,
                   (SELECT COUNT(*) FROM lignes_circuit r
                     WHERE r.trouvaille_id = t.id AND r.garder = 1) AS nb_circuits,
                   (SELECT COUNT(*) FROM lignes_vehicule v
                     WHERE v.trouvaille_id = t.id AND v.garder = 1) AS nb_vehicules
                FROM trouvailles t {ou}
                ORDER BY {TRIS.get(tri, TRIS['score'])} LIMIT ?""",
            (*params, limite),
        ).fetchall()
        # ⭐ LE REGROUPEMENT SE CALCULE ICI, PAS DANS LE NAVIGATEUR. L'interface
        #   sait regrouper ce qu'elle a reçu, mais pas compter ce qui reste
        #   derrière la limite de 300 lignes. `groupe_total` donne le vrai
        #   chiffre — « 61 publications » même si la page n'en montre que douze.
        #   ⚠ MÊMES FILTRES QUE LA LISTE (même `ou`, mêmes `params`) : un total
        #     « toutes trouvailles confondues » afficherait 61 dans une file où
        #     seules 3 attendent, et le compte n'aurait plus de sens.
        totaux: dict[str, int] = {}
        for l in cx.execute(
            f"""SELECT t.page_id, t.page_facebook, t.nom_etab, t.page_nom,
                       COUNT(*) AS n
                  FROM trouvailles t {ou}
                 GROUP BY t.page_id, t.page_facebook, t.nom_etab""",
            params,
        ).fetchall():
            cle = cle_entite(dict(l))
            if cle:
                totaux[cle] = totaux.get(cle, 0) + l["n"]

    trouvailles = [_habiller(l) for l in lignes]
    for t in trouvailles:
        cle = cle_entite(t)
        t["groupe_cle"] = cle
        t["groupe_nom"] = nom_entite(t) if cle else ""
        t["groupe_total"] = totaux.get(cle, 0)
    return trouvailles


def compteurs() -> dict:
    with _verrou, connexion() as cx:
        par_statut = {
            l["statut"]: l["n"] for l in cx.execute(
                "SELECT statut, COUNT(*) n FROM trouvailles GROUP BY statut"
            ).fetchall()
        }
        par_genre = {
            l["genre"]: l["n"] for l in cx.execute(
                "SELECT genre, COUNT(*) n FROM trouvailles "
                "WHERE statut NOT IN ('rejetee','doublon') GROUP BY genre"
            ).fetchall()
        }
        photos = cx.execute("SELECT COUNT(*) n FROM photos").fetchone()["n"]
        plats = cx.execute(
            "SELECT COUNT(*) n FROM lignes_carte WHERE garder = 1"
        ).fetchone()["n"]
        chambres = cx.execute(
            "SELECT COUNT(*) n FROM lignes_chambre WHERE garder = 1"
        ).fetchone()["n"]
        # ⚠ Le compteur des pertes silencieuses : une chambre sans prix ne PEUT
        #   pas partir (`base_price_ar` NOT NULL) et disparaissait sans bruit.
        chambres_sans_prix = cx.execute(
            "SELECT COUNT(*) n FROM lignes_chambre "
            "WHERE garder = 1 AND prix_ar IS NULL"
        ).fetchone()["n"]
        circuits = cx.execute(
            "SELECT COUNT(*) n FROM lignes_circuit WHERE garder = 1"
        ).fetchone()["n"]
        vehicules = cx.execute(
            "SELECT COUNT(*) n FROM lignes_vehicule WHERE garder = 1"
        ).fetchone()["n"]
    return {
        "a_trier": par_statut.get("a_trier", 0),
        "validee": par_statut.get("validee", 0),
        "publiee": par_statut.get("publiee", 0),
        "rejetee": par_statut.get("rejetee", 0),
        "incomplete": par_statut.get("incomplete", 0),
        "en_traitement": par_statut.get("en_traitement", 0),
        "doublon": par_statut.get("doublon", 0),
        "total": sum(par_statut.values()),
        "photos": photos,
        "plats": plats,
        "chambres": chambres,
        "chambres_sans_prix": chambres_sans_prix,
        "circuits": circuits,
        "vehicules": vehicules,
        "genres": par_genre,
    }


def chercher_jumelle(tid: str, telephone: str, nom_etab: str, page_id: str) -> str | None:
    """La même trouvaille déjà collectée ailleurs.

    Un établissement est reposté dans plusieurs groupes : les permaliens
    diffèrent, donc le dédoublonnage par publication ne les voit pas. Ici, deux
    filets : la fiche Diako visée (page_id) quand elle est connue, sinon le
    couple téléphone + nom.
    """
    with _verrou, connexion() as cx:
        if page_id:
            ligne = cx.execute(
                "SELECT id FROM trouvailles WHERE page_id = ? AND id != ? "
                "AND genre = 'etablissement' AND statut NOT IN ('rejetee','doublon') "
                "ORDER BY collecte_le LIMIT 1",
                (page_id, tid),
            ).fetchone()
            if ligne:
                return ligne["id"]
        if telephone and nom_etab:
            ligne = cx.execute(
                "SELECT id FROM trouvailles WHERE telephone = ? AND nom_etab = ? "
                "AND id != ? AND statut NOT IN ('rejetee','doublon') "
                "ORDER BY collecte_le LIMIT 1",
                (telephone, nom_etab, tid),
            ).fetchone()
            if ligne:
                return ligne["id"]
    return None


# ── Photos ──────────────────────────────────────────────────────────────────
def ajouter_photo(tid: str, fichier: str, url_source: str = "", largeur: int = 0,
                  hauteur: int = 0, ordre: int = 0) -> None:
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT INTO photos (trouvaille_id, fichier, url_source, largeur, hauteur,"
            " ordre) VALUES (?, ?, ?, ?, ?, ?)",
            (tid, fichier, url_source, largeur, hauteur, ordre),
        )


def modifier_photo(pid: int, **champs) -> None:
    permis = {"garder", "couverture", "ordre", "url_o2", "est_la_carte"}
    champs = {k: v for k, v in champs.items() if k in permis}
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(f"UPDATE photos SET {set_sql} WHERE id = ?", (*champs.values(), pid))


def definir_couverture(tid: str, pid: int) -> None:
    with _verrou, connexion() as cx:
        cx.execute("UPDATE photos SET couverture = 0 WHERE trouvaille_id = ?", (tid,))
        cx.execute("UPDATE photos SET couverture = 1, garder = 1 WHERE id = ?", (pid,))


def photos_a_publier(tid: str) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT * FROM photos WHERE trouvaille_id = ? AND garder = 1 "
            "ORDER BY couverture DESC, ordre", (tid,)
        ).fetchall()
    return [dict(l) for l in lignes]


# ── Lignes de carte ─────────────────────────────────────────────────────────
def ajouter_ligne_carte(tid: str, ligne: dict, ordre: int = 0) -> None:
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT INTO lignes_carte (trouvaille_id, nom, description, prix_ar, unite,"
            " section, plat_id, plat_nom, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                tid, ligne.get("nom", ""), ligne.get("description"),
                ligne.get("prix_ar"), ligne.get("unite") or "portion",
                ligne.get("section"), ligne.get("plat_id"), ligne.get("plat_nom"), ordre,
            ),
        )


def modifier_ligne_carte(lid: int, **champs) -> None:
    permis = {"nom", "description", "prix_ar", "unite", "section", "plat_id",
              "plat_nom", "garder", "ordre"}
    champs = {k: v for k, v in champs.items() if k in permis}
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(
            f"UPDATE lignes_carte SET {set_sql} WHERE id = ?", (*champs.values(), lid)
        )


def supprimer_ligne_carte(lid: int) -> None:
    with _verrou, connexion() as cx:
        cx.execute("DELETE FROM lignes_carte WHERE id = ?", (lid,))


def lignes_a_publier(tid: str) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT * FROM lignes_carte WHERE trouvaille_id = ? AND garder = 1 "
            "ORDER BY ordre, id", (tid,)
        ).fetchall()
    return [dict(l) for l in lignes]


# ── Types de chambre ────────────────────────────────────────────────────────
def ajouter_ligne_chambre(tid: str, ligne: dict, ordre: int = 0) -> None:
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT INTO lignes_chambre (trouvaille_id, nom, description, prix_ar,"
            " unite, capacite, sdb_privee, eau_chaude, vue, saison, ordre)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                tid, ligne.get("nom", ""), ligne.get("description"),
                ligne.get("prix_ar"), ligne.get("unite") or "chambre",
                ligne.get("capacite"), int(bool(ligne.get("sdb_privee", True))),
                int(bool(ligne.get("eau_chaude"))), ligne.get("vue"),
                ligne.get("saison"), ordre,
            ),
        )


def modifier_ligne_chambre(lid: int, **champs) -> None:
    permis = {"nom", "description", "prix_ar", "unite", "capacite", "sdb_privee",
              "eau_chaude", "vue", "saison", "garder", "ordre"}
    champs = {k: v for k, v in champs.items() if k in permis}
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(
            f"UPDATE lignes_chambre SET {set_sql} WHERE id = ?", (*champs.values(), lid)
        )


def supprimer_ligne_chambre(lid: int) -> None:
    with _verrou, connexion() as cx:
        cx.execute("DELETE FROM lignes_chambre WHERE id = ?", (lid,))


def chambres_a_publier(tid: str) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT * FROM lignes_chambre WHERE trouvaille_id = ? AND garder = 1 "
            "ORDER BY ordre, id", (tid,)
        ).fetchall()
    return [dict(l) for l in lignes]


# ── Circuits ────────────────────────────────────────────────────────────────
CHAMPS_CIRCUIT = {"titre", "resume", "jours", "nuits", "prix_ar", "prix_unite",
                  "base_personnes", "depart", "depart_id", "arrivee", "arrivee_id",
                  "transports", "inclus", "garder", "ordre"}


def ajouter_ligne_circuit(tid: str, ligne: dict, ordre: int = 0) -> None:
    ligne = dict(ligne, ordre=ordre)
    for cle in ("transports", "inclus"):
        if isinstance(ligne.get(cle), (list, dict)):
            ligne[cle] = json.dumps(ligne[cle], ensure_ascii=False)
    colonnes = [c for c in ligne if c in CHAMPS_CIRCUIT]
    trous = ", ".join("?" for _ in colonnes)
    with _verrou, connexion() as cx:
        cx.execute(
            f"INSERT INTO lignes_circuit (trouvaille_id, {', '.join(colonnes)}) "
            f"VALUES (?, {trous})",
            (tid, *(ligne[c] for c in colonnes)),
        )


def modifier_ligne_circuit(lid: int, **champs) -> None:
    champs = {k: v for k, v in champs.items() if k in CHAMPS_CIRCUIT}
    for cle in ("transports", "inclus"):
        if isinstance(champs.get(cle), (list, dict)):
            champs[cle] = json.dumps(champs[cle], ensure_ascii=False)
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(
            f"UPDATE lignes_circuit SET {set_sql} WHERE id = ?", (*champs.values(), lid)
        )


def supprimer_ligne_circuit(lid: int) -> None:
    with _verrou, connexion() as cx:
        cx.execute("DELETE FROM lignes_circuit WHERE id = ?", (lid,))


def _habiller_circuit(ligne) -> dict:
    c = dict(ligne)
    for cle in ("transports", "inclus"):
        try:
            c[cle] = json.loads(c.get(cle) or "[]")
        except (json.JSONDecodeError, TypeError):
            c[cle] = []
    return c


def circuits_a_publier(tid: str) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT * FROM lignes_circuit WHERE trouvaille_id = ? AND garder = 1 "
            "ORDER BY ordre, id", (tid,)
        ).fetchall()
    return [_habiller_circuit(l) for l in lignes]


# ── Offres de location de véhicule ──────────────────────────────────────────
CHAMPS_VEHICULE = {"type_vehicule", "modele", "places", "avec_chauffeur",
                   "carburant_inclus", "km_par_jour", "prix_jour_ar",
                   "note_prix", "caution_ar", "garder", "ordre"}


def ajouter_ligne_vehicule(tid: str, ligne: dict, ordre: int = 0) -> None:
    ligne = dict(ligne, ordre=ordre)
    # Les booléens tri-états (True / False / « pas dit ») se rangent tels
    # quels : 1, 0 ou NULL. Convertir None en 0 mentirait — « sans chauffeur »
    # et « le texte ne le dit pas » ne sont pas la même information.
    for cle in ("avec_chauffeur", "carburant_inclus"):
        if ligne.get(cle) is not None:
            ligne[cle] = int(bool(ligne[cle]))
    colonnes = [c for c in ligne if c in CHAMPS_VEHICULE]
    trous = ", ".join("?" for _ in colonnes)
    with _verrou, connexion() as cx:
        cx.execute(
            f"INSERT INTO lignes_vehicule (trouvaille_id, {', '.join(colonnes)}) "
            f"VALUES (?, {trous})",
            (tid, *(ligne[c] for c in colonnes)),
        )


def modifier_ligne_vehicule(lid: int, **champs) -> None:
    champs = {k: v for k, v in champs.items() if k in CHAMPS_VEHICULE}
    if not champs:
        return
    set_sql = ", ".join(f"{k} = ?" for k in champs)
    with _verrou, connexion() as cx:
        cx.execute(
            f"UPDATE lignes_vehicule SET {set_sql} WHERE id = ?", (*champs.values(), lid)
        )


def supprimer_ligne_vehicule(lid: int) -> None:
    with _verrou, connexion() as cx:
        cx.execute("DELETE FROM lignes_vehicule WHERE id = ?", (lid,))


def vehicules_a_publier(tid: str) -> list[dict]:
    with _verrou, connexion() as cx:
        lignes = cx.execute(
            "SELECT * FROM lignes_vehicule WHERE trouvaille_id = ? AND garder = 1 "
            "ORDER BY ordre, id", (tid,)
        ).fetchall()
    return [dict(l) for l in lignes]


# ── Cache du référentiel ────────────────────────────────────────────────────
def remplacer_referentiel(table: str, lignes: list[dict]) -> None:
    """Remplace un cache d'un bloc. Transaction : jamais de cache à moitié vide.

    ⚠ Un cache tronqué est pire que pas de cache : il fait croire qu'une fiche
      n'existe pas, et le bot en crée un doublon (leçon des 1000 lignes rendues
      en silence par PostgREST, cf. scripts/photos_archives.py).
    """
    if table not in ("ref_pages", "ref_lieux", "ref_plats", "ref_sites"):
        raise ValueError(table)
    if not lignes:
        return
    colonnes = list(lignes[0].keys())
    trous = ", ".join("?" for _ in colonnes)
    with _verrou, connexion() as cx:
        cx.execute(f"DELETE FROM {table}")
        cx.executemany(
            f"INSERT OR REPLACE INTO {table} ({', '.join(colonnes)}) VALUES ({trous})",
            [tuple(l[c] for c in colonnes) for l in lignes],
        )


def ajouter_au_referentiel(table: str, ligne: dict) -> None:
    """Ajoute UNE fiche au cache, sans attendre le rechargement de douze heures.

    🔴 POURQUOI CETTE FONCTION EXISTE. Le cache ne se remplissait qu'en bloc,
       toutes les douze heures. Une fiche que le bot venait de créer n'y entrait
       donc pas : la publication suivante du même établissement ne la trouvait
       pas, et en créait une deuxième, puis une troisième. Mesuré le 04/09/2026
       sur les 334 fiches écrites depuis le 16/08 : 250 noms distincts
       seulement — « Hotel Restaurant Dera » 25 fois, « Hôtel de la Mer » 17.

    Le cache n'est pas la vérité, la base l'est ; mais c'est lui que le
    rapprochement interroge. Une fiche qui existe et n'y figure pas est, pour
    le bot, une fiche qui n'existe pas.
    """
    if table not in ("ref_pages", "ref_lieux", "ref_plats", "ref_sites"):
        raise ValueError(table)
    if not ligne.get("id"):
        return
    colonnes = list(ligne.keys())
    trous = ", ".join("?" for _ in colonnes)
    with _verrou, connexion() as cx:
        cx.execute(
            f"INSERT OR REPLACE INTO {table} ({', '.join(colonnes)}) VALUES ({trous})",
            tuple(ligne[c] for c in colonnes),
        )


def referentiel(table: str) -> list[dict]:
    with _verrou, connexion() as cx:
        return [dict(l) for l in cx.execute(f"SELECT * FROM {table}").fetchall()]


def ligne_referentiel(table: str, rid: str) -> dict | None:
    """UNE fiche du cache, par son identifiant.

    Le repli du lieu (hériter du `place_id` d'une fiche rattachée) n'a besoin
    que d'une ligne : charger les 3 356 fiches pour en lire une, à chaque
    trouvaille de l'atelier, coûterait plus que tout le reste du traitement.
    """
    if table not in ("ref_pages", "ref_lieux", "ref_plats", "ref_sites"):
        raise ValueError(table)
    if not rid:
        return None
    with _verrou, connexion() as cx:
        ligne = cx.execute(
            f"SELECT * FROM {table} WHERE id = ?", (rid,)
        ).fetchone()
    return dict(ligne) if ligne else None


def taille_referentiel() -> dict:
    with _verrou, connexion() as cx:
        return {
            t: cx.execute(f"SELECT COUNT(*) n FROM {t}").fetchone()["n"]
            for t in ("ref_pages", "ref_lieux", "ref_plats", "ref_sites")
        }
