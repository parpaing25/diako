"""Parcours de Facebook et récolte des trouvailles.

Deux fils de travail, séparés à dessein :

  1. **Le navigateur** ne fait que ce qui exige Facebook : défiler, déplier les
     « Voir plus » sur place, lire le texte et l'adresse des photos, capturer
     la publication. Il avance à allure humaine, sans jamais attendre autre
     chose que Facebook.
  2. **L'atelier** (quelques fils parallèles) fait tout le reste : télécharger
     les photos depuis le CDN, faire relire par le modèle, lire une carte
     photographiée, rapprocher de l'annuaire, noter, écrire en base. Rien de
     tout ça ne touche facebook.com.

Pourquoi cette séparation : la lecture d'une carte par le modèle prend une
minute. L'enchaîner dans le fil du navigateur multiplierait la durée d'une
collecte par dix — sans pour autant ménager Facebook, puisque cette attente ne
le concerne pas.

QUATRE NATURES DE SOURCE, et la troisième est celle qui trouve des niches :
  · **groupe**    — un groupe dont on est membre, en tri chronologique ;
  · **page**      — le fil d'une page (restaurant, hôtel, office du tourisme) ;
  · **fil**       — le fil d'actualité du compte, en tri chronologique. C'est
                    là que remontent les publications des groupes et des pages
                    déjà suivis, sans avoir à les déclarer un par un ;
  · **recherche** — une recherche Facebook (« ravitoto Antananarivo »,
                    « nouveau restaurant Nosy Be »). C'est le seul moyen
                    d'atteindre ce qu'on ne suit pas encore.
"""
from __future__ import annotations

import hashlib
import json
import queue
import random
import re
import shutil
import sqlite3
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import parse_qsl, quote_plus, urlencode, urlsplit, urlunsplit

import requests
from playwright.sync_api import sync_playwright

from . import analyse_llm, base, diako, extraction, redaction, toile
from . import score as notation
from .config import DOSSIER_TROUVAILLES, PROFIL_NAVIGATEUR, charger

# ⚠ REPÉRAGE D'UNE PUBLICATION DANS LE FIL — vérifié sur le vrai Facebook le
#   22/08/2026 : `div[role="article"]` ne désigne PLUS une publication, seulement
#   les COMMENTAIRES. Une page de groupe pleine de publications n'en montrait
#   que deux ou trois, tous des commentaires — d'où une collecte qui revenait à
#   « 0 candidat ». Le marqueur qui tient aujourd'hui est `aria-posinset` (rang
#   de l'élément dans le fil). On garde les anciens sélecteurs en repli : le
#   jour où Facebook rechange, l'un des trois répondra.
JS_EXTRAIRE_FIL = """
(largeurMin) => {
  const estRacine = (el, sel) => !el.parentElement?.closest(sel);

  let blocs = [...document.querySelectorAll('div[aria-posinset]')]
    .filter(el => estRacine(el, 'div[aria-posinset]'));

  if (!blocs.length) {
    blocs = [...document.querySelectorAll('div[role="feed"] > div')];
  }
  if (!blocs.length) {
    blocs = [...document.querySelectorAll('div[role="article"]')]
      .filter(el => estRacine(el, 'div[role="article"]'));
  }

  // Le fil colle « Facebook » en boucle dans innerText (libellés des
  // visionneuses d'images) ainsi que les libellés d'interface. Sans ce
  // nettoyage, le texte d'une publication est noyé.
  const BRUIT = /^(facebook|j'aime|jaime|commenter|partager|répondre|repondre|voir plus|… en voir plus|en voir plus|tout voir|auteur|top fan|membre|admin|modérateur|moderateur|suivre|rejoindre|voir la traduction|traduction)$/i;
  const nettoyer = (t) => (t || '')
    .split('\\n')
    .map(l => l.trim())
    .filter(l => l && !BRUIT.test(l))
    .join('\\n');

  return blocs.map(el => {
    const liens = [...el.querySelectorAll('a[href]')].map(a => a.href);
    const permalien = liens.find(h =>
      /\\/posts\\/|\\/permalink\\/|story_fbid=|multi_permalinks=|\\/videos\\//.test(h)) || '';

    const images = [...el.querySelectorAll('img')]
      .map(i => ({
        url: i.currentSrc || i.src,
        largeur: i.naturalWidth || i.width || 0,
        hauteur: i.naturalHeight || i.height || 0,
      }))
      .filter(o => o.url && o.url.includes('scontent') && o.largeur >= largeurMin);

    const message = el.querySelector(
      '[data-ad-preview="message"], [data-ad-comet-preview="message"]');
    const texte = nettoyer(message ? message.innerText : el.innerText);

    const heure = el.querySelector(
      'a[href*="/posts/"] span, a[href*="permalink"] span, abbr')?.innerText || '';

    // Nom de l'auteur : il devient l'attribution de la trouvaille.
    const enTete = el.querySelector('h2 a, h3 a, h4 a, strong a, h2 span, h3 span');
    const auteur = (enTete?.innerText || '').split('\\n')[0].trim();

    return {
      texte,
      permalien: permalien.split('?')[0],
      images,
      nb_images: images.length,
      heure,
      auteur,
      posinset: el.getAttribute('aria-posinset') || '',
    };
  }).filter(p => p.texte.length > 10 || p.nb_images > 0);
}
"""

# Déplie les textes coupés à « Voir plus », SANS changer de page. C'est ce qui
# permet de ne plus ouvrir chaque publication dans un onglet — une page chargée
# en moins par trouvaille, pour Facebook comme pour nous.
JS_DEPLIER = """
() => {
  const libelles = ['Voir plus', 'See more', 'En voir plus', 'Afficher plus',
                    'Hijery bebe kokoa'];
  const boutons = [...document.querySelectorAll('div[role="button"], span[role="button"]')]
    .filter(b => libelles.some(l => (b.innerText || '').trim() === l));
  boutons.forEach(b => { try { b.click(); } catch (e) {} });
  return boutons.length;
}
"""

NAVIGATEUR_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

CLE_SESSION = "session_facebook"

# Premiers segments d'URL qui ne désignent ni un groupe ni une page.
CHEMINS_REFUSES = {
    "posts", "photo", "photos", "watch", "reel", "reels", "video", "videos",
    "marketplace", "events", "story.php", "permalink.php", "media", "login",
    "help", "settings", "messages", "notifications", "bookmarks",
    "sharer.php", "hashtag", "stories",
}


def _pause(bornes) -> None:
    time.sleep(random.uniform(float(bornes[0]), float(bornes[1])))


def memoire_libre_mo() -> int | None:
    """Mémoire virtuelle disponible, en mégaoctets. None si on ne sait pas.

    🔴 CE CONTRÔLE EXISTE PARCE QUE LA MACHINE A TUÉ LES TROIS BOTS. Le
       23/08/2026, il ne restait que **189 Mo de mémoire virtuelle libre** sur
       29,3 Go : Windows tue les processus dans cet état, et c'est ce qui a
       éteint Fonenako, Diako et AKORA le même jour. Chromium en réclame près
       d'un gigaoctet à lui seul.

    ⚠ On mesure la mémoire ENGAGEABLE (`ullAvailPageFile`), pas la RAM libre.
      C'est elle qui plafonne : les fichiers d'échange de cette machine sont à
      taille fixe, donc la limite d'engagement est atteinte bien avant que la
      RAM ne se remplisse.
    """
    try:
        import ctypes

        class _Etat(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        etat = _Etat()
        etat.dwLength = ctypes.sizeof(_Etat)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(etat)):
            return None
        return int(min(etat.ullAvailPageFile, etat.ullAvailPhys) // (1024 * 1024))
    except Exception:
        return None   # pas Windows, ou API indisponible : on ne bloque rien


def empreinte(texte: str, permalien: str) -> str:
    """Identifie une publication. Le permalien prime ; sinon le texte normalisé."""
    if permalien:
        return hashlib.sha1(permalien.encode()).hexdigest()
    reduit = re.sub(r"[^a-z0-9]", "", texte.lower())[:300]
    return hashlib.sha1(reduit.encode()).hexdigest()


def _age_en_jours(heure: str) -> int | None:
    """« 3 h », « Hier », « 2 j », « 5 sem. » -> âge approximatif, sinon None."""
    n = heure.lower().strip()
    if not n:
        return None
    if "hier" in n or "yesterday" in n:
        return 1
    trouve = re.search(r"(\d+)\s*(min|mn|h|j|d|sem|w|mois|mo|an|y)", n)
    if not trouve:
        return None
    valeur, unite = int(trouve.group(1)), trouve.group(2)
    if unite in ("min", "mn", "h"):
        return 0
    if unite in ("j", "d"):
        return valeur
    if unite in ("sem", "w"):
        return valeur * 7
    if unite in ("mois", "mo"):
        return valeur * 30
    return valeur * 365


def date_de_publication(heure: str) -> str:
    """Date estimée de la publication — c'est elle qui date les prix relevés.

    ⚠ Facebook n'affiche qu'un âge relatif dans le fil (« 3 j »). La date qu'on
      en tire est approximative à un jour près, et c'est assez : elle sert à
      dire « prix relevé le… », pas à horodater.
    """
    age = _age_en_jours(heure)
    if age is None:
        return date.today().isoformat()
    return (date.today() - timedelta(days=age)).isoformat()


# ── Sources ─────────────────────────────────────────────────────────────────
URL_FIL = "https://www.facebook.com/?sk=h_chr"


def _url_recherche(termes: str) -> str:
    return f"https://www.facebook.com/search/posts/?q={quote_plus(termes)}"


def _propre_web(url: str) -> str:
    """Retire le pistage d'une adresse de site (utm_*, fbclid…)."""
    decoupe = urlsplit(url)
    gardes = [
        (c, v) for c, v in parse_qsl(decoupe.query)
        if not c.lower().startswith(("utm_", "fbclid", "gclid", "mc_"))
    ]
    return urlunsplit(
        (decoupe.scheme or "https", decoupe.netloc.lower(),
         decoupe.path.rstrip("/") or "/", urlencode(gardes), "")
    )


def _url_fil_de_page(url: str) -> str:
    """Nettoie l'adresse d'une page pour tomber sur son fil de publications.

    Les adresses copiées depuis Facebook traînent du pistage (`?ref=`,
    `?mibextid=`…) qui peut renvoyer sur un onglet « À propos » ou « Avis ».
    Seul `profile.php` garde son paramètre : son `id` EST l'adresse.
    """
    decoupe = urlsplit(url)
    parametres = ""
    if decoupe.path.rstrip("/").endswith("profile.php"):
        parametres = urlencode([(c, v) for c, v in parse_qsl(decoupe.query) if c == "id"])
    return urlunsplit(
        (decoupe.scheme or "https", decoupe.netloc, decoupe.path, parametres, "")
    )


def analyser_source(entree: str) -> tuple[str, str]:
    """Valide une entrée et dit de quelle nature de source il s'agit.

    Renvoie (url_propre, genre). Lève ValueError avec un message utilisable tel
    quel dans l'interface.

    ⚠ CE QUI N'EST PAS UNE ADRESSE EST UNE RECHERCHE. Coller « nouveau
      restaurant Nosy Be » crée une source de recherche : c'est le seul moyen
      d'atteindre ce qu'on ne suit pas encore, et c'est là que se trouvent les
      niches.
    """
    entree = entree.strip()
    if not entree:
        raise ValueError("Entrée vide.")

    ressemble_a_une_url = bool(
        re.match(r"^(https?://|www\.|facebook\.com|fb\.com|m\.facebook)", entree, re.I)
    )
    if not ressemble_a_une_url:
        if len(entree) < 3:
            raise ValueError("Recherche trop courte — donnez au moins trois lettres.")
        return _url_recherche(entree), "recherche"

    url = entree if entree.startswith(("http://", "https://")) else "https://" + entree
    decoupe = urlsplit(url)
    hote = decoupe.netloc.lower()
    if "facebook.com" not in hote and "fb.com" not in hote:
        # ⭐ LE WEB OUVERT. Le site d'un hôtel publie ses tarifs de chambre là où
        #   sa page Facebook ne les met jamais. On refuse en revanche les
        #   agrégateurs de réservation et les réseaux : leurs conditions
        #   interdisent la réutilisation, et le dépôt a déjà tranché (règle
        #   « OSM Overpass + Nominatim, jamais Google Maps »).
        if toile.HOTES_REFUSES.search(hote):
            raise ValueError(
                "Ce site n'est pas collectable : agrégateurs de réservation et "
                "moteurs de recherche interdisent la réutilisation de leurs "
                "données. Donnez l'adresse du site de l'établissement lui-même."
            )
        if "." not in hote:
            raise ValueError("Adresse incomplète.")
        return _propre_web(url), "site"

    parametres = dict(parse_qsl(decoupe.query))
    segments = [s for s in decoupe.path.split("/") if s]

    if not segments:
        # facebook.com tout court, ou facebook.com/?sk=h_chr : le fil d'actualité.
        return URL_FIL, "fil"

    premier = segments[0].lower()

    if premier == "search":
        if not parametres.get("q"):
            raise ValueError("Recherche sans mots-clés — ajoutez ce que vous cherchez.")
        return _url_recherche(parametres["q"]), "recherche"

    if premier == "groups":
        if len(segments) < 2:
            raise ValueError("Adresse de groupe incomplète (il manque son identifiant).")
        # Une adresse de publication dans un groupe est ramenée au groupe.
        return f"https://www.facebook.com/groups/{segments[1]}", "groupe"

    if premier == "share":
        raise ValueError(
            "Lien de partage abrégé : ouvrez-le dans Facebook, puis copiez "
            "l'adresse affichée dans la barre du navigateur."
        )

    if premier == "profile.php":
        identifiant = parametres.get("id")
        if not identifiant:
            raise ValueError("Adresse de profil sans identifiant.")
        return f"https://www.facebook.com/profile.php?id={identifiant}", "page"

    if premier in CHEMINS_REFUSES:
        raise ValueError(
            "Cette adresse désigne une publication, pas une source. Collez "
            "l'adresse du groupe ou de la page elle-même."
        )

    if premier in ("pages", "p") and len(segments) >= 2:
        return f"https://www.facebook.com/{'/'.join(segments[:3])}", "page"
    return f"https://www.facebook.com/{segments[0]}", "page"


# ── Session Facebook ────────────────────────────────────────────────────────
def session_enregistree() -> bool:
    """Y a-t-il une session Facebook en place ?

    On lit directement le fichier de cookies du profil Chromium : ouvrir un
    navigateur pour le savoir coûterait trop cher, l'interface pose la question
    toutes les deux secondes. Le cookie `c_user` n'existe que si quelqu'un s'est
    réellement connecté — la présence du dossier, elle, ne prouve rien.
    """
    fichier = PROFIL_NAVIGATEUR / "Default" / "Network" / "Cookies"
    if not fichier.exists():
        base.ecrire_etat(CLE_SESSION, "0")
        return False

    # On travaille sur une COPIE : le fichier est verrouillé tant que le
    # navigateur tourne, et l'ouverture en mode URI casse dès que le chemin
    # contient une espace.
    with tempfile.TemporaryDirectory() as dossier:
        copie = Path(dossier) / "cookies.db"
        try:
            shutil.copy2(fichier, copie)
            cx = sqlite3.connect(copie, timeout=2)
            try:
                nombre = cx.execute(
                    "SELECT COUNT(*) FROM cookies "
                    "WHERE host_key LIKE '%facebook.com' AND name = 'c_user'"
                ).fetchone()[0]
            finally:
                cx.close()
            base.ecrire_etat(CLE_SESSION, "1" if nombre else "0")
            return nombre > 0
        except (OSError, sqlite3.Error):
            # Fichier illisible parce qu'un navigateur l'occupe (une collecte
            # est en cours) : on se rabat sur le dernier état vérifié plutôt
            # que d'inventer une réponse dans un sens ou dans l'autre.
            return base.lire_etat(CLE_SESSION) == "1"


def oublier_session() -> None:
    """Efface le profil Chromium — sert à changer de compte Facebook."""
    if PROFIL_NAVIGATEUR.exists():
        shutil.rmtree(PROFIL_NAVIGATEUR, ignore_errors=True)
    base.ecrire_etat(CLE_SESSION, "0")
    base.logguer("Session Facebook effacée.", "avert")


# ── Photos ──────────────────────────────────────────────────────────────────
def _telecharger_photos(images: list[dict], dossier: Path, tid: str, cfg: dict) -> int:
    """Récupère les photos depuis le CDN, en parallèle et hors navigateur.

    Les adresses `scontent` sont signées et publiques : un simple GET suffit,
    pas besoin de la session. Elles ne passent pas par facebook.com — les
    charger de front, c'est exactement ce que fait un navigateur qui affiche le
    fil, pas une rafale supplémentaire sur le site.

    ⚠ LA TAILLE RÉELLE EST RELUE SUR LE FICHIER, pas prise du DOM. Le fil rend
      la taille AFFICHÉE ; `posts.media` a besoin de la vraie, sans quoi le fil
      de Diako saute au chargement (le ratio sert à réserver la place).
    """
    maxi = int(cfg.get("photos_max_par_trouvaille", 12))
    lot = list(enumerate(images[:maxi], start=1))
    if not lot:
        return 0

    session = requests.Session()
    session.headers["User-Agent"] = NAVIGATEUR_UA

    def une(rang_img):
        rang, img = rang_img
        nom = f"photo{rang:02d}.jpg"
        try:
            r = session.get(img["url"], timeout=30)
            if not r.ok or "image" not in r.headers.get("Content-Type", ""):
                return None
            if len(r.content) < 12_000:   # une vignette, pas une photo utilisable
                return None
            (dossier / nom).write_bytes(r.content)
        except requests.RequestException:
            return None

        largeur, hauteur = img.get("largeur", 0), img.get("hauteur", 0)
        try:
            from PIL import Image
            with Image.open(dossier / nom) as ouverte:
                largeur, hauteur = ouverte.size
        except Exception:
            pass
        return rang, nom, largeur, hauteur, img["url"]

    # Les téléchargements se répartissent entre les travailleurs : à 6 fils,
    # 4 photos chacun feraient 24 connexions de front vers le CDN. On vise une
    # douzaine au total, ce que fait déjà un navigateur qui affiche un fil.
    de_front = max(2, 12 // max(1, int(cfg.get("travailleurs", 3))))

    gardees = 0
    with ThreadPoolExecutor(max_workers=de_front) as pool:
        for resultat in pool.map(une, lot):
            if not resultat:
                continue
            rang, nom, largeur, hauteur, url = resultat
            base.ajouter_photo(tid, nom, url, largeur, hauteur, ordre=rang)
            gardees += 1

    if gardees:
        _choisir_couverture(tid, cfg)
    return gardees


def _choisir_couverture(tid: str, cfg: dict) -> None:
    """La couverture est la plus grande photo PAYSAGE disponible.

    ⚠ LE SEUIL PORTE SUR LE CÔTÉ LONG, PAS SUR LE CÔTÉ COURT. Testé sur
      `min(w, h)`, il rejetait des panoramas parfaitement nets (1920 × 730)
      parce que leur hauteur passait sous la barre — onze fiches sur
      quarante-sept s'étaient retrouvées « sans aucune photo » alors qu'elles
      en avaient neuf (leçon de scripts/photos_archives.py).

    ⚠ Une couverture sous 1 000 px de côté long fait AGRANDIR la variante 960
      par le serveur, donc flouter. Elle reste utilisable en galerie, mais on
      ne la met pas en tête si une autre fait l'affaire.
    """
    photos = base.photos_a_publier(tid)
    if not photos:
        return
    mini = int(cfg.get("cote_photo_min", 1000))

    def rang(p):
        largeur, hauteur = p.get("largeur") or 0, p.get("hauteur") or 0
        cote_long = max(largeur, hauteur)
        ratio = largeur / hauteur if hauteur else 0
        return (
            1 if cote_long >= mini else 0,
            1 if 1.2 <= ratio <= 2.6 else 0,
            largeur * hauteur,
        )

    base.definir_couverture(tid, max(photos, key=rang)["id"])


# ── Atelier ─────────────────────────────────────────────────────────────────
class Atelier:
    """File de travail hors navigateur : photos, relecture, rapprochement, score.

    Le navigateur ne doit jamais attendre après ces tâches — elles ne touchent
    pas Facebook (le CDN mis à part) et la lecture d'une carte par le modèle
    prend une minute.
    """

    def __init__(self, travail, nb_fils: int = 3) -> None:
        self.travail = travail
        self.file: queue.Queue = queue.Queue()
        self.fils: list[threading.Thread] = []
        self.arret = threading.Event()
        self.en_attente = 0
        self._verrou = threading.Lock()
        for _ in range(max(1, nb_fils)):
            fil = threading.Thread(target=self._boucle, daemon=True)
            fil.start()
            self.fils.append(fil)

    def soumettre(self, tache: dict) -> None:
        with self._verrou:
            self.en_attente += 1
        self.file.put(tache)

    def _boucle(self) -> None:
        while not self.arret.is_set():
            try:
                tache = self.file.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                self.travail(tache)
            except Exception as e:
                base.logguer(f"Traitement d'une trouvaille abandonné : {e}", "erreur")
            finally:
                with self._verrou:
                    self.en_attente -= 1
                self.file.task_done()

    def attendre(self) -> None:
        self.file.join()

    def fermer(self) -> None:
        self.arret.set()


# ── Collecteur ──────────────────────────────────────────────────────────────
class Collecteur:
    """Pilote le navigateur. Une seule instance à la fois (verrou de classe)."""

    _en_cours = threading.Lock()

    def __init__(self) -> None:
        self.config = charger()
        self.stop = threading.Event()
        self.etat = {"actif": False, "source": None, "trouvees": 0, "examines": 0}
        self._noms_de_lieux: list[str] = []

    # -- Session ------------------------------------------------------------
    def _contexte(self, pw, visible: bool):
        PROFIL_NAVIGATEUR.mkdir(parents=True, exist_ok=True)
        return pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFIL_NAVIGATEUR),
            headless=not visible,
            viewport={"width": 1280, "height": 900},
            locale="fr-FR",
            timezone_id="Indian/Antananarivo",
            args=["--disable-blink-features=AutomationControlled"],
        )

    def ouvrir_connexion(self) -> bool:
        """Ouvre Facebook en grand pour se connecter une bonne fois.

        La fenêtre se referme d'elle-même dès que la connexion est détectée :
        pas d'étape « pensez à fermer » à retenir. Au bout de cinq minutes sans
        connexion, on abandonne pour ne pas laisser un navigateur ouvert.
        """
        connecte = False
        with sync_playwright() as pw:
            ctx = self._contexte(pw, visible=True)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            try:
                page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
            except Exception:
                pass
            base.logguer(
                "Fenêtre Facebook ouverte — connectez-vous. "
                "Elle se fermera toute seule une fois la session enregistrée.",
                "info",
            )
            limite = time.time() + 300
            while time.time() < limite:
                if self.stop.is_set():
                    break
                try:
                    if self._verifier_session(ctx):
                        connecte = True
                        break
                    if not ctx.pages:
                        break
                    page.wait_for_timeout(1000)
                except Exception:
                    break
            try:
                ctx.close()
            except Exception:
                pass

        base.ecrire_etat(CLE_SESSION, "1" if connecte else "0")
        if connecte:
            base.logguer("Compte Facebook connecté — le bot peut collecter.", "succes")
        else:
            base.logguer(
                "Connexion non aboutie : la session n'a pas été enregistrée.", "erreur"
            )
        return connecte

    def _verifier_session(self, ctx) -> bool:
        return "c_user" in {c["name"] for c in ctx.cookies("https://www.facebook.com")}

    def session_active(self) -> bool:
        return session_enregistree()

    # -- Collecte -----------------------------------------------------------
    def collecter(self, sources: list[dict] | None = None,
                  reglages: dict | None = None) -> dict:
        """`reglages` surcharge la config le temps d'un passage.

        Sert au rattrapage du soir : dérouler plus loin dans les fils sans
        modifier durablement les réglages.
        """
        if not Collecteur._en_cours.acquire(blocking=False):
            return {"erreur": "Une collecte est déjà en cours."}
        try:
            return self._collecter(sources, reglages)
        finally:
            self.etat["actif"] = False
            Collecteur._en_cours.release()

    def _collecter(self, sources: list[dict] | None,
                   reglages: dict | None = None) -> dict:
        self.config = charger()
        if reglages:
            self.config.update(reglages)
        cfg = self.config
        sources = sources or base.sources(actives_seulement=True, pour_collecte=True)
        if not sources:
            base.logguer(
                "Aucune source active — ajoutez un groupe, une page, le fil "
                "d'actualité ou une recherche dans l'onglet Sources.",
                "avert",
            )
            return {"trouvees": 0, "examines": 0}

        # ⚠ LE RÉFÉRENTIEL D'ABORD. Sans lui, aucun rapprochement n'est possible
        #   et le bot créerait des doublons de fiches déjà en base.
        try:
            diako.rafraichir_referentiel(heures=int(cfg.get("referentiel_heures", 12)))
        except Exception as e:
            base.logguer(
                f"Référentiel Diako injoignable ({e}). La collecte continue, mais "
                "aucun rapprochement ne sera proposé — ne publiez rien avant de "
                "l'avoir rechargé.",
                "erreur",
            )
        self._noms_de_lieux = diako.lieux_connus()

        self.stop.clear()
        self.etat.update({"actif": True, "trouvees": 0, "examines": 0})
        self.atelier = Atelier(self._finir, int(cfg.get("travailleurs", 3)))
        par_genre = {}
        for s in sources:
            par_genre[s.get("genre", "groupe")] = par_genre.get(s.get("genre", "groupe"), 0) + 1
        base.logguer(
            "Collecte lancée sur " + ", ".join(
                f"{n} {g}{'s' if n > 1 and g != 'fil' else ''}"
                for g, n in sorted(par_genre.items())
            ) + ".",
            "info",
        )

        # ⚠ LES SITES WEB N'ONT PAS BESOIN DU NAVIGATEUR NI DE FACEBOOK. Les
        #   traiter d'abord, hors Chromium, permet de collecter des tarifs même
        #   quand la session Facebook a expiré — c'est-à-dire le jour où le bot
        #   serait autrement à l'arrêt complet.
        web = [s for s in sources if (s.get("genre") or "") == "site"]
        facebook = [s for s in sources if (s.get("genre") or "") != "site"]

        web = self._ordonner_sites(web, cfg)
        self._sites_js = []
        for rang, source in enumerate(web):
            if self.stop.is_set():
                break
            self.etat["source"] = f"{source['nom']} ({rang + 1}/{len(web)}, site web)"
            try:
                trouvees = self._parcourir_site(source)
            except Exception as e:
                base.logguer(f"« {source['nom']} » : {e}", "erreur")
                trouvees = 0
            base.modifier_source(
                source["id"], derniere_collecte=base.maintenant(),
                nb_trouvees=(source.get("nb_trouvees") or 0) + trouvees,
            )

        if self._sites_js and not self.stop.is_set():
            self._relire_avec_navigateur(cfg)

        # ⚠ ON NE LANCE PAS CHROMIUM SUR UNE MACHINE PLEINE. Mieux vaut sauter
        #   la partie Facebook en le disant que se faire tuer au milieu — et
        #   emporter le bot avec. Les sources « site », elles, ont déjà tourné :
        #   la collecte n'est donc pas perdue, seulement amputée.
        libre = memoire_libre_mo()
        seuil = int(cfg.get("memoire_mini_mo", 900))
        if facebook and libre is not None and libre < seuil:
            base.logguer(
                f"Partie Facebook sautée : il ne reste que {libre} Mo de mémoire "
                f"disponible (il en faut {seuil} pour Chromium). Fermez des "
                "applications, ou agrandissez le fichier d'échange — voir "
                "LISEZ-MOI, § « Quand la machine est pleine ».",
                "erreur",
            )
            facebook = []

        if facebook and not self.stop.is_set():
            with sync_playwright() as pw:
                ctx = self._contexte(pw, visible=cfg["navigateur_visible"])
                if not self._verifier_session(ctx):
                    ctx.close()
                    base.logguer(
                        "Pas de session Facebook : les "
                        f"{len(facebook)} source(s) Facebook sont sautées. "
                        "Cliquez « Connecter mon compte Facebook ».",
                        "erreur" if not web else "avert",
                    )
                    facebook = []
                else:
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    for rang, source in enumerate(facebook):
                        if self.stop.is_set():
                            base.logguer("Collecte arrêtée à la demande.", "avert")
                            break
                        self.etat["source"] = f"{source['nom']} ({rang + 1}/{len(facebook)})"
                        try:
                            trouvees = self._parcourir(ctx, page, source)
                        except Exception as e:  # une source qui casse ne tue pas la tournée
                            base.logguer(f"« {source['nom']} » : {e}", "erreur")
                            trouvees = 0
                            # « Page crashed » : l'onglet est mort (souvent faute
                            # de mémoire). Sans nouvel onglet, TOUTES les sources
                            # suivantes échoueraient en cascade.
                            if "crash" in str(e).lower() or page.is_closed():
                                try:
                                    if not page.is_closed():
                                        page.close()
                                    page = ctx.new_page()
                                    base.logguer(
                                        "Onglet relancé après un plantage — la tournée "
                                        "continue. Si ça se répète, fermez des "
                                        "applications : Chromium manque de mémoire.",
                                        "avert",
                                    )
                                except Exception:
                                    base.logguer(
                                        "Navigateur perdu, collecte interrompue.", "erreur"
                                    )
                                    break
                        base.modifier_source(
                            source["id"],
                            derniere_collecte=base.maintenant(),
                            nb_trouvees=(source.get("nb_trouvees") or 0) + trouvees,
                        )
                        if rang < len(facebook) - 1 and not self.stop.is_set():
                            _pause(cfg["pause_entre_sources"])
                    ctx.close()

        restant = self.atelier.en_attente
        if restant:
            base.logguer(
                f"Navigation terminée. Reste {restant} publication(s) à lire — "
                "photos, relecture et rapprochement continuent en arrière-plan.",
                "info",
            )
            self.etat["source"] = "traitement en cours"
            self.atelier.attendre()
        self.atelier.fermer()

        self.etat["source"] = None
        base.logguer(
            f"Collecte terminée : {self.etat['trouvees']} trouvaille(s) retenue(s) "
            f"sur {self.etat['examines']} publication(s) examinée(s).",
            "succes",
        )
        return dict(self.etat)

    def _adresse_de_visite(self, source: dict) -> str:
        genre = source.get("genre") or "groupe"
        url = source["url"].rstrip("/")
        if genre == "groupe":
            # Tri chronologique : sans ça Facebook sert « les plus pertinents »,
            # c'est-à-dire souvent des publications vues il y a trois semaines.
            return url if "sorting_setting" in url else url + "?sorting_setting=CHRONOLOGICAL"
        if genre == "page":
            return _url_fil_de_page(url)
        return url  # fil et recherche portent déjà leurs paramètres

    def _parcourir(self, ctx, page, source: dict) -> int:
        cfg = self.config
        genre = source.get("genre") or "groupe"
        etiquettes = {"groupe": "Groupe", "page": "Page", "fil": "Fil d'actualité",
                      "recherche": "Recherche"}

        base.logguer(f"{etiquettes.get(genre, genre)} « {source['nom']} » — ouverture.", "info")
        page.goto(self._adresse_de_visite(source), wait_until="domcontentloaded",
                  timeout=60_000)
        page.wait_for_timeout(4000)

        vus: set[str] = set()
        retenues = 0
        # ⭐ LE FIL SE DÉROULE PLUS LOIN QUE LE RESTE, et c'est justifié : un
        #   groupe finit par se répéter au bout d'une vingtaine de défilements,
        #   alors que le fil est trié par l'algorithme de Facebook et continue
        #   de servir des publications neuves. C'est la source la moins chère en
        #   pages chargées par trouvaille — et celle qui ramène ce qu'on
        #   n'aurait pas pensé à chercher.
        if genre == "fil":
            plafond = int(cfg.get("posts_max_fil", 80))
            defilements = int(cfg.get("scrolls_max_fil", 45))
        else:
            plafond = int(cfg["posts_max_par_source"])
            defilements = int(cfg["scrolls_max_par_source"])
        steriles = 0  # défilements consécutifs sans rien de neuf

        for _ in range(defilements):
            if self.stop.is_set():
                break

            # Déplier AVANT d'extraire : le fil coupe à « Voir plus » et le
            # numéro comme les prix sont presque toujours dans la partie coupée.
            try:
                page.evaluate(JS_DEPLIER)
                page.wait_for_timeout(900)
            except Exception:
                pass

            try:
                lot = page.evaluate(JS_EXTRAIRE_FIL, int(cfg["largeur_photo_min"]))
            except Exception:
                lot = []

            neufs = 0
            for publication in lot:
                cle = empreinte(publication["texte"], publication["permalien"])
                if cle in vus:
                    continue
                vus.add(cle)
                if not extraction.parle_de_tourisme(
                    publication["texte"], publication["nb_images"]
                ):
                    continue
                age = _age_en_jours(publication.get("heure", ""))
                if age is not None and age > int(cfg["jours_max"]):
                    continue
                if base.existe(cle):
                    continue

                neufs += 1
                self.etat["examines"] += 1
                if self._inscrire(page, publication, source, cle):
                    retenues += 1
                    self.etat["trouvees"] += 1

            # Défilement adaptatif : inutile de dérouler 25 fois une source qui
            # ne donne plus rien, inutile de s'arrêter à 25 si elle donne encore.
            steriles = steriles + 1 if neufs == 0 else 0
            # Le fil mérite deux tours stériles de plus : il alterne des blocs
            # sans intérêt (souvenirs, suggestions, publicités) et des blocs
            # utiles. S'arrêter au premier creux le couperait au mauvais endroit.
            if steriles >= (4 if genre == "fil" else 2) or retenues >= plafond:
                break

            page.mouse.wheel(0, random.randint(700, 1400))
            _pause(cfg["pause_entre_scrolls"])

        base.logguer(f"« {source['nom']} » : {retenues} publication(s) mise(s) en file.", "info")
        return retenues

    # -- Le web ouvert : le site de l'établissement lui-même -----------------
    def _ordonner_sites(self, web: list[dict], cfg: dict) -> list[dict]:
        """Quels sites visiter en premier, et combien.

        ⭐ ON COMMENCE PAR LES FICHES LES PLUS VIDES. 167 sites à lire feraient
           plusieurs heures ; en visiter 25 au hasard ne comblerait presque
           rien. Un site rattaché à une fiche sans photo, sans numéro et sans
           carte vaut beaucoup plus qu'un site rattaché à une fiche déjà
           complète — c'est exactement le classement que le poste `apport` du
           score applique, appliqué ici à l'ordre de visite.

        ⚠ Les sites jamais visités passent devant : sans ça, les vingt-cinq
          premiers monopoliseraient toutes les collectes et les cent quarante
          autres ne seraient jamais lus.
        """
        if not web:
            return web
        fiches = {f["id"]: f for f in base.referentiel("ref_pages")}

        def manque(source: dict) -> int:
            fiche = fiches.get(source.get("page_id") or "")
            if not fiche:
                # Site non rattaché : il créera peut-être une fiche neuve.
                # Utile, mais moins que combler un trou connu.
                return 2
            points = 0
            if not fiche.get("cover_url"):
                points += 4
            if not fiche.get("telephone"):
                points += 3
            if not fiche.get("nb_carte"):
                points += 2
            if not fiche.get("nb_chambre"):
                points += 2
            return points

        classes = sorted(
            web,
            key=lambda s: (
                s.get("derniere_collecte") is not None,   # jamais vus d'abord
                -manque(s),                               # puis les plus vides
                s.get("derniere_collecte") or "",         # puis les plus anciens
            ),
        )
        plafond = int(cfg.get("sites_max_par_collecte", 25))
        retenus = classes[:plafond] if plafond > 0 else classes
        if len(classes) > len(retenus):
            base.logguer(
                f"{len(retenus)} site(s) web sur {len(classes)} ce tour — les fiches "
                "les plus vides d'abord. Les autres passeront à la collecte "
                "suivante.", "info",
            )
        return retenus

    def _relire_avec_navigateur(self, cfg: dict) -> None:
        """Deuxième passage sur les sites qui ne rendent rien sans JavaScript.

        ⚠ NAVIGATEUR NEUF, PAS CELUI DE FACEBOOK. Le profil `data/profil-fb/`
          porte la session Facebook : s'en servir pour visiter des sites tiers
          leur enverrait ces cookies. On ouvre un contexte vierge, jeté à la
          fin.

        ⚠ ET UN SEUL PASSAGE. Un site qui ne rend toujours rien avec le
          navigateur est un site qu'on ne sait pas lire ; le réessayer à chaque
          collecte coûterait une minute pour rien. Il reste dans les sources,
          simplement il ne donne rien.
        """
        a_relire, self._sites_js = self._sites_js, []
        base.logguer(
            f"{len(a_relire)} site(s) sans texte lisible sans JavaScript — "
            "relecture avec le navigateur.", "info",
        )
        with sync_playwright() as pw:
            navigateur = pw.chromium.launch(headless=not cfg["navigateur_visible"])
            contexte = navigateur.new_context(
                user_agent=NAVIGATEUR_UA, locale="fr-FR",
                viewport={"width": 1280, "height": 900},
            )
            page = contexte.new_page()

            def rendu(url: str) -> str:
                page.goto(url, wait_until="networkidle", timeout=45_000)
                page.wait_for_timeout(1200)
                return page.content()

            for source in a_relire:
                if self.stop.is_set():
                    break
                self.etat["source"] = f"{source['nom']} (rendu JavaScript)"
                try:
                    trouvees = self._parcourir_site(source, rendu=rendu)
                except Exception as e:
                    base.logguer(f"« {source['nom']} » (JavaScript) : {e}", "avert")
                    trouvees = 0
                base.modifier_source(
                    source["id"], derniere_collecte=base.maintenant(),
                    nb_trouvees=(source.get("nb_trouvees") or 0) + trouvees,
                )
            try:
                contexte.close()
                navigateur.close()
            except Exception:
                pass

    def _parcourir_site(self, source: dict, rendu=None) -> int:
        """Lit le site d'un établissement et en fait une trouvaille.

        ⚠ L'EMPREINTE PORTE SUR LE CONTENU, PAS SUR L'ADRESSE. Un site se
          relit régulièrement — c'est même tout l'intérêt, les tarifs changent.
          Mais relire un site inchangé ne doit pas produire une trouvaille de
          plus à trier : si le texte est identique au dernier passage, il n'y a
          rien de neuf, et on le dit.
        """
        cfg = self.config
        base.logguer(f"Site « {source['nom']} » — lecture de {source['url']}.", "info")
        lecture = toile.explorer(
            source["url"], pages_max=int(cfg.get("pages_max_par_site", 8)), rendu=rendu
        )

        if lecture.get("js_probable") and rendu is None:
            # Le HTML arrive, mais il est vide de texte : c'est du JavaScript.
            # On le met de côté pour un passage au navigateur, à la fin.
            self._sites_js.append(source)
            base.logguer(
                f"« {source['nom']} » : page construite en JavaScript — mise de côté "
                "pour une relecture au navigateur.", "info",
            )
            return 0

        if lecture.get("refuse") or not lecture["texte"]:
            base.logguer(
                f"« {source['nom']} » : {lecture.get('refuse') or 'aucun texte lisible'}.",
                "avert",
            )
            return 0

        cle = "site:" + hashlib.sha1(
            (source["url"] + re.sub(r"\s+", " ", lecture["texte"])).encode()
        ).hexdigest()
        if base.existe(cle):
            base.logguer(
                f"« {source['nom']} » : inchangé depuis le dernier passage "
                f"({len(lecture['pages'])} page(s) relues).", "info",
            )
            return 0

        dossier = DOSSIER_TROUVAILLES / date.today().isoformat() / hashlib.sha1(
            cle.encode()
        ).hexdigest()[:8]
        dossier.mkdir(parents=True, exist_ok=True)
        (dossier / "site.txt").write_text(lecture["texte"], encoding="utf-8")
        (dossier / "pages-visitees.json").write_text(
            json.dumps({"pages": lecture["pages"], "pdf": lecture["pdf"]},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        tid = base.creer({
            "empreinte": cle,
            "permalien": lecture["pages"][0] if lecture["pages"] else source["url"],
            "source_id": source["id"],
            "source_nom": source["nom"],
            "source_genre": "site",
            "auteur": lecture.get("titre") or source["nom"],
            "date_post": date.today().isoformat(),
            "texte": lecture["texte"][:60_000],
            "dossier": str(dossier.relative_to(DOSSIER_TROUVAILLES.parent)),
            "statut": "en_traitement",
            "genre": "etablissement",
            "site_web": source["url"],
            "page_id": source.get("page_id"),
            "page_nom": source.get("page_nom"),
            "page_score": 1.0 if source.get("page_id") else None,
            "manques": [],
        })
        if not tid:
            return 0

        self.etat["examines"] += 1
        self.etat["trouvees"] += 1
        self.atelier.soumettre({
            "tid": tid, "dossier": dossier, "lecture": lecture,
            "source": source, "config": dict(self.config), "web": True,
        })
        return 1

    def _finir_site(self, travail: dict) -> None:
        """Lecture, tarifs, photos et score d'un site. Tourne dans l'atelier."""
        cfg = travail["config"]
        lecture, source = travail["lecture"], travail["source"]
        tid, dossier = travail["tid"], travail["dossier"]
        texte = lecture["texte"]

        champs = extraction.analyser_site(
            texte, lecture.get("titre", ""), source.get("page_nom") or "",
            self._noms_de_lieux,
        )
        if cfg.get("llm_actif"):
            try:
                champs = analyse_llm.fusionner_site(
                    champs, analyse_llm.relire_site(texte, cfg)
                )
            except analyse_llm.LLMIndisponible as e:
                base.logguer(f"Lecture du site par l'IA indisponible ({e}).", "avert")

        # Les photos du site : c'est la réponse au « 0 photo sur 3 356 fiches ».
        images = [
            {"url": u, "largeur": 0, "hauteur": 0}
            for u in (lecture.get("images") or [])
            if toile.robots_autorise(u)
        ]
        gardees = _telecharger_photos(images, dossier, tid, cfg)

        # La source connaît déjà sa fiche quand elle vient de l'annuaire ; sinon
        # on rapproche, exactement comme pour Facebook.
        if source.get("page_id"):
            fiches = [f for f in base.referentiel("ref_pages")
                      if f["id"] == source["page_id"]]
            etat = fiches[0] if fiches else {}
            rapprochement = {
                "page_id": source["page_id"], "page_nom": source.get("page_nom"),
                "page_score": 1.0, "page_candidats": [],
                "lieu_id": etat.get("lieu_id"), "lieu_nom": etat.get("lieu_nom"),
                "lieu_score": 1.0 if etat.get("lieu_id") else None,
                "_etat_fiche": {
                    "a_photo": bool(etat.get("cover_url")),
                    "a_tel": bool(etat.get("telephone")),
                    "nb_carte": etat.get("nb_carte") or 0,
                    "nb_chambre": etat.get("nb_chambre") or 0,
                },
            }
            if not rapprochement["lieu_id"]:
                lieu = diako.rapprocher_lieu(champs.get("lieu_texte") or "")
                if lieu:
                    rapprochement.update({"lieu_id": lieu["id"], "lieu_nom": lieu["nom"],
                                          "lieu_score": lieu["score"]})
        else:
            rapprochement = self._rapprocher(champs, cfg)

        manques = self._manques(champs, rapprochement, gardees)
        chambres = champs.get("lignes_chambre") or []
        plats = champs.get("lignes_carte") or []
        if not chambres and not plats and not champs.get("prix_ar"):
            manques.append("aucun tarif trouvé")
        bloquants = [m for m in manques if m in ("lieu", "établissement")]
        statut = "incomplete" if bloquants else "a_trier"

        base.modifier(tid, {
            "statut": statut,
            "manques": manques,
            "genre": "etablissement",
            "categories": champs.get("categories") or [],
            "nom_etab": champs.get("nom_etab"),
            "resume": champs.get("resume"),
            "adresse": champs.get("adresse"),
            "repere": champs.get("repere"),
            "telephone": champs.get("telephone"),
            "whatsapp": champs.get("whatsapp"),
            "email": champs.get("email"),
            "site_web": source["url"],
            "page_facebook": champs.get("page_facebook"),
            "horaires": champs.get("horaires"),
            "equipements": champs.get("equipements") or [],
            "prix_ar": champs.get("prix_ar"),
            "prix_unite": champs.get("prix_unite"),
            "prix_vu_le": date.today().isoformat(),
            "lieu_texte": champs.get("lieu_texte"),
            "lu_par_llm": int(bool(champs.get("lu_par_llm"))),
            "llm_confiance": champs.get("llm_confiance"),
            "llm_doute": champs.get("llm_doute"),
            "note": ("PDF à ouvrir à la main : " + ", ".join(lecture["pdf"]))
            if lecture.get("pdf") else None,
            **rapprochement,
        })

        for rang, chambre in enumerate(chambres, start=1):
            base.ajouter_ligne_chambre(tid, chambre, ordre=rang)
        for rang, plat in enumerate(plats, start=1):
            reference = diako.rapprocher_plat(plat["nom"])
            base.ajouter_ligne_carte(tid, dict(
                plat, plat_id=reference["id"] if reference else None,
                plat_nom=reference["nom"] if reference else None), ordre=rang)

        t = base.trouvaille(tid)
        if not t:
            return
        t["_etat_fiche"] = rapprochement.get("_etat_fiche", {})
        note = notation.calculer(t)
        base.modifier(tid, {
            "titre": redaction.titre(t),
            "resume": t.get("resume") or redaction.resume_fiche(t),
            "presentation": redaction.presentation(t),
            "score": note["score"], "niveau": note["niveau"],
        })
        (dossier / "trouvaille.json").write_text(
            json.dumps(
                {k: v for k, v in (base.trouvaille(tid) or {}).items() if k != "texte"},
                ensure_ascii=False, indent=2, default=str,
            ),
            encoding="utf-8",
        )
        base.logguer(
            f"Site lu — score {note['score']}/100 : {champs.get('nom_etab') or source['nom']} — "
            f"{len(chambres)} chambre(s), {len(plats)} plat(s), {gardees} photo(s)"
            + (f", {len(lecture['pdf'])} PDF signalé(s)" if lecture.get("pdf") else "")
            + ".",
            "succes",
        )

    # -- Passe 1 : inscription, dans le fil du navigateur -------------------
    def _inscrire(self, page, publication: dict, source: dict, cle: str) -> bool:
        """Enregistre une publication repérée et confie la suite à l'atelier.

        Tout ce qui touche Facebook se fait ICI : capture d'écran, et rien
        d'autre. Le téléchargement des photos (CDN) et la relecture par le
        modèle n'ont aucune raison de bloquer le défilement.
        """
        dossier = DOSSIER_TROUVAILLES / date.today().isoformat() / hashlib.sha1(
            cle.encode()
        ).hexdigest()[:8]
        dossier.mkdir(parents=True, exist_ok=True)

        if publication.get("posinset"):
            try:
                page.locator(
                    f'div[aria-posinset="{publication["posinset"]}"]'
                ).first.screenshot(path=str(dossier / "capture.png"), timeout=5000)
            except Exception:
                pass

        (dossier / "publication.txt").write_text(publication["texte"], encoding="utf-8")

        tid = base.creer({
            "empreinte": cle,
            "permalien": publication["permalien"],
            "source_id": source["id"],
            "source_nom": source["nom"],
            "source_genre": source.get("genre") or "groupe",
            "auteur": (publication.get("auteur") or "").strip(),
            "publie_le": publication.get("heure", ""),
            "date_post": date_de_publication(publication.get("heure", "")),
            "texte": publication["texte"],
            "dossier": str(dossier.relative_to(DOSSIER_TROUVAILLES.parent)),
            "statut": "en_traitement",
            "manques": [],
        })
        if not tid:
            return False

        self.atelier.soumettre({
            "tid": tid, "dossier": dossier, "publication": publication,
            "source": source, "config": dict(self.config),
        })
        return True

    # -- Passe 2 : atelier, hors du navigateur ------------------------------
    def _finir(self, travail: dict) -> None:
        """Photos + lecture + rapprochement + score. Tourne dans un fil de l'atelier."""
        if travail.get("web"):
            return self._finir_site(travail)
        cfg = travail["config"]
        publication, source = travail["publication"], travail["source"]
        tid, dossier = travail["tid"], travail["dossier"]

        texte = publication["texte"]
        auteur = (publication.get("auteur") or "").strip()
        # Sur une page, l'auteur EST l'établissement : c'est le nom le plus sûr
        # dont on dispose. Dans un groupe, l'auteur est un membre, pas un lieu.
        auteur_page = auteur if (source.get("genre") == "page") else None

        champs = extraction.analyser(
            texte, publication["nb_images"], auteur_page, self._noms_de_lieux
        )

        if cfg.get("llm_actif"):
            try:
                champs = analyse_llm.fusionner(champs, analyse_llm.relire(texte, cfg))
            except analyse_llm.LLMIndisponible as e:
                base.logguer(f"Relecture IA indisponible ({e}) — lecture simple.", "avert")

        # -- Photos (le CDN, hors navigateur, en parallèle)
        gardees = _telecharger_photos(publication.get("images") or [], dossier, tid, cfg)

        # -- Lecture d'une carte photographiée
        # C'est ici que se joue le trou le plus large de Diako : 4 lignes de
        # carte pour 1 862 restaurants, parce qu'une carte se publie en photo.
        if cfg.get("llm_actif") and cfg.get("llm_vision", True) and gardees:
            champs = self._lire_la_carte(tid, dossier, texte, champs, cfg)

        if champs.get("genre") == "rien":
            base.supprimer(tid)
            shutil.rmtree(dossier, ignore_errors=True)
            return
        if champs.get("genre") not in (cfg.get("genres_actifs") or []):
            base.supprimer(tid)
            shutil.rmtree(dossier, ignore_errors=True)
            return

        # -- Rapprochement avec le référentiel Diako
        rapprochement = self._rapprocher(champs, cfg)

        # ⭐ ET LE SITE OU LE PARC DONT PARLE LE TEXTE. 2 521 fiches de sites,
        #   226 illustrées : un récit sur les Tsingy doit pouvoir donner sa
        #   photo à la fiche du parc, pas seulement passer sur le fil.
        site = diako.rapprocher_site(texte, rapprochement.get("lieu_id"))
        if site:
            rapprochement["site_id"] = site["id"]
            rapprochement["site_nom"] = site["nom"]

        # -- Ce qui manque pour publier
        manques = self._manques(champs, rapprochement, gardees)
        bloquants = [m for m in manques if m in ("lieu", "établissement", "date", "photo")]
        statut = "incomplete" if bloquants else "a_trier"
        if bloquants and not cfg.get("garder_les_incompletes", True):
            base.supprimer(tid)
            shutil.rmtree(dossier, ignore_errors=True)
            return

        date_post = base.trouvaille(tid).get("date_post")
        base.modifier(tid, {
            "statut": statut,
            "manques": manques,
            "genre": champs["genre"],
            "categories": champs.get("categories") or [],
            "nom_etab": champs.get("nom_etab"),
            "resume": champs.get("resume"),
            "adresse": champs.get("adresse"),
            "repere": champs.get("repere"),
            "telephone": champs.get("telephone"),
            "whatsapp": champs.get("whatsapp"),
            "email": champs.get("email"),
            "site_web": champs.get("site_web"),
            "page_facebook": champs.get("page_facebook")
            or (source["url"] if source.get("genre") == "page" else None),
            "horaires": champs.get("horaires"),
            "equipements": champs.get("equipements") or [],
            "prix_ar": champs.get("prix_ar"),
            "prix_unite": champs.get("prix_unite"),
            "prix_vu_le": date_post,
            "evt_debut": champs.get("evt_debut"),
            "evt_fin": champs.get("evt_fin"),
            "evt_recurrent": int(bool(champs.get("evt_recurrent"))),
            "organisateur": champs.get("organisateur"),
            "post_genre": champs.get("post_genre"),
            "lieu_texte": champs.get("lieu_texte"),
            "lu_par_llm": int(bool(champs.get("lu_par_llm"))),
            "llm_confiance": champs.get("llm_confiance"),
            "llm_doute": champs.get("llm_doute"),
            **rapprochement,
        })

        # -- Les circuits d'agence : `tours` est vide sur Diako alors que les
        #    agences n'ecrivent que ca.
        for rang, circuit in enumerate(champs.get("lignes_circuit") or [], start=1):
            for cote, cle in (("depart", "depart_id"), ("arrivee", "arrivee_id")):
                lieu = diako.rapprocher_lieu(circuit.get(cote) or "")
                circuit[cle] = lieu["id"] if lieu else None
            base.ajouter_ligne_circuit(tid, circuit, ordre=rang)

        # -- Lignes de carte
        for rang, ligne in enumerate(champs.get("lignes_carte") or [], start=1):
            plat = diako.rapprocher_plat(ligne["nom"])
            base.ajouter_ligne_carte(tid, dict(
                ligne, plat_id=plat["id"] if plat else None,
                plat_nom=plat["nom"] if plat else None,
            ), ordre=rang)

        # -- Doublons : le même établissement reposté ailleurs
        jumelle = base.chercher_jumelle(
            tid, champs.get("telephone") or "", champs.get("nom_etab") or "",
            rapprochement.get("page_id") or "",
        )
        if jumelle and champs["genre"] in ("etablissement", "carte"):
            base.modifier(tid, {"statut": "doublon", "doublon_de": jumelle})
            statut = "doublon"
        elif champs["genre"] == "evenement":
            try:
                evt_id, comment = diako.evenement_deja_la(
                    champs.get("titre_evt") or "", champs.get("evt_debut")
                )
                if evt_id:
                    base.modifier(tid, {
                        "statut": "doublon", "cible_id": evt_id,
                        "note": f"Déjà au calendrier de Diako : {comment}.",
                    })
                    statut = "doublon"
            except Exception as e:
                base.logguer(f"Contrôle « déjà au calendrier » impossible : {e}", "avert")

        # -- Titre, textes et score
        t = base.trouvaille(tid)
        if not t:
            return
        if champs.get("titre_evt"):
            t["titre"] = champs["titre_evt"]
        t["_etat_fiche"] = rapprochement.get("_etat_fiche", {})
        note = notation.calculer(t)
        base.modifier(tid, {
            "titre": champs.get("titre_evt") or redaction.titre(t),
            "resume": t.get("resume") or redaction.resume_fiche(t),
            "presentation": redaction.presentation(t) if t["genre"] == "etablissement" else None,
            "corps": redaction.corps_recit(t) if t["genre"] == "recit" else t.get("corps"),
            "score": note["score"],
            "niveau": note["niveau"],
        })

        (dossier / "trouvaille.json").write_text(
            json.dumps(
                {k: v for k, v in (base.trouvaille(tid) or {}).items() if k != "texte"},
                ensure_ascii=False, indent=2, default=str,
            ),
            encoding="utf-8",
        )

        etiquette = " (doublon)" if statut == "doublon" else (
            " (incomplète)" if bloquants else "")
        cible = (base.trouvaille(tid) or {}).get("page_nom") or \
            champs.get("nom_etab") or champs.get("lieu_texte") or "?"
        base.logguer(
            f"{champs['genre'].capitalize()} — score {note['score']}/100{etiquette} : "
            f"{cible} — {gardees} photo(s)"
            + (f", {len(champs.get('lignes_carte') or [])} plat(s)"
               if champs.get("lignes_carte") else "") + ".",
            "succes",
        )

    def _lire_la_carte(self, tid: str, dossier: Path, texte: str, champs: dict,
                       cfg: dict) -> dict:
        """Fait transcrire une carte photographiée, quand il y a lieu de croire qu'il y en a une.

        ⚠ ON N'ENVOIE PAS TOUTES LES PHOTOS AU MODÈLE. Une lecture d'image coûte
          et prend du temps : on ne la déclenche que si le texte parle de carte
          ou de menu, ou si la publication vient d'un restaurant identifié, et
          seulement quand les règles n'ont pas déjà trouvé de plats chiffrés.
        """
        deja = champs.get("lignes_carte") or []
        if len(deja) >= 3:
            return champs

        n = extraction.sans_accent(texte)
        indices = any(m in n for m in ("menu", "carte", "plat du jour", "tarif",
                                       "nos plats", "sakafo"))
        est_resto = "restaurant" in (champs.get("categories") or [])
        if not (indices or est_resto):
            return champs

        photos = [dossier / p["fichier"] for p in base.photos_a_publier(tid)]
        if not photos:
            return champs
        try:
            lecture = analyse_llm.lire_carte(photos, cfg)
        except analyse_llm.LLMIndisponible as e:
            base.logguer(f"Lecture de carte impossible ({e}).", "avert")
            return champs

        plats = analyse_llm.plats_depuis_carte(lecture)
        if not plats:
            return champs

        connus = {p["nom"].lower() for p in plats}
        champs["lignes_carte"] = plats + [p for p in deja if p["nom"].lower() not in connus]
        if len([p for p in plats if p.get("prix_ar")]) >= 3:
            champs["genre"] = "carte"
        # La photo de la carte a une destination à elle : `menu_photos`.
        for photo in base.photos_a_publier(tid)[:2]:
            base.modifier_photo(photo["id"], est_la_carte=1)
        base.logguer(
            f"Carte lue sur photo : {len(plats)} plat(s), "
            f"{len([p for p in plats if p.get('prix_ar')])} chiffré(s).",
            "succes",
        )
        return champs

    def _rapprocher(self, champs: dict, cfg: dict) -> dict:
        """Relie la trouvaille au référentiel : lieu, fiche d'établissement, plat.

        Le rattachement automatique n'a lieu qu'au-dessus du seuil ET sur un
        lieu concordant. En dessous, on RANGE les candidats sans choisir : le
        panneau les affichera, et c'est un humain qui tranche. Poser une carte
        sur le mauvais restaurant ne se rattrape pas.
        """
        sortie: dict = {
            "lieu_id": None, "lieu_nom": None, "lieu_score": None,
            "page_id": None, "page_nom": None, "page_score": None,
            "page_candidats": [], "_etat_fiche": {},
        }

        lieu = diako.rapprocher_lieu(champs.get("lieu_texte") or "")
        if lieu:
            sortie.update({"lieu_id": lieu["id"], "lieu_nom": lieu["nom"],
                           "lieu_score": lieu["score"]})

        nom = champs.get("nom_etab")
        if not nom:
            return sortie

        candidats = diako.rapprocher_page(
            nom, sortie["lieu_id"], seuil=float(cfg.get("seuil_rapprochement", 0.55))
        )
        sortie["page_candidats"] = candidats
        if candidats:
            meilleur = candidats[0]
            assez_sur = meilleur["score"] >= float(cfg.get("seuil_rattachement_auto", 0.78))
            # Le lieu confirme, ou bien on ne connaît pas le lieu : dans les deux
            # cas on accepte. Un lieu qui CONTREDIT, en revanche, suspend.
            lieu_ne_contredit_pas = meilleur["meme_lieu"] or not sortie["lieu_id"]
            if assez_sur and lieu_ne_contredit_pas:
                sortie.update({
                    "page_id": meilleur["id"], "page_nom": meilleur["nom"],
                    "page_score": meilleur["score"],
                    "_etat_fiche": {
                        "a_photo": meilleur["a_photo"], "a_tel": meilleur["a_tel"],
                        "nb_carte": meilleur["nb_carte"],
                    },
                })
        return sortie

    def _manques(self, champs: dict, rapprochement: dict, nb_photos: int) -> list[str]:
        """Ce qui empêche de publier, exprimé comme l'interface l'affichera."""
        manques = []
        genre = champs.get("genre")

        if not rapprochement.get("lieu_id"):
            manques.append("lieu")
        if genre in ("etablissement", "carte") and not (
            champs.get("nom_etab") or rapprochement.get("page_id")
        ):
            manques.append("établissement")
        if genre == "carte" and not rapprochement.get("page_id"):
            manques.append("fiche à choisir")
        if genre == "evenement" and not champs.get("evt_debut"):
            manques.append("date")
        if genre == "recit" and nb_photos == 0:
            manques.append("photo")
        if genre == "etablissement" and not champs.get("telephone"):
            manques.append("contact")
        if genre == "carte" and not any(
            p.get("prix_ar") for p in (champs.get("lignes_carte") or [])
        ):
            manques.append("prix")
        return manques

    # -- Prospection de sources ---------------------------------------------
    def prospecter_sources(self, requetes: list[str] | None = None,
                           rappel=None) -> dict:
        """Cherche de nouveaux groupes et pages, et range les candidats.

        Passe par le même navigateur et la même session que la collecte : c'est
        le compte d'Andry qui cherche, avec les mêmes pauses. Rien n'est
        rejoint ni suivi — seulement lu.
        """
        from . import sources_prospection as prospection

        cfg = charger()
        if self.etat["actif"]:
            raise RuntimeError("Une collecte est déjà en cours.")
        self.etat.update(actif=True, source="prospection de sources", trouvees=0)
        try:
            with sync_playwright() as pw:
                ctx = self._contexte(pw, visible=cfg["navigateur_visible"])
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                try:
                    candidats = prospection.prospecter(
                        page, requetes=requetes, rappel=rappel, config=cfg
                    )
                finally:
                    ctx.close()
            neufs = prospection.enregistrer(candidats)
            base.logguer(
                f"Prospection de sources : {len(candidats)} candidat(s) examiné(s), "
                f"{neufs} nouveau(x) à trancher.",
                "succes" if neufs else "info",
            )
            return {"examines": len(candidats), "nouveaux": neufs}
        finally:
            self.etat.update(actif=False, source=None)

collecteur = Collecteur()
