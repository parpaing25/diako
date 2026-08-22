"""Base SQLite locale : sources, trouvailles, photos, lignes de carte, journal.

Une seule base, un seul fichier (data/bot.db) : facile à sauvegarder, facile à
jeter. Rien de sensible dedans — des numéros publics d'établissements et le
texte de publications publiques.

Le cache du référentiel Diako (pages, lieux, plats) vit ici aussi : c'est lui
qui permet de rapprocher une trouvaille d'une fiche existante **sans requête
réseau** au milieu de la collecte, dans les fils de l'atelier.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

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
    permalien     TEXT,
    source_id     INTEGER,
    source_nom    TEXT,
    source_genre  TEXT,
    auteur        TEXT,
    publie_le     TEXT,
    date_post     TEXT,          -- date estimée de la publication (ISO, pour « prix vu le »)
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

CREATE TABLE IF NOT EXISTS etat (
    cle    TEXT PRIMARY KEY,
    valeur TEXT
);

CREATE INDEX IF NOT EXISTS idx_trouvailles_statut ON trouvailles(statut);
CREATE INDEX IF NOT EXISTS idx_trouvailles_genre  ON trouvailles(genre);
CREATE INDEX IF NOT EXISTS idx_trouvailles_tel    ON trouvailles(telephone);
CREATE INDEX IF NOT EXISTS idx_photos_trouvaille  ON photos(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_lignes_trouvaille  ON lignes_carte(trouvaille_id);
CREATE INDEX IF NOT EXISTS idx_journal_ts         ON journal(ts DESC);
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
    "lieu_score", "lieu_texte", "plat_id", "plat_nom", "score", "niveau",
    "lu_par_llm", "llm_confiance", "llm_doute", "doublon_de", "manques",
    "dossier", "cible_table", "cible_id", "lien_diako", "publie_a", "date_post",
}

CHAMPS_JSON = ("categories", "equipements", "manques", "page_candidats")


def maintenant() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connexion() -> sqlite3.Connection:
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    cx = sqlite3.connect(BASE, check_same_thread=False, timeout=20)
    cx.row_factory = sqlite3.Row
    cx.execute("PRAGMA foreign_keys = ON")
    cx.execute("PRAGMA journal_mode = WAL")
    return cx


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
        "sources": (("page_id", "TEXT"), ("page_nom", "TEXT"), ("origine", "TEXT")),
        "ref_pages": (("site_web", "TEXT"),
                      ("nb_chambre", "INTEGER NOT NULL DEFAULT 0")),
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
def logguer(message: str, niveau: str = "info") -> None:
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT INTO journal (ts, niveau, message) VALUES (?, ?, ?)",
            (maintenant(), niveau, message),
        )
        cx.execute(
            "DELETE FROM journal WHERE id NOT IN "
            "(SELECT id FROM journal ORDER BY id DESC LIMIT 500)"
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


def ajouter_source(nom: str, url: str, genre: str = "groupe", page_id: str = "",
                   page_nom: str = "", origine: str = "main") -> dict:
    with _verrou, connexion() as cx:
        cx.execute(
            "INSERT OR IGNORE INTO sources (nom, url, genre, page_id, page_nom, origine)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (nom, url, genre, page_id or None, page_nom or None, origine),
        )
        ligne = cx.execute("SELECT * FROM sources WHERE url = ?", (url,)).fetchone()
    return dict(ligne)


def source_connue(url: str) -> bool:
    with _verrou, connexion() as cx:
        return cx.execute(
            "SELECT 1 FROM sources WHERE url = ?", (url,)
        ).fetchone() is not None


def modifier_source(sid: int, **champs) -> None:
    permis = {"nom", "url", "genre", "actif", "derniere_collecte", "nb_trouvees",
              "page_id", "page_nom", "origine"}
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
        "id", "empreinte", "permalien", "source_id", "source_nom", "source_genre",
        "auteur", "publie_le", "collecte_le", "texte",
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
        except sqlite3.IntegrityError:
            return ""
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
    return t


TRIS = {
    "score": "t.score DESC, t.collecte_le DESC",
    "recent": "t.collecte_le DESC",
    "manque": "t.score DESC, t.collecte_le DESC",
}


def lister(statut: str | None = None, genre: str | None = None,
           source_id: int | None = None, recherche: str | None = None,
           tri: str = "score", limite: int = 300) -> list[dict]:
    conditions, params = [], []
    if statut and statut != "tous":
        conditions.append("t.statut = ?")
        params.append(statut)
    if genre and genre != "tous":
        conditions.append("t.genre = ?")
        params.append(genre)
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
                     WHERE h.trouvaille_id = t.id AND h.garder = 1) AS nb_chambres
                FROM trouvailles t {ou}
                ORDER BY {TRIS.get(tri, TRIS['score'])} LIMIT ?""",
            (*params, limite),
        ).fetchall()
    return [_habiller(l) for l in lignes]


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


# ── Cache du référentiel ────────────────────────────────────────────────────
def remplacer_referentiel(table: str, lignes: list[dict]) -> None:
    """Remplace un cache d'un bloc. Transaction : jamais de cache à moitié vide.

    ⚠ Un cache tronqué est pire que pas de cache : il fait croire qu'une fiche
      n'existe pas, et le bot en crée un doublon (leçon des 1000 lignes rendues
      en silence par PostgREST, cf. scripts/photos_archives.py).
    """
    if table not in ("ref_pages", "ref_lieux", "ref_plats"):
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


def referentiel(table: str) -> list[dict]:
    with _verrou, connexion() as cx:
        return [dict(l) for l in cx.execute(f"SELECT * FROM {table}").fetchall()]


def taille_referentiel() -> dict:
    with _verrou, connexion() as cx:
        return {
            t: cx.execute(f"SELECT COUNT(*) n FROM {t}").fetchone()["n"]
            for t in ("ref_pages", "ref_lieux", "ref_plats")
        }
