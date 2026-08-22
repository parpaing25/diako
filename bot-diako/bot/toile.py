"""Le web ouvert : trouver les sites des établissements, et y lire les tarifs.

Facebook donne de la vie — des photos, des ouvertures, des récits. Il donne mal
les **tarifs structurés**. Un hôtel publie rarement sa grille de chambres sur sa
page ; il la met sur son site. Or Diako compte **1 442 hôtels sans le moindre
tarif** et 1 858 restaurants sans carte : c'est là que se trouve ce qui manque.

Ce module fait deux choses :

  1. **Trouver** les sites officiels — sans moteur de recherche ;
  2. **Les lire** — quelques pages, lentement, en respectant robots.txt.

🔴 D'OÙ VIENNENT LES ADRESSES, ET POURQUOI PAS D'AILLEURS.
   Le dépôt a déjà tranché la question des sources (scripts/moisson_osm.py) :
   **OSM Overpass et Nominatim, jamais Google Maps.** La licence ODbL autorise
   la réutilisation avec attribution ; Google Maps, TripAdvisor et Booking
   l'interdisent explicitement. On ne scrute donc AUCUN moteur de recherche et
   AUCUN agrégateur de réservation. Trois canaux, tous légitimes :

     · l'annuaire Diako lui-même — 193 fiches portent déjà un `website` ;
     · **OpenStreetMap** — 142 hébergements malgaches y déclarent leur site,
       plus les restaurants (mesuré le 23/08/2026 via Overpass) ;
     · les liens cités dans les publications Facebook déjà collectées.

   Ce qu'on lit ensuite, c'est le site **de l'établissement lui-même**, qui y
   publie ses propres prix. C'est la différence entre reprendre une information
   que quelqu'un diffuse sur lui-même, et piller la base d'un concurrent.

⚠ CE QU'ON NE PREND PAS À OSM : aucun prix, aucune note, aucun avis. OSM n'en
  porte pas de fiables, et la règle n° 1 du projet interdit d'en fabriquer.
"""
from __future__ import annotations

import html
import json
import re
import threading
import time
import urllib.robotparser
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests

from . import base, diako

AGENT = (
    "Mozilla/5.0 (compatible; DiakoBot/1.0; +https://diako.fonenako.mg) "
    "collecte de tarifs publics pour l'annuaire Diako"
)

# Un site d'hôtel malgache tient en quelques pages. Au-delà on ramasse des
# archives de blog, pas des tarifs.
PAGES_MAX = 8
OCTETS_MAX = 2_000_000
DELAI_ENTRE_PAGES = 2.0     # secondes, par hôte — on ne martèle personne
DELAI = 25                  # secondes avant d'abandonner une page

_robots: dict = {}
_verrou_robots = threading.Lock()
_dernier_appel: dict = {}
_verrou_cadence = threading.Lock()


# ── Politesse ───────────────────────────────────────────────────────────────
def _hote(url: str) -> str:
    return urlsplit(url).netloc.lower()


def robots_autorise(url: str) -> bool:
    """robots.txt, lu une fois par hôte et gardé en mémoire.

    ⚠ Un robots.txt injoignable vaut AUTORISATION, pas interdiction : beaucoup
      de petits sites malgaches n'en ont pas, et refuser par défaut reviendrait
      à ne rien collecter. Un robots.txt qui répond et qui interdit, en
      revanche, s'applique.
    """
    hote = _hote(url)
    with _verrou_robots:
        lecteur = _robots.get(hote)
        if lecteur is None:
            lecteur = urllib.robotparser.RobotFileParser()
            decoupe = urlsplit(url)
            lecteur.set_url(urlunsplit((decoupe.scheme, decoupe.netloc, "/robots.txt", "", "")))
            try:
                lecteur.read()
            except Exception:
                lecteur = False    # illisible : on considère que c'est ouvert
            _robots[hote] = lecteur
    if lecteur is False:
        return True
    try:
        return lecteur.can_fetch(AGENT, url)
    except Exception:
        return True


def _patienter(url: str) -> None:
    """Au moins DELAI_ENTRE_PAGES secondes entre deux pages du même hôte."""
    hote = _hote(url)
    with _verrou_cadence:
        precedent = _dernier_appel.get(hote, 0.0)
        attente = DELAI_ENTRE_PAGES - (time.time() - precedent)
        if attente > 0:
            time.sleep(attente)
        _dernier_appel[hote] = time.time()


# ── Récupération et mise à plat du HTML ─────────────────────────────────────
def _decoder(reponse: requests.Response) -> str:
    """Décode une page HTML sans se fier à l'en-tête.

    ⚠ `requests` retombe sur ISO-8859-1 dès qu'un `text/html` n'annonce pas son
      encodage — ce qui transforme « Chambre supérieure » en « supÃ©rieure » et
      fait rater tous les accents des noms de plats.
    """
    octets = reponse.content[:OCTETS_MAX]
    declare = re.search(rb'charset=["\']?\s*([\w-]+)', octets[:4000], re.I)
    for encodage in (
        (declare.group(1).decode("ascii", "ignore") if declare else None),
        reponse.encoding if (reponse.encoding or "").lower() != "iso-8859-1" else None,
        "utf-8",
    ):
        if not encodage:
            continue
        try:
            return octets.decode(encodage, "strict")
        except (LookupError, UnicodeDecodeError):
            continue
    return octets.decode("utf-8", "replace")


def recuperer(url: str, session: requests.Session | None = None,
              rendu=None) -> tuple[str, str]:
    """Rend (html, url_finale). Chaîne vide si ce n'est pas une page lisible.

    `rendu` est une fonction url -> html fournie par le collecteur pour les
    sites qui ne rendent rien sans JavaScript. robots.txt et la cadence
    s'appliquent des deux côtés : passer par un navigateur ne dispense de rien.
    """
    if not robots_autorise(url):
        return "", url
    _patienter(url)
    if rendu is not None:
        try:
            code = rendu(url)
        except Exception:
            code = ""
        return (code or ""), url
    session = session or requests
    try:
        r = session.get(url, headers={"User-Agent": AGENT,
                                      "Accept-Language": "fr,en;q=0.8"},
                        timeout=DELAI, allow_redirects=True)
    except requests.RequestException:
        return "", url
    if not r.ok:
        return "", r.url
    if "html" not in r.headers.get("Content-Type", "").lower():
        return "", r.url
    return _decoder(r), r.url


BLOCS = {"p", "div", "br", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5",
         "h6", "section", "article", "header", "footer", "table", "ul", "ol"}
MUETS = {"script", "style", "noscript", "svg", "head", "iframe", "form"}


class _Texte(HTMLParser):
    """HTML -> texte, en gardant la structure en lignes.

    ⚠ LES SAUTS DE LIGNE NE SONT PAS COSMÉTIQUES : `extraction.lignes_de_carte`
      lit LIGNE PAR LIGNE (« Ravitoto ..... 12 000 Ar »). Aplatir la page en un
      seul paragraphe rendrait toute carte illisible.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.morceaux: list[str] = []
        self.liens: list[tuple[str, str]] = []
        self.images: list[str] = []
        self._muet = 0
        self._lien: str | None = None
        self._libelle: list[str] = []

    def handle_starttag(self, tag, attrs):
        attributs = dict(attrs)
        if tag in MUETS:
            self._muet += 1
        elif tag in BLOCS:
            self.morceaux.append("\n")
        elif tag == "a":
            self._lien = attributs.get("href")
            self._libelle = []
        elif tag == "img":
            # ⚠ `data-src` AVANT `src` : les sites à chargement différé mettent
            #   un pixel transparent dans `src` et la vraie image dans
            #   `data-src`. Lire `src` d'abord ne ramène que des pixels vides.
            source = (attributs.get("data-src") or attributs.get("data-lazy-src")
                      or attributs.get("src"))
            if source:
                self.images.append(source)
        elif tag == "meta" and attributs.get("property") in (
            "og:image", "twitter:image"
        ):
            if attributs.get("content"):
                # L'image de partage est choisie par l'établissement lui-même :
                # c'est la meilleure candidate à une couverture.
                self.images.insert(0, attributs["content"])

    def handle_endtag(self, tag):
        if tag in MUETS:
            self._muet = max(0, self._muet - 1)
        elif tag in BLOCS:
            self.morceaux.append("\n")
        elif tag == "a":
            if self._lien:
                self.liens.append((self._lien, " ".join(self._libelle).strip()))
            self._lien, self._libelle = None, []

    def handle_data(self, data):
        if self._muet:
            return
        self.morceaux.append(data)
        if self._lien is not None:
            self._libelle.append(data.strip())


def mettre_a_plat(code: str) -> tuple[str, list[tuple[str, str]], list[str]]:
    """Rend (texte lisible, liens [(href, libellé)], images [src])."""
    lecteur = _Texte()
    try:
        lecteur.feed(code)
    except Exception:
        pass
    texte = html.unescape("".join(lecteur.morceaux))
    texte = re.sub(r"[ \t\xa0]+", " ", texte)
    texte = re.sub(r" *\n *", "\n", texte)
    texte = re.sub(r"\n{3,}", "\n\n", texte)
    return texte.strip(), lecteur.liens, lecteur.images


# Les gabarits, logos et pictogrammes ne sont pas des photos d'établissement.
IMAGES_REFUSEES = re.compile(
    r"logo|icon|favicon|sprite|pixel|spacer|placeholder|avatar|flag|drapeau"
    r"|banner-?ad|wp-content/plugins|/emoji|badge|button|arrow|fleche",
    re.I,
)


def images_utiles(sources: list[str], base_url: str) -> list[str]:
    """Les images plausibles d'un établissement, dans l'ordre où on les prendra.

    ⚠ ON NE PEUT PAS CONNAÎTRE LA TAILLE ICI : le HTML ne la donne presque
      jamais. Le tri définitif se fait au téléchargement, sur le poids réel du
      fichier et les dimensions lues par Pillow — le même garde-fou que pour
      les photos Facebook.
    """
    gardees, vues = [], set()
    for source in sources:
        if not source or source.startswith("data:"):
            continue
        absolu = urljoin(base_url, source.split("?")[0])
        if not re.search(r"\.(jpe?g|png|webp)$", absolu, re.I):
            continue
        if IMAGES_REFUSEES.search(absolu):
            continue
        if absolu in vues:
            continue
        vues.add(absolu)
        gardees.append(absolu)
    return gardees


# ── Quelles pages valent le détour ──────────────────────────────────────────
# Le poids dit dans quel ordre on visite. Une page « tarifs » vaut dix pages
# « à propos ».
MOTS_PAGES = (
    (14, r"tarif|rate|price|prix|pricing"),
    (12, r"chambre|room|accommodation|hebergement|hébergement|bungalow|suite"),
    (12, r"menu|carte|restaurant|cuisine|food|dining"),
    (6, r"reserv|booking|contact|nous-joindre"),
    (4, r"excursion|activit|circuit|tour"),
    (2, r"propos|about|presentation|présentation|accueil|home"),
)
EXTENSIONS_REFUSEES = re.compile(
    r"\.(jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|avi|css|js)(\?|$)", re.I
)

# 🔴 « MENU » NE VEUT PAS DIRE CARTE. Sur le web, `sitemenu.htm`, `menu-nav` ou
#    `mainmenu` sont des cadres de NAVIGATION. Mesuré sur campcatta.com : le
#    robot y a dépensé quatre pages de son budget sur `sitemenu.htm`,
#    `sitemenu-ita.htm`, `sitemenu-eng.htm` et `sitemenu-all.htm` — c'est-à-dire
#    le même menu de navigation en quatre langues — sans lire une seule carte.
NAVIGATION = re.compile(
    r"sitemenu|menu[-_]?(nav|bar|principal|haut|gauche)|(?:main|top|left|nav)[-_]?menu"
    r"|menu\.(js|css)", re.I
)

# Les versions étrangères d'une même page : on en lit une, pas cinq.
LANGUES_ETRANGERES = re.compile(
    r"[-_/](ita|eng|deu|all|esp|nld|rus|chi|jpn|it|de|es|nl|ru|zh|ja|pt)"
    r"(\.(htm|html|php|asp)|/|$)", re.I
)


def _propre(url: str) -> str:
    decoupe = urlsplit(url)
    return urlunsplit((decoupe.scheme, decoupe.netloc, decoupe.path, decoupe.query, ""))


def pages_a_visiter(liens, base_url: str, deja: set[str]) -> list[tuple[int, str]]:
    """Trie les liens internes par intérêt. Les PDF sont signalés, pas suivis."""
    hote = _hote(base_url)
    notes: dict[str, int] = {}
    for href, libelle in liens:
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        absolu = _propre(urljoin(base_url, href))
        if _hote(absolu) != hote or absolu in deja:
            continue
        if EXTENSIONS_REFUSEES.search(absolu) or NAVIGATION.search(absolu):
            continue
        if LANGUES_ETRANGERES.search(absolu):
            continue
        piste = (absolu + " " + (libelle or "")).lower()
        note = max((poids for poids, motif in MOTS_PAGES if re.search(motif, piste)),
                   default=0)
        if note and note > notes.get(absolu, 0):
            notes[absolu] = note
    return sorted(((n, u) for u, n in notes.items()), reverse=True)


def pdf_trouves(liens, base_url: str) -> list[str]:
    """Les PDF qui ressemblent à une carte ou à une grille de tarifs.

    ⚠ ON NE LES LIT PAS. Le bot n'embarque pas de lecteur PDF, et en ajouter un
      pour trois fichiers serait cher. On les SIGNALE : c'est une piste que la
      personne qui trie peut ouvrir en un clic, pas un trou silencieux.
    """
    interessants = []
    for href, libelle in liens:
        absolu = urljoin(base_url, href or "")
        if not absolu.lower().split("?")[0].endswith(".pdf"):
            continue
        piste = (absolu + " " + (libelle or "")).lower()
        if re.search(r"menu|carte|tarif|rate|price|chambre|room", piste):
            interessants.append(absolu)
    return interessants[:5]


# ── Exploration d'un site ───────────────────────────────────────────────────
def explorer(url: str, pages_max: int = PAGES_MAX, rendu=None) -> dict:
    """Lit quelques pages d'un site et rend ce qu'on y a trouvé.

    Rend {texte, titre, pages, pdf, refuse}. `texte` est la concaténation des
    pages visitées, séparées par des titres : c'est ce qui part ensuite dans
    `extraction` puis dans le modèle.
    """
    session = requests.Session()
    depart = url if url.startswith(("http://", "https://")) else "https://" + url

    code, finale = recuperer(depart, session, rendu)
    if not code:
        # Beaucoup de petits sites malgaches n'ont pas de HTTPS valide.
        if depart.startswith("https://"):
            code, finale = recuperer("http://" + depart[8:], session, rendu)
        if not code:
            return {"texte": "", "titre": "", "pages": [], "pdf": [], "images": [],
                    "js_probable": False,
                    "refuse": "page d'accueil illisible (ou robots.txt l'interdit)"}

    # ⚠ Mesuré ICI, sur l'accueil : `code` sera écrasé par les pages suivantes,
    #   et c'est bien l'accueil qui dit si le site a besoin de JavaScript.
    taille_accueil = len(code)
    texte, liens, images = mettre_a_plat(code)
    titre = ""
    balise = re.search(r"<title[^>]*>(.*?)</title>", code, re.I | re.S)
    if balise:
        titre = html.unescape(re.sub(r"\s+", " ", balise.group(1))).strip()[:160]

    vues = {_propre(finale)}
    morceaux = [texte]
    pdf = pdf_trouves(liens, finale)
    toutes_images = images_utiles(images, finale)
    visitees = [finale]

    file = pages_a_visiter(liens, finale, vues)
    while file and len(visitees) < pages_max:
        _, suivante = file.pop(0)
        if suivante in vues:
            continue
        vues.add(suivante)
        code, reelle = recuperer(suivante, session, rendu)
        if not code:
            continue
        texte_page, liens_page, images_page = mettre_a_plat(code)
        if len(texte_page) < 120:
            continue
        visitees.append(reelle)
        morceaux.append(f"\n\n=== {suivante} ===\n{texte_page}")
        pdf.extend(p for p in pdf_trouves(liens_page, reelle) if p not in pdf)
        toutes_images.extend(
            i for i in images_utiles(images_page, reelle) if i not in toutes_images
        )
        # Une page « tarifs » en ouvre souvent une autre plus précise.
        for note, lien in pages_a_visiter(liens_page, reelle, vues):
            if note >= 12 and lien not in vues:
                file.append((note, lien))
        file.sort(reverse=True)

    complet = "\n".join(morceaux)[:120_000]
    # 🔴 UN SITE QUI REND DU HTML MAIS AUCUN TEXTE EST UN SITE EN JAVASCRIPT.
    #    Mesuré sur zomatel-madagascar.com : zéro caractère extrait alors que le
    #    `<title>` se lit parfaitement. Le signaler permet au collecteur de
    #    repasser avec le navigateur — sans quoi la moitié des hôtels modernes
    #    (Wix, Squarespace, Jimdo) ne rendraient jamais rien.
    return {
        "texte": complet,
        "titre": titre,
        "pages": visitees,
        "pdf": pdf[:5],
        "images": toutes_images[:30],
        "js_probable": bool(rendu is None and taille_accueil > 4000 and len(complet) < 400),
        "refuse": "",
    }


# ── Découverte : où sont les sites ? ────────────────────────────────────────
MIROIRS_OSM = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)

# ⚠ `["ISO3166-1"="MG"]` et non `["name"="Madagascar"]` : le nom peut être
#   écrit « Madagasikara » selon la langue de l'objet, le code pays non.
GABARIT_OSM = """[out:json][timeout:180];
area["ISO3166-1"="MG"][admin_level=2]->.a;
(
  nwr(area.a)["tourism"~"^(hotel|guest_house|hostel|chalet|motel|resort|apartment)$"]["%(cle)s"];
  nwr(area.a)["amenity"~"^(restaurant|cafe|bar|fast_food)$"]["%(cle)s"];
);
out center 3000;
"""


def sites_osm() -> list[dict]:
    """Les établissements malgaches qui déclarent un site web dans OSM.

    Deux clés à interroger : `website` et `contact:website` cohabitent dans OSM
    et ne désignent pas les mêmes objets. N'en lire qu'une en perd la moitié.
    """
    trouves: dict[str, dict] = {}
    for cle in ("website", "contact:website"):
        elements = _interroger_osm(GABARIT_OSM % {"cle": cle})
        for element in elements:
            etiquettes = element.get("tags") or {}
            nom = (etiquettes.get("name") or "").strip()
            site = (etiquettes.get(cle) or "").strip()
            if not nom or not site:
                continue
            if not site.startswith(("http://", "https://")):
                site = "https://" + site
            trouves.setdefault(site.rstrip("/"), {
                "nom": nom, "site": site.rstrip("/"),
                "genre_osm": etiquettes.get("tourism") or etiquettes.get("amenity"),
                "telephone": etiquettes.get("phone") or etiquettes.get("contact:phone"),
                "origine": "osm",
            })
    return list(trouves.values())


def _interroger_osm(requete: str) -> list:
    """Overpass, avec ses miroirs et ses limites de débit.

    ⚠ Overpass rend un **429** quand on enchaîne : ce n'est pas une panne, c'est
      une file d'attente. On change de miroir, puis on patiente. Sans ça, la
      deuxième requête de la moisson revient vide et on croit qu'OSM ne connaît
      aucun restaurant.
    """
    dernier = ""
    for essai, url in enumerate((*MIROIRS_OSM, *MIROIRS_OSM)):
        try:
            r = requests.post(url, data=requete.encode("utf-8"),
                              headers={"User-Agent": AGENT}, timeout=240)
            if r.status_code == 429:
                dernier = "429 (file d'attente Overpass)"
                time.sleep(20 + 20 * essai)
                continue
            if not r.ok:
                dernier = f"HTTP {r.status_code}"
                continue
            return r.json().get("elements", [])
        except Exception as e:
            dernier = str(e)[:120]
        time.sleep(5)
    base.logguer(f"Overpass injoignable ({dernier}).", "avert")
    return []


def sites_du_referentiel() -> list[dict]:
    """Les sites déjà inscrits sur les fiches Diako — le canal le plus sûr.

    Ils sont déjà rattachés à leur fiche : aucun rapprochement à faire, aucune
    erreur possible sur l'établissement.
    """
    trouves = []
    for fiche in base.referentiel("ref_pages"):
        site = (fiche.get("site_web") or "").strip()
        if not site:
            continue
        if not site.startswith(("http://", "https://")):
            site = "https://" + site
        trouves.append({
            "nom": fiche["nom"], "site": site.rstrip("/"),
            "page_id": fiche["id"], "page_nom": fiche["nom"],
            "origine": "annuaire",
        })
    return trouves


def sites_des_trouvailles() -> list[dict]:
    """Les sites relevés dans les publications Facebook déjà collectées."""
    with base._verrou, base.connexion() as cx:
        lignes = cx.execute(
            "SELECT DISTINCT site_web, nom_etab, page_id, page_nom FROM trouvailles "
            "WHERE site_web IS NOT NULL AND site_web <> '' "
            "AND statut NOT IN ('rejetee', 'doublon')"
        ).fetchall()
    return [
        {"nom": l["nom_etab"] or l["page_nom"] or l["site_web"],
         "site": l["site_web"].rstrip("/"), "page_id": l["page_id"],
         "page_nom": l["page_nom"], "origine": "facebook"}
        for l in lignes
    ]


HOTES_REFUSES = re.compile(
    r"(facebook|instagram|tiktok|youtube|twitter|x\.com|linkedin|wa\.me|whatsapp"
    r"|booking\.com|tripadvisor|expedia|airbnb|agoda|hotels\.com|google\.)",
    re.I,
)


def moissonner(avec_osm: bool = True, journal=None) -> dict:
    """Trouve des sites et les inscrit comme sources, rattachés à leur fiche.

    ⚠ ON ÉCARTE LES AGRÉGATEURS ET LES RÉSEAUX. Booking, TripAdvisor, Agoda et
      consorts interdisent la réutilisation de leurs données dans leurs
      conditions ; une page Facebook n'est pas un site et se collecte déjà
      autrement. Ce qui reste, c'est le site de l'établissement lui-même.
    """
    dire = journal or (lambda message, niveau="info": base.logguer(message, niveau))

    candidats = sites_du_referentiel() + sites_des_trouvailles()
    dire(f"{len(candidats)} site(s) déjà connu(s) de Diako ou des trouvailles.")
    if avec_osm:
        dire("Interrogation d'OpenStreetMap (peut prendre deux minutes)…")
        depuis_osm = sites_osm()
        dire(f"{len(depuis_osm)} établissement(s) déclarent un site dans OSM.")
        candidats += depuis_osm

    ajoutes, rattaches, ignores, deja = 0, 0, 0, 0
    vus: set[str] = set()
    for candidat in candidats:
        site = candidat["site"]
        if not site or site in vus:
            continue
        vus.add(site)
        if HOTES_REFUSES.search(_hote(site)):
            ignores += 1
            continue
        if base.source_connue(site):
            deja += 1
            continue

        page_id = candidat.get("page_id") or ""
        page_nom = candidat.get("page_nom") or ""
        if not page_id:
            # Un site venu d'OSM ne sait pas encore à quelle fiche il appartient.
            # On applique le MÊME rapprochement que pour Facebook — et la même
            # prudence : sous le seuil, on inscrit la source sans fiche, et
            # c'est la trouvaille qui posera la question.
            proches = diako.rapprocher_page(candidat["nom"], seuil=0.6, combien=1)
            if proches and proches[0]["score"] >= 0.78:
                page_id, page_nom = proches[0]["id"], proches[0]["nom"]
                rattaches += 1

        base.ajouter_source(
            nom=(page_nom or candidat["nom"])[:80], url=site, genre="site",
            page_id=page_id, page_nom=page_nom, origine=candidat.get("origine", "osm"),
        )
        ajoutes += 1

    dire(
        f"Moisson terminée : {ajoutes} site(s) ajouté(s) aux sources "
        f"({rattaches} rattaché(s) à une fiche par rapprochement), "
        f"{deja} déjà connu(s), {ignores} écarté(s) (réseaux et agrégateurs).",
        "succes",
    )
    return {"ajoutes": ajoutes, "rattaches": rattaches, "deja": deja,
            "ignores": ignores, "examines": len(vus)}
