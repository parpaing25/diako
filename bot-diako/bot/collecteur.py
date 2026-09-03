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

import contextlib
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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote_plus, urlencode, urlsplit, urlunsplit

import requests
from playwright.sync_api import sync_playwright

from . import analyse_llm, base, diako, extraction, redaction, toile, verrou_navigateur
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
    // 🔴 UN PERMALIEN PORTE UN IDENTIFIANT APRÈS /posts/, /permalink/ ou
    //   /videos/, et n'est JAMAIS sous /search/. Sur une page de résultats de
    //   recherche, le premier lien contenant « /posts/ » est l'adresse de la
    //   recherche elle-même (facebook.com/search/posts/?q=…) : toutes les
    //   publications de la page recevaient la même clé, la première seule
    //   était gardée et la source était morte à la deuxième collecte —
    //   2 trouvailles en dix jours pour deux recherches, mesuré le 02/09/2026.
    const EST_PERMALIEN = /facebook\\.com\\/(?!search\\/)[^?#]*\\/(posts|permalink|videos)\\/[^/?#]+/;
    const permalien = liens.find(h =>
      EST_PERMALIEN.test(h) || /[?&](story_fbid|multi_permalinks)=\\d/.test(h)) || '';

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

    // ⭐ QUAND CETTE PUBLICATION A-T-ELLE ÉTÉ ÉCRITE ? C'est la question la
    //   plus mal traitée du bot jusqu'ici : sur 2 217 trouvailles en base,
    //   DEUX portaient une date (« 6 h », « 7 h »). L'ancien sélecteur ne
    //   lisait que le texte d'un span à l'intérieur du lien ; Facebook met
    //   aujourd'hui la date ailleurs, et le plus souvent dans un attribut.
    //
    // ⚠ LE DOM RÉEL N'A PAS PU ÊTRE INSPECTÉ LE 24/08/2026 (aucune session
    //   Facebook ouverte, et on ne relance pas le bot). On tente donc PLUSIEURS
    //   pistes, dans l'ordre du plus sûr au plus douteux, et on retient la
    //   première qui RESSEMBLE à une date. Les pistes essayées :
    //     ① <abbr data-utime="1565…">  — l'horodatage exact, ancien Facebook ;
    //     ② le lien vers la publication : aria-label (« 12 août 2019 »),
    //        title, data-tooltip-content, son texte, ses spans imbriqués ;
    //     ③ les infobulles de l'en-tête, hors du corps du message.
    //   Si aucune ne répond, `heure` vaut '' : c'est un cas prévu, pas un bug,
    //   et Python sait le traiter (voir `date_de_publication`).
    //
    // ⚠ ON NE REGARDE JAMAIS DANS LE CORPS DU MESSAGE. Une affiche de concert
    //   écrit « Vendredi 7 août » : ramassée ici, cette date deviendrait la
    //   date de publication du post. D'où le filtre `horsDuMessage`.
    const heure = (() => {
      // ⚠ Les deux formes absolues exigent un NOM DE MOIS. Sans ça, « 1 réaction :
      //   voir qui a réagi », « 2 commentaires » et « Les 3 Metis Hotel, voir
      //   la story » passaient pour des dates SÛRES et éclipsaient la vraie
      //   (34 horodatages sur 214 en base le 02/09/2026, soit 16 %).
      const MOIS = '(?:jan|f[ée]v|mar|avr|apr|mai|may|juin|jun|juil|jul|ao[uû]|aug|sep|oct|nov|d[ée]c)\\\\p{L}*';
      const SUR = new RegExp('^\\\\s*(?:il y a\\\\s+|about\\\\s+)?(?:\\\\d{1,3}\\\\s*(?:min|mn|h|hr|j|d|sem|w|mo|an|y)\\\\b|hier|yesterday|aujourd|just now|maintenant|\\\\d{4}-\\\\d{2}-\\\\d{2}|\\\\d{1,2}[\\\\/.-]\\\\d{1,2}[\\\\/.-]\\\\d{2,4}|\\\\d{1,2}(?:er)?\\\\s+' + MOIS + '|' + MOIS + '\\\\.?\\\\s+\\\\d{1,2})', 'iu');
      const PROBABLE = /(\\d{1,3}\\s*(?:min|mn|h|j|d|sem|w|mois|an|y)\\b|hier|yesterday|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+\\p{L}{3,}\\s+\\d{4}|\\p{L}{3,}\\s+\\d{1,2},?\\s+\\d{4})/iu;
      const dansLeMessage = (n) => !!n.closest(
        '[data-ad-preview="message"], [data-ad-comet-preview="message"]');
      const vus = [];
      const pousser = (v) => {
        const t = (v || '').replace(/\\s+/g, ' ').trim();
        // Au-delà de 60 caractères ce n'est plus une date, c'est une phrase.
        if (t && t.length <= 60) vus.push(t);
      };
      try {
        for (const ab of el.querySelectorAll('abbr[data-utime]')) {
          const s = Number(ab.getAttribute('data-utime'));
          if (s > 0) pousser(new Date(s * 1000).toISOString().slice(0, 10));
        }
        const liens = el.querySelectorAll(
          'a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"],' +
          ' a[href*="/videos/"], a[href*="/photos/"]');
        for (const a of liens) {
          if (dansLeMessage(a)) continue;
          pousser(a.getAttribute('aria-label'));
          pousser(a.getAttribute('title'));
          pousser(a.getAttribute('data-tooltip-content'));
          pousser(a.innerText);
          for (const sp of a.querySelectorAll('span')) pousser(sp.innerText);
        }
        for (const n of el.querySelectorAll(
            '[data-tooltip-content], abbr[title], abbr, [aria-label]')) {
          if (dansLeMessage(n)) continue;
          pousser(n.getAttribute('data-tooltip-content'));
          pousser(n.getAttribute('title'));
          pousser(n.getAttribute('aria-label'));
          if (n.tagName === 'ABBR') pousser(n.innerText);
        }
      } catch (e) { /* un DOM qui change ne doit pas casser la collecte */ }
      return vus.find(t => SUR.test(t)) || vus.find(t => PROBABLE.test(t)) || '';
    })();

    // D'OÙ vient cette publication ? Dans le fil, un post de groupe porte DEUX
    // liens : /groups/{id}/ dont le texte est le NOM DU GROUPE, et
    // /groups/{id}/user/{uid}/ dont le texte est le nom de LA PERSONNE.
    let origine = null, auteurDuGroupe = '';
    for (const a of el.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      const nom = (a.innerText || '').trim().split('\\n')[0];
      if (!nom || nom.length < 3) continue;
      if (!origine) {
        const g = href.match(/^\\/groups\\/([0-9A-Za-z._-]+)\\/?(\\?|$)/);
        if (g) { origine = {genre: 'groupe', cle: g[1], nom}; continue; }
      }
      if (!auteurDuGroupe) {
        const u = href.match(/^\\/groups\\/[0-9A-Za-z._-]+\\/user\\/\\d+\\/?/);
        if (u) auteurDuGroupe = nom;
      }
      if (origine && auteurDuGroupe) break;
    }

    // Nom de l'auteur : il devient l'attribution de la trouvaille.
    // Dans le fil, l'en-tête d'un post de groupe commence par le NOM DU
    // GROUPE. S'en contenter attribuait la trouvaille au groupe et non à la
    // personne ; le lien /user/ est la seule source fiable pour celle-ci.
    const enTete = el.querySelector('h2 a, h3 a, h4 a, strong a, h2 span, h3 span');
    const auteur = auteurDuGroupe
      || (enTete?.innerText || '').split('\\n')[0].trim();

    if (!origine) {
      for (const a of el.querySelectorAll('h2 a, h3 a, h4 a, strong a')) {
        const href = a.getAttribute('href') || '';
        const nom = (a.innerText || '').trim().split('\\n')[0];
        if (!nom || nom.length < 3) continue;
        const p = href.match(/^\\/([A-Za-z0-9.\\-]{5,60})\\/?(\\?|$)/);
        if (p && !['profile.php','watch','marketplace','groups','events','reel',
                   'stories','photo','pages','permalink','posts'].includes(p[1])) {
          origine = {genre: 'page', cle: p[1], nom}; break;
        }
      }
    }

    // Les sites cités dans la publication : le site officiel d'un hôtel est
    // une source à part entière, et souvent la meilleure — il n'a aucun
    // algorithme entre lui et nous.
    const sites = [...new Set([...el.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href') || '')
      .map(h => { const m = h.match(/^https?:\\/\\/([^/?#]+)/); return m ? m[1] : ''; })
      .filter(d => d && !/facebook\\.com|fbcdn|fb\\.me|messenger\\.com|instagram\\.com/.test(d))
      .map(d => d.replace(/^www\\./, '').toLowerCase()))]
      .slice(0, 4);

    // ⚠ On ne jette pas toute la chaîne de requête : `story.php?story_fbid=…`
    //   sans son paramètre redevient une adresse commune à toute la page.
    const permalienPropre = (() => {
      if (!permalien) return '';
      try {
        const u = new URL(permalien);
        const garde = new URLSearchParams();
        for (const k of ['story_fbid', 'id', 'multi_permalinks']) {
          if (u.searchParams.has(k)) garde.set(k, u.searchParams.get(k));
        }
        u.search = garde.toString() ? '?' + garde.toString() : '';
        u.hash = '';
        return u.toString();
      } catch (e) { return permalien.split('?')[0]; }
    })();

    return {
      texte,
      permalien: permalienPropre,
      images,
      nb_images: images.length,
      heure,
      auteur,
      origine,
      sites,
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


def _noter_origine(post: dict, source: dict, retenue: bool = False,
                   deja_vue: bool = False) -> None:
    """Retient d'OÙ vient une publication croisée sur le fil.

    C'est ainsi que le bot se constitue tout seul une liste de sources : le
    fil d'actualité remonte des groupes et des pages dont on n'est pas
    forcément membre, et chacun se juge ensuite sur ce qu'il a donné.

    Ne concerne que le fil : sur un groupe ou une page qu'on parcourt déjà,
    l'origine est connue et le rendement est mesuré par `rendement_sources()`.
    """
    if source.get("genre") != "fil":
        return

    origine = post.get("origine") or {}
    cle, nom = origine.get("cle"), (origine.get("nom") or "").strip()
    if cle and nom:
        url = (f"https://www.facebook.com/groups/{cle}"
               if origine.get("genre") == "groupe"
               else f"https://www.facebook.com/{cle}")
        base.observer_source(cle, origine.get("genre", "page"), nom, url,
                             retenue=retenue, deja_vue=deja_vue)

    # Le site d'une agence cité dans une publication est une source à part
    # entière — et souvent la meilleure : aucun algorithme entre lui et nous.
    for domaine in (post.get("sites") or []):
        base.observer_source(domaine, "site", domaine, f"https://{domaine}",
                             retenue=retenue, deja_vue=deja_vue)


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


PERMALIEN_AVEC_ID = re.compile(r"/(posts|permalink|videos)/[^/?#]+|story_fbid=\d|multi_permalinks=\d")


def empreinte(texte: str, permalien: str) -> str:
    """Identifie une publication. Le permalien prime ; sinon le texte normalisé.

    ⚠ Un permalien SANS identifiant (« …/search/posts/ », « …/story.php ») est
      l'adresse d'une page entière : s'en servir donnerait une clé unique à
      toutes ses publications. On retombe alors sur le texte.
    """
    if permalien and PERMALIEN_AVEC_ID.search(permalien) and "/search/" not in permalien:
        return hashlib.sha1(permalien.encode()).hexdigest()
    reduit = re.sub(r"[^a-z0-9]", "", texte.lower())[:300]
    if not reduit:
        # Un émoji et une photo : rien à hacher. Une clé vide serait partagée
        # par toutes les publications muettes ; on prend le permalien tel quel.
        reduit = permalien or ""
    return hashlib.sha1(reduit.encode()).hexdigest()


# ⭐ COMBIEN DE TEXTES SONT COLLECTÉS PLUSIEURS FOIS. Mesuré le 24/08/2026 sur
#   les 2 217 trouvailles : 163 groupes de textes identiques, 179 trouvailles en
#   trop — dont sept exemplaires du même « C'est l'heure du repas ! Pensez à
#   Savanna ! » et quatre du même « Hotel La Bombonera … a actualisé son
#   statut ». `empreinte()` ne les voit pas : elle s'appuie sur le permalien,
#   qui diffère à chaque republication.
LONGUEUR_SIGNATURE = 200
# 🔴 EN DESSOUS DE CE SEUIL, ON NE DÉDOUBLONNE PAS SUR LE TEXTE. « Bonne
#    journée à tous 🌞 » écrit par deux hôtels différents n'est pas un doublon,
#    c'est une politesse. Il faut de la matière pour qu'une coïncidence devienne
#    une preuve.
LONGUEUR_MINIMALE_SIGNATURE = 120


def empreinte_texte(texte: str) -> str:
    """Signature du CONTENU d'une publication. '' quand le texte est trop court.

    Normalisation volontairement brutale — minuscules, sans accent, sans
    ponctuation, sans espace — parce que Facebook réécrit les mêmes textes avec
    des espaces insécables, des majuscules décoratives et des émojis en plus.
    """
    reduit = re.sub(r"[^a-z0-9]", "", extraction.sans_accent(texte or ""))
    if len(reduit) < LONGUEUR_MINIMALE_SIGNATURE:
        return ""
    return hashlib.sha1(reduit[:LONGUEUR_SIGNATURE].encode()).hexdigest()


def _debut(texte: str, taille: int = 70) -> str:
    """Le début d'un texte, sur une seule ligne — pour les messages du journal."""
    propre = " ".join((texte or "").split())
    return propre[:taille] + ("…" if len(propre) > taille else "")


# ── Quand la publication a-t-elle été écrite ? ──────────────────────────────
# Facebook affiche trois familles de dates, et le bot ne savait lire que la
# première :
#   ① relative     — « 6 h », « Hier », « 2 j », « 5 sem. »
#   ② absolue      — « 12 août 2019 », « 12 août », « August 12, 2019 »
#   ③ numérique    — « 12/08/2019 », « 2019-08-12 » (celle de `data-utime`)
#
# 🔴 L'ESPACE ENTRE LE NOMBRE ET L'UNITÉ EST INSÉCABLE (U+00A0). Les deux
#    seules dates de la base valent littéralement '6\xa0h' et '7\xa0h'. `\s`
#    en mode Unicode l'attrape ; `[ ]` ne l'aurait pas attrapé. On normalise
#    quand même tous les espaces exotiques (fine, insécable étroite) en espace
#    ordinaire avant de lire, pour ne pas dépendre de ce détail.
_ESPACES_EXOTIQUES = str.maketrans({
    " ": " ",   # insécable — celui des deux seules dates de la base
    " ": " ",   # insécable étroite
    " ": " ",   # fine
    " ": " ",   # cadratin numérique
    " ": " ",   # ultrafine
    "​": "",    # largeur nulle : à supprimer, pas à remplacer
})

# Longueur d'abord : « annees » doit passer avant « an », « heures » avant
# « h », sinon « 2 ans » se lit « 2 an » + un « s » orphelin et « 8 janvier »
# se lisait « 8 j » — un article de janvier daté d'il y a huit jours.
_UNITES_RELATIVES = (
    ("minutes", 0), ("minute", 0), ("mins", 0), ("min", 0), ("mn", 0),
    ("heures", 0), ("heure", 0), ("hrs", 0), ("hr", 0), ("h", 0),
    ("jours", 1), ("jour", 1), ("days", 1), ("day", 1), ("j", 1), ("d", 1),
    ("semaines", 7), ("semaine", 7), ("weeks", 7), ("week", 7), ("sem", 7), ("w", 7),
    ("months", 30), ("month", 30), ("mois", 30), ("mo", 30),
    ("annees", 365), ("annee", 365), ("ans", 365), ("an", 365),
    ("years", 365), ("year", 365), ("yrs", 365), ("y", 365),
)
_JOURS_PAR_UNITE = dict(_UNITES_RELATIVES)
# ⚠ `(?![a-z])` N'EST PAS DÉCORATIF : sans lui, « 8 janvier » correspond à
#   « 8 j » (jours) et une publication de janvier passe pour vieille de huit
#   jours. C'est la faute qui rendait le filtre de fraîcheur inopérant.
MOTIF_AGE_RELATIF = re.compile(
    r"(\d{1,4})\s*(" + "|".join(m for m, _ in _UNITES_RELATIVES) + r")(?![a-z])",
    re.I,
)

# Les mois français et malgaches sont déjà connus d'`extraction` ; on ajoute
# l'anglais, que Facebook sert dès que le compte est en anglais.
MOIS_LUS = dict(extraction.MOIS)
MOIS_LUS.update({
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
})

MOTIF_DATE_ISO = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
MOTIF_DATE_NUMERIQUE = re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b")
MOTIF_JOUR_MOIS = re.compile(r"\b(\d{1,2})\s*(?:er)?\s+([a-z]{3,12})\.?(?:\s*,?\s*(\d{4}))?")
MOTIF_MOIS_JOUR = re.compile(r"\b([a-z]{3,12})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?")


def _annee_sans_annee(mois: int, jour: int, aujourdhui: date) -> int:
    """Facebook omet l'année quand la date tombe dans les douze derniers mois.

    Règle appliquée telle quelle : année en cours, SAUF si le jour obtenu est
    dans le futur — « 12 décembre » lu un 24 août, c'est décembre DERNIER.
    """
    try:
        candidate = date(aujourdhui.year, mois, jour)
    except ValueError:            # 29 février d'une année non bissextile
        return aujourdhui.year
    return aujourdhui.year - 1 if candidate > aujourdhui else aujourdhui.year


def _date_absolue(n: str, aujourdhui: date) -> date | None:
    """« 12 août 2019 », « 12 août », « August 12, 2019 », « 12/08/2019 » -> date."""
    trouve = MOTIF_DATE_ISO.search(n)
    if trouve:
        annee, mois, jour = (int(g) for g in trouve.groups())
        try:
            return date(annee, mois, jour)
        except ValueError:
            return None

    trouve = MOTIF_DATE_NUMERIQUE.search(n)
    if trouve:
        # ⚠ JOUR/MOIS, jamais mois/jour : Facebook sert le format du compte, et
        #   celui-ci est en français. « 12/08 » = 12 août.
        jour, mois, annee = (int(g) for g in trouve.groups())
        if annee < 100:
            annee += 2000
        try:
            return date(annee, mois, jour)
        except ValueError:
            return None

    for motif, ordre in ((MOTIF_JOUR_MOIS, "jm"), (MOTIF_MOIS_JOUR, "mj")):
        for trouve in motif.finditer(n):
            a, b, annee = trouve.groups()
            jour, nom = (a, b) if ordre == "jm" else (b, a)
            mois = MOIS_LUS.get(nom)
            if not mois:
                continue
            jour = int(jour)
            if not 1 <= jour <= 31:
                continue
            annee = int(annee) if annee else _annee_sans_annee(mois, jour, aujourdhui)
            try:
                return date(annee, mois, jour)
            except ValueError:
                continue
    return None


def _age_en_jours(heure: str, aujourdhui: date | None = None) -> int | None:
    """Âge approximatif d'une publication, en jours. None = on ne sait pas.

    Lit les trois familles : relative (« 3 h »), absolue (« 12 août 2019 »),
    numérique (« 12/08/2019 »). L'ordre compte : le relatif d'abord, parce
    qu'il est sans ambiguïté et de loin le plus fréquent dans le fil.
    """
    aujourdhui = aujourdhui or date.today()
    n = extraction.sans_accent(heure.translate(_ESPACES_EXOTIQUES)).strip()
    if not n:
        return None
    if "hier" in n or "yesterday" in n:
        return 1
    if any(m in n for m in ("aujourd", "just now", "maintenant", "a l'instant",
                            "il y a un instant")):
        return 0

    trouve = MOTIF_AGE_RELATIF.search(n)
    if trouve:
        return int(trouve.group(1)) * _JOURS_PAR_UNITE[trouve.group(2).lower()]

    jour = _date_absolue(n, aujourdhui)
    if jour is None:
        return None
    # Une date future (fuseau horaire, horloge décalée) vaut « aujourd'hui » :
    # un âge négatif n'a aucun sens et ferait passer tous les filtres.
    return max(0, (aujourdhui - jour).days)


def date_de_publication(heure: str, aujourdhui: date | None = None) -> str:
    """Date estimée de la publication. **Chaîne vide quand on ne sait pas.**

    🔴 ELLE NE REND PLUS « AUJOURD'HUI » PAR DÉFAUT (24/08/2026). L'ancienne
       version renvoyait la date du jour dès que l'âge était inconnu, c'est-à-
       dire pour 2 215 des 2 217 trouvailles en base : une publication de 2019
       était enregistrée comme publiée ce matin, et `prix_vu_le` — qui date les
       tarifs publiés sur Diako — reprenait ce mensonge. 138 trouvailles
       chiffrées portent aujourd'hui une date de relevé inventée.

       Une case vide se voit et se corrige ; une date fausse ne se voit pas.
       Les appelants doivent donc accepter '' : `prix_vu_le` reste vide, et
       `posts.price_on` part alors à NULL côté Diako.
    """
    age = _age_en_jours(heure, aujourdhui)
    if age is None:
        return ""
    return ((aujourdhui or date.today()) - timedelta(days=age)).isoformat()


def annee_de_publication(heure: str, aujourdhui: date | None = None) -> int | None:
    """L'année de la publication. None = indéterminable — et alors ON GARDE.

    ⚠⚠ DÉCISION ASSUMÉE : l'inconnu passe. Refuser ce qu'on ne sait pas dater
       supprimerait 99 % de la collecte (2 215 trouvailles sur 2 217 n'ont
       aucune date lisible aujourd'hui). Le filtre `annee_minimum` n'écarte que
       ce qu'on sait ANCIEN, jamais ce qu'on ignore.
    """
    iso = date_de_publication(heure, aujourdhui)
    return int(iso[:4]) if iso else None


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
                # ⚠ La ligne resterait « en lecture » pour toujours : aucun
                #   écran ne la montre, et son empreinte bloque toute
                #   recollecte. On la range en « incomplète » avec la raison,
                #   pour qu'on puisse la relire ou la jeter en connaissance.
                if tache.get("tid"):
                    with contextlib.suppress(Exception):
                        base.modifier(tache["tid"], {
                            "statut": "incomplete",
                            "manques": ["lecture interrompue"],
                            "note": f"Lecture abandonnée sur une erreur : {str(e)[:200]}",
                        })
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
        # ⭐ CE QUE LA COLLECTE A ÉCARTÉ, ET POURQUOI. Sans ces trois
        #   compteurs, un filtre trop sévère est indiscernable d'une source
        #   tarie : on verrait « 0 trouvaille » sans savoir si Facebook n'a
        #   rien donné ou si le bot a tout jeté. Ils remontent tels quels
        #   dans /api/etat, donc à l'écran.
        self.etat = {"actif": False, "source": None, "trouvees": 0,
                     "examines": 0, "ecartes_immobilier": 0,
                     "ecartes_anciennes": 0, "ecartes_doublons": 0,
                     "ecartes_hors_sujet": 0}
        # ⚠ `ecartes_immobilier` est incrémenté depuis DEUX endroits : le fil du
        #   navigateur (`_parcourir`) et les fils de l'atelier (`_finir`).
        #   `d[c] += 1` n'est pas atomique — un chiffre affiché faux vaut mieux
        #   que rien, mais un verrou coûte moins cher qu'une explication.
        self._compteurs = threading.Lock()
        self._noms_de_lieux: list[str] = []

    def _compter_ecart(self, cle: str) -> None:
        with self._compteurs:
            self.etat[cle] = self.etat.get(cle, 0) + 1

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
            try:
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                try:
                    page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
                except Exception as e:
                    base.logguer(f"Facebook ne s'ouvre pas : {type(e).__name__}.", "avert")
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
                    except Exception as e:
                        base.logguer(
                            f"Fenêtre de connexion perdue ({type(e).__name__}).", "avert"
                        )
                        break
            finally:
                with contextlib.suppress(Exception):
                    ctx.close()

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
        self.etat.update({"actif": True, "trouvees": 0, "examines": 0,
                          "ecartes_immobilier": 0, "ecartes_anciennes": 0,
                          "ecartes_doublons": 0, "ecartes_hors_sujet": 0})
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

        # ⚠ LES SITES EN JAVASCRIPT OUVRENT AUSSI CHROMIUM : mêmes garde-fous
        #   (mémoire, verrou) que la partie Facebook. Avant le 02/09/2026 ce
        #   passage s'ouvrait AVANT le contrôle mémoire, hors verrou.
        if self._sites_js and not self.stop.is_set():
            if self._peut_ouvrir_chromium(cfg, "Relecture des sites en JavaScript"):
                with verrou_navigateur.verrou_navigateur("diako") as pris:
                    if pris:
                        self._relire_avec_navigateur(cfg)
                    else:
                        base.logguer(
                            "Relecture des sites en JavaScript sautée : un autre bot "
                            "occupe le navigateur.", "avert",
                        )
            self._sites_js = []

        # ⚠ ON NE LANCE PAS CHROMIUM SUR UNE MACHINE PLEINE. Mieux vaut sauter
        #   la partie Facebook en le disant que se faire tuer au milieu — et
        #   emporter le bot avec. Les sources « site », elles, ont déjà tourné :
        #   la collecte n'est donc pas perdue, seulement amputée.
        if facebook and not self._peut_ouvrir_chromium(cfg, "Partie Facebook"):
            facebook = []

        # ⚠ ET ON N'OUVRE PAS CHROMIUM SI UN AUTRE BOT L'A DÉJÀ OUVERT.
        #   Le garde-fou mémoire ci-dessus regarde la machine à un instant t ;
        #   il ne voit pas que les bots frères s'apprêtent à faire la même
        #   chose. Le 24/08/2026, trois bots ont passé ce contrôle en même
        #   temps — il restait 1,2 Go pour chacun — et la machine est tombée
        #   à 187 Mo, le niveau exact où les bots sont morts la veille.
        #   Le verrou vit hors des dépôts (~/bots-hub) : voir son en-tête.
        #   🔴 C'EST LE RÉSULTAT DE `prendre()` QUI TRANCHE, pas un coup d'œil
        #   préalable à `qui()` : entre le coup d'œil et l'ouverture, un bot
        #   frère a le temps de prendre la place (vu le 24/08).
        if facebook and not self.stop.is_set():
            with verrou_navigateur.verrou_navigateur("diako") as pris:
                if not pris:
                    occupant = verrou_navigateur.qui() or "un autre bot"
                    base.logguer(
                        f"Partie Facebook sautée : « {occupant} » occupe le "
                        "navigateur. Une seule collecte à la fois sur cette machine — "
                        "celle-ci repassera au prochain créneau.",
                        "avert",
                    )
                    facebook = []
                else:
                    self._tournee_facebook(cfg, facebook, web)

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
        # Ce qui a été écarté se dit à voix haute : un filtre muet qui se trompe
        # ne se corrige jamais, faute qu'on sache qu'il a filtré.
        ecarte = [
            f"{self.etat['ecartes_immobilier']} annonce(s) immobilière(s)"
            if self.etat["ecartes_immobilier"] else "",
            f"{self.etat['ecartes_anciennes']} publication(s) trop ancienne(s)"
            if self.etat["ecartes_anciennes"] else "",
            f"{self.etat['ecartes_doublons']} texte(s) déjà collecté(s)"
            if self.etat["ecartes_doublons"] else "",
            f"{self.etat.get('ecartes_hors_sujet', 0)} hors sujet (ventes, vœux, publicités)"
            if self.etat.get("ecartes_hors_sujet") else "",
        ]
        base.logguer(
            f"Collecte terminée : {self.etat['trouvees']} trouvaille(s) retenue(s) "
            f"sur {self.etat['examines']} publication(s) examinée(s)."
            + (" Écarté : " + ", ".join(m for m in ecarte if m) + "."
               if any(ecarte) else ""),
            "succes",
        )
        return dict(self.etat)

    def _peut_ouvrir_chromium(self, cfg: dict, quoi: str) -> bool:
        """Le garde-fou mémoire, commun à TOUS les chemins qui ouvrent Chromium."""
        libre = memoire_libre_mo()
        seuil = int(cfg.get("memoire_mini_mo", 900))
        if libre is not None and libre < seuil:
            base.logguer(
                f"{quoi} sautée : il ne reste que {libre} Mo de mémoire "
                f"disponible (il en faut {seuil} pour Chromium). Fermez des "
                "applications, ou agrandissez le fichier d'échange — voir "
                "LISEZ-MOI, § « Quand la machine est pleine ».",
                "erreur",
            )
            return False
        return True

    def _tournee_facebook(self, cfg: dict, facebook: list[dict], web: list[dict]) -> None:
        """Le passage sur les sources Facebook, verrou navigateur déjà pris.

        ⚠ `ctx.close()` DANS UN `finally`. Une exception échappée au milieu de
          la tournée laissait Chromium se faire tuer par la sortie de
          Playwright, brutalement, sur le profil persistant qui porte la
          session Facebook.
        """
        with sync_playwright() as pw:
            ctx = self._contexte(pw, visible=cfg["navigateur_visible"])
            try:
                if not self._verifier_session(ctx):
                    base.logguer(
                        "Pas de session Facebook : les "
                        f"{len(facebook)} source(s) Facebook sont sautées. "
                        "Cliquez « Connecter mon compte Facebook ».",
                        "erreur" if not web else "avert",
                    )
                    return
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                for rang, source in enumerate(facebook):
                    if self.stop.is_set():
                        base.logguer("Collecte arrêtée à la demande.", "avert")
                        break
                    # Le verrou se périme au bout d'un moment : on dit qu'on est
                    # toujours là. Une tournée complète dure près de trois heures
                    # (mesuré le 01/09/2026 : 2 h 44).
                    verrou_navigateur.toucher("diako")
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
            finally:
                with contextlib.suppress(Exception):
                    ctx.close()

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
            except Exception as e:
                # ⚠ NE PAS AVALER : « 0 publication » et « le script a levé » se
                #   ressemblent dans le journal, et seul le second est une panne
                #   (le DOM de Facebook change sans prévenir, voir le 22/08/2026).
                base.logguer(
                    f"Lecture du fil impossible sur « {source['nom']} » "
                    f"({type(e).__name__}: {str(e)[:120]}) — le DOM Facebook a-t-il "
                    "changé ? Voir outils/diagnostic_fb.py.", "erreur",
                )
                lot = []

            neufs = 0     # publications RETENUES (pour le plafond)
            inedits = 0   # publications JAMAIS VUES (pour juger la stérilité)
            for publication in lot:
                cle = empreinte(publication["texte"], publication["permalien"])
                if cle in vus:
                    continue
                vus.add(cle)
                inedits += 1
                # La vue se compte ICI, avant tout filtre : c'est le
                # dénominateur du rendement. La compter plus bas, après le tri,
                # donnerait 100 % à toutes les sources — le chiffre ne
                # voudrait plus rien dire.
                _noter_origine(publication, source, retenue=False)
                if not extraction.parle_de_tourisme(
                    publication["texte"], publication["nb_images"]
                ):
                    continue
                # ⭐ L'IMMOBILIER EST LE MÉTIER DE FONENAKO, PAS CELUI DE DIAKO.
                #   Une maison à vendre, un terrain titré, un appartement loué
                #   au mois : on n'en veut pas, même publiés dans un groupe
                #   « bons plans vacances ». Voir `extraction.raisons_immobilier`
                #   pour le piège — un bungalow « à louer » reste du tourisme.
                immo = extraction.raisons_immobilier(publication["texte"])
                if immo:
                    self._compter_ecart("ecartes_immobilier")
                    base.logguer(
                        f"Annonce immobilière écartée ({', '.join(immo)}) : "
                        f"« {_debut(publication['texte'])} »", "info",
                    )
                    continue
                # ⭐ ON NE COLLECTE QUE L'ANNÉE EN COURS. Un tarif de 2019 ou un
                #   hôtel fermé depuis ne rendent service à personne.
                #   ⚠ Quand l'année est indéterminable, on garde : voir
                #     `annee_de_publication`, la décision y est écrite.
                annee = annee_de_publication(publication.get("heure", ""))
                annee_min = int(cfg.get("annee_minimum", 2026))
                if annee is not None and annee < annee_min:
                    self._compter_ecart("ecartes_anciennes")
                    base.logguer(
                        f"Publication de {annee} écartée (minimum {annee_min}) : "
                        f"« {_debut(publication['texte'])} »", "info",
                    )
                    continue
                age = _age_en_jours(publication.get("heure", ""))
                if age is not None and age > int(cfg["jours_max"]):
                    # Un filtre muet qui se trompe ne se corrige jamais : on
                    # compte et on dit, comme pour le filtre de l'année.
                    self._compter_ecart("ecartes_anciennes")
                    base.logguer(
                        f"Publication vieille de {age} jours écartée (maximum "
                        f"{cfg['jours_max']}) : « {_debut(publication['texte'])} »",
                        "info",
                    )
                    continue
                if base.existe(cle):
                    continue
                # ⭐ LE MÊME TEXTE, RECOLLECTÉ AILLEURS. L'empreinte ci-dessus
                #   porte sur le PERMALIEN : deux copies du même menu publiées
                #   sur deux pages sont deux publications distinctes pour elle,
                #   et sept exemplaires de « C'est l'heure du repas ! Pensez à
                #   Savanna ! » dorment aujourd'hui dans la base. Celle-ci porte
                #   sur le contenu.
                empreinte_du_texte = empreinte_texte(publication["texte"])
                if empreinte_du_texte and base.texte_deja_vu(empreinte_du_texte):
                    self._compter_ecart("ecartes_doublons")
                    base.logguer(
                        "Texte déjà collecté mot pour mot, ignoré : "
                        f"« {_debut(publication['texte'])} »", "info",
                    )
                    continue

                neufs += 1
                self.etat["examines"] += 1
                if self._inscrire(page, publication, source, cle):
                    retenues += 1
                    self.etat["trouvees"] += 1
                    _noter_origine(publication, source, retenue=True,
                                   deja_vue=True)

            # Défilement adaptatif : inutile de dérouler 25 fois une source qui
            # ne donne plus rien, inutile de s'arrêter à 25 si elle donne encore.
            # ⚠ STÉRILE = RIEN D'INÉDIT, pas « rien de retenu ». Un défilement
            #   qui découvre dix publications neuves toutes écartées (hors
            #   sujet, déjà vues) n'est pas un fil épuisé : c'est un fil qui
            #   continue. Juger sur les retenues faisait abandonner une
            #   recherche au 2ᵉ défilement, avant ses premiers résultats utiles.
            steriles = steriles + 1 if inedits == 0 else 0
            # Le fil et la recherche méritent deux tours stériles de plus : ils
            # alternent des blocs de service (souvenirs, suggestions, conseils)
            # et des blocs utiles. S'arrêter au premier creux les couperait au
            # mauvais endroit.
            if steriles >= (4 if genre in ("fil", "recherche") else 2) or retenues >= plafond:
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
        # ⭐ LES SITES MORTS SORTENT DE LA ROTATION. Quatre échecs de suite
        #   (adresse introuvable, 404, pare-feu) = on n'y revient qu'au bout
        #   d'un mois. Ils restent dans les sources, avec leur raison, pour
        #   qu'on puisse corriger l'adresse ou les retirer.
        limite = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(timespec="seconds")
        en_pause = [
            s for s in web
            if int(s.get("echecs") or 0) >= 4 and (s.get("derniere_collecte") or "") > limite
        ]
        if en_pause:
            base.logguer(
                f"{len(en_pause)} site(s) laissé(s) de côté ce tour (quatre échecs de "
                "suite) — ils seront retentés dans un mois. Voir l'onglet Sources.",
                "info",
            )
            exclus = {s["id"] for s in en_pause}
            web = [s for s in web if s["id"] not in exclus]
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

            try:
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
            finally:
                with contextlib.suppress(Exception):
                    contexte.close()
                    navigateur.close()

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
            raison = lecture.get("refuse") or "aucun texte lisible"
            echecs = int(source.get("echecs") or 0) + 1
            base.logguer(
                f"« {source['nom']} » : {raison} (échec n° {echecs}).", "avert",
            )
            # La raison et le compte d'échecs restent sur la source : au bout
            # de quatre, le site sort de la rotation pour un mois (voir
            # `_ordonner_sites`). 88 sites morts sur 250 mangeaient 35 % de
            # chaque tournée, deux fois par jour (02/09/2026).
            base.modifier_source(source["id"], dernier_resultat=raison, echecs=echecs)
            return 0

        # ⚠ L'EMPREINTE PORTE SUR LE TEXTE SEUL, pas sur l'adresse : un même
        #   site connu en http et en https produisait deux trouvailles.
        cle = "site:" + hashlib.sha1(
            re.sub(r"\s+", " ", lecture["texte"]).encode()
        ).hexdigest()
        if base.existe(cle):
            base.logguer(
                f"« {source['nom']} » : inchangé depuis le dernier passage "
                f"({len(lecture['pages'])} page(s) relues).", "info",
            )
            base.modifier_source(source["id"], dernier_resultat="inchangé", echecs=0)
            return 0
        base.modifier_source(source["id"], dernier_resultat="lu", echecs=0)

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
            # ⚠ ICI, ET SEULEMENT ICI, « aujourd'hui » EST VRAI : un site web
            #   affiche ses tarifs à l'instant où on le lit. C'est tout le
            #   contraire d'une publication Facebook, qui peut dater de 2019 —
            #   voir `date_de_publication`, qui rend '' dans ce cas.
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
            self._noms_de_lieux, cfg.get("taux_ariary"),
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

        # Le parc ou le site dont parle la page, et son lieu en repli : le
        # chemin Facebook le faisait, le chemin « site web » l'oubliait.
        if not rapprochement.get("lieu_id"):
            site_cite = diako.rapprocher_site(texte, None)
            if site_cite:
                rapprochement["site_id"] = site_cite["id"]
                rapprochement["site_nom"] = site_cite["nom"]
                repli = diako.lieu_par_repli({"site_id": site_cite["id"]})
                if repli:
                    rapprochement.update({"lieu_id": repli["id"], "lieu_nom": repli["nom"],
                                          "lieu_score": None})

        manques = self._manques(champs, rapprochement, gardees)
        chambres = champs.get("lignes_chambre") or []
        plats = champs.get("lignes_carte") or []
        vehicules = champs.get("lignes_vehicule") or []
        if not chambres and not plats and not vehicules and not champs.get("prix_ar"):
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
            "plat_id": champs.get("plat_id"),
            "plat_nom": champs.get("plat_nom"),
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
        for rang, vehicule in enumerate(vehicules, start=1):
            base.ajouter_ligne_vehicule(tid, vehicule, ordre=rang)
        # Le site d'une agence vend les mêmes circuits que sa page Facebook :
        # sans cette boucle, `analyser_site` les lisait et personne ne les
        # écrivait.
        for rang, circuit in enumerate(champs.get("lignes_circuit") or [], start=1):
            for cote, cle in (("depart", "depart_id"), ("arrivee", "arrivee_id")):
                lieu = diako.rapprocher_lieu(circuit.get(cote) or "")
                circuit[cle] = lieu["id"] if lieu else None
            base.ajouter_ligne_circuit(tid, circuit, ordre=rang)

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
            + (f", {len(vehicules)} véhicule(s)" if vehicules else "")
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
            # ⭐ DE QUEL GROUPE OU PAGE ELLE VIENT. Sans cette clé, une
            #   trouvaille publiée ne pouvait créditer personne : le compteur
            #   `publiees` des candidats — « la meilleure preuve » selon son
            #   propre commentaire — restait à zéro pour tout le monde.
            "origine_cle": ((publication.get("origine") or {}).get("cle") or None),
            "publie_le": publication.get("heure", ""),
            "date_post": date_de_publication(publication.get("heure", "")),
            # La signature du contenu : c'est elle qui empêchera la prochaine
            # collecte de rapporter une huitième fois le même menu.
            "empreinte_texte": empreinte_texte(publication["texte"]),
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
                champs = analyse_llm.fusionner(
                    champs, analyse_llm.relire(texte, cfg), texte=texte, cfg=cfg
                )
            except analyse_llm.LLMIndisponible as e:
                base.logguer(f"Relecture IA indisponible ({e}) — lecture simple.", "avert")

        # Le plat du référentiel cité (s'il n'y en a qu'un) : c'est ce lien qui
        # laisse la photo d'un récit illustrer la fiche du plat.
        if not champs.get("plat_id"):
            plat_cite = diako.plat_dans_le_texte(texte)
            if plat_cite:
                champs["plat_id"], champs["plat_nom"] = plat_cite["id"], plat_cite["nom"]

        # -- Photos (le CDN, hors navigateur, en parallèle)
        gardees = _telecharger_photos(publication.get("images") or [], dossier, tid, cfg)

        # -- Lecture d'une carte photographiée
        # C'est ici que se joue le trou le plus large de Diako : 4 lignes de
        # carte pour 1 862 restaurants, parce qu'une carte se publie en photo.
        if cfg.get("llm_actif") and cfg.get("llm_vision", True) and gardees:
            champs = self._lire_la_carte(tid, dossier, texte, champs, cfg)

        # ⭐ DEUXIÈME PASSAGE DU FILTRE IMMOBILIER, et il n'est pas redondant.
        #   Dans le fil, `_parcourir` juge un texte parfois coupé à « Voir plus »
        #   quand le dépliage a échoué ; ici le texte est complet, et une vente
        #   de terrain dont l'annonce commençait par « MAGNIFIQUE VUE SUR
        #   SARODRANO » ne se démasque qu'à la ligne suivante.
        immo = extraction.raisons_immobilier(texte)
        if immo:
            self._compter_ecart("ecartes_immobilier")
            base.logguer(
                f"Annonce immobilière écartée ({', '.join(immo)}) : "
                f"« {_debut(texte)} »", "info",
            )
            base.supprimer(tid)
            shutil.rmtree(dossier, ignore_errors=True)
            return
        if champs.get("genre") == "rien":
            # Se dit à voix haute, comme l'immobilier : un filtre muet qui se
            # trompe ne se corrige jamais.
            self._compter_ecart("ecartes_hors_sujet")
            base.logguer(
                f"Hors sujet ({champs.get('motif_classement') or 'rien à en tirer'}) : "
                f"« {_debut(texte)} »", "info",
            )
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
            # ⭐ Deuxième repli du lieu : un récit sur les Tsingy sans nom de
            #   ville hérite du lieu du parc. Sans ça, la trouvaille restait
            #   « incomplète » alors que le référentiel savait où c'est.
            if not rapprochement.get("lieu_id"):
                repli = diako.lieu_par_repli({"site_id": site["id"]})
                if repli:
                    rapprochement.update({
                        "lieu_id": repli["id"], "lieu_nom": repli["nom"],
                        "lieu_score": None,
                    })
                    base.logguer(
                        f"Lieu hérité de {repli['origine']} : "
                        f"« {repli['nom'] or repli['id']} ».", "info",
                    )

        # -- Ce qui manque pour publier
        manques = self._manques(champs, rapprochement, gardees)
        bloquants = [m for m in manques if m in ("lieu", "établissement", "date", "photo")]
        statut = "incomplete" if bloquants else "a_trier"
        if bloquants and not cfg.get("garder_les_incompletes", True):
            base.supprimer(tid)
            shutil.rmtree(dossier, ignore_errors=True)
            return

        # ⚠ PEUT ÊTRE VIDE, ET C'EST VOULU. `date_post` ne vaut plus « ce
        #   matin » par défaut : quand Facebook n'a pas livré de date, la
        #   trouvaille n'en porte aucune, `prix_vu_le` reste vide et
        #   `posts.price_on` part à NULL. Un tarif sans date de relevé se
        #   remarque et se corrige ; un tarif de 2019 daté d'aujourd'hui, non.
        date_post = base.trouvaille(tid).get("date_post") or ""
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
            "plat_id": champs.get("plat_id"),
            "plat_nom": champs.get("plat_nom"),
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

        # -- La grille d'un loueur de véhicules -> `vehicle_offers` à la
        #    publication. Elle n'existait pas : 24 trouvailles location_vehicule
        #    sans une seule ligne tarifaire.
        for rang, vehicule in enumerate(champs.get("lignes_vehicule") or [], start=1):
            base.ajouter_ligne_vehicule(tid, vehicule, ordre=rang)

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
                    # ⚠ `doublon_de`, PAS `cible_id`. `cible_id` veut dire « cette
                    #   trouvaille a été publiée là » : rempli ici, il faisait
                    #   refuser la publication d'un doublon requalifié à la main
                    #   avec « Déjà publiée : None » (14 lignes le 02/09/2026).
                    base.modifier(tid, {
                        "statut": "doublon", "doublon_de": f"events:{evt_id}",
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
        # ⚠ Une fiche nourrie par une publicité ou des vœux de fête ne reçoit
        #   PAS ce texte en présentation : « Réveillon 2025, menu à 150 000 Ar »
        #   n'est pas la description d'un restaurant. Le contact, les plats et
        #   les prix, oui ; le discours, non.
        motif = champs.get("motif_classement") or ""
        texte_publicitaire = any(m in motif for m in ("calendaire", "offre", "voyage organisé"))
        base.modifier(tid, {
            "titre": champs.get("titre_evt") or redaction.titre(t),
            "resume": t.get("resume") or redaction.resume_fiche(t),
            "presentation": redaction.presentation(t)
            if t["genre"] == "etablissement" and not texte_publicitaire else None,
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
                        # Sans lui, le score accordait 45 points « premiers
                        # tarifs » à toute grille, même sur une fiche déjà tarifée.
                        "nb_chambre": meilleur.get("nb_chambre") or 0,
                    },
                })

        # ⭐ REPLI DU LIEU : hériter de la fiche rattachée. Le texte ne cite pas
        #   toujours la ville, mais la fiche de l'annuaire, elle, porte son
        #   `place_id` — et si la fiche est la bonne, son lieu l'est aussi.
        #   C'est ce qui manquait aux 85 trouvailles bloquées « sans lieu ».
        if not sortie["lieu_id"] and sortie["page_id"]:
            repli = diako.lieu_par_repli({"page_id": sortie["page_id"]})
            if repli:
                sortie.update({"lieu_id": repli["id"], "lieu_nom": repli["nom"],
                               "lieu_score": None})
                base.logguer(
                    f"Lieu hérité de {repli['origine']} : "
                    f"« {repli['nom'] or repli['id']} ».", "info",
                )
        return sortie

    def _manques(self, champs: dict, rapprochement: dict, nb_photos: int) -> list[str]:
        """Ce qui empêche de publier, exprimé comme l'interface l'affichera."""
        manques = []
        genre = champs.get("genre")

        # ⚠ LE LIEU NE BLOQUE QUE LA CRÉATION D'UNE FICHE. Un récit ou un
        #   événement sans lieu se publie (la publication ne l'exige pas) ; le
        #   score, lui, le pénalise. Exiger le lieu partout retenait 79
        #   trouvailles publiables en « incomplète » (mesuré le 02/09/2026).
        if not rapprochement.get("lieu_id") and (
            genre == "etablissement" or (genre == "carte" and not rapprochement.get("page_id"))
        ):
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
        if not self._peut_ouvrir_chromium(cfg, "Prospection de sources"):
            raise RuntimeError("Pas assez de mémoire pour ouvrir le navigateur.")
        self.etat.update(actif=True, source="prospection de sources", trouvees=0)
        try:
            # Même verrou que la collecte : c'est le même Chromium, la même
            # machine, et les mêmes bots frères qui pourraient l'ouvrir.
            with verrou_navigateur.verrou_navigateur("diako") as pris:
                if not pris:
                    raise RuntimeError(
                        f"Le bot « {verrou_navigateur.qui() or '?'} » occupe le "
                        "navigateur — réessayez dans un moment."
                    )
                with sync_playwright() as pw:
                    ctx = self._contexte(pw, visible=cfg["navigateur_visible"])
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    try:
                        candidats = prospection.prospecter(
                            page, requetes=requetes, rappel=rappel, config=cfg,
                            arreter=self.stop.is_set,   # « Arrêter » la coupe aussi
                        )
                    finally:
                        with contextlib.suppress(Exception):
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
