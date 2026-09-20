"""Les textes des publications Di'ako — écriture et contrôles de langue.

Deux compétences : `rediger_publication` (le texte d'une publication Facebook) et
`idees_publications` (des sujets tirés du CONTENU RÉEL du site). Les deux rendent un
`Resultat` ; c'est le cerveau qui parle à Telegram.

Le texte produit a la forme exacte que `marketing/atelier/verifier.py` contrôle, parce
que c'est lui qui refuse une publication avant qu'elle parte :

    📍 Titre — Sous-titre malgache 🌊🇲🇬     ← l'icône de la rubrique, seule, en tête
    <corps, un bloc par paragraphe>
    🙋 <la question>
    👉 <appel> : https://diako.fonenako.mg/...?utm_content=<clé>
    📷 Photos : <auteurs> — Wikimedia Commons, licences libres
    #Diako #A #B #C #D                      ← cinq, #Diako en tête

⚠ RÈGLES DE LANGUE, NON NÉGOCIABLES (malgache)
  · une question FERMÉE prend la particule « ve » : « Efa nandeha tany Ampefy ve
    ianao ? ». Les alternatives en « sa » n'en prennent pas ;
  · aucun mot hors de l'alphabet malgache : ni c, u, q, w, x, ç. Un mot étranger
    est massacré par la synthèse vocale et lu de travers à l'écrit
    (caution → antoka, condition → fepetra). Les noms propres sont admis ;
  · TOUT malgache produit ici est à FAIRE RELIRE PAR ANDRY avant publication.
    Le dire dans le résultat, à chaque fois.

⚠ AUCUN CHIFFRE INVENTÉ. Un nombre n'entre dans un texte que s'il vient du paramètre
  `chiffres`, fourni par l'appelant après un comptage réel. Sans `chiffres`, le texte
  n'en porte aucun, et tout nombre qui apparaîtrait quand même est signalé comme
  défaut bloquant. *Incident Fonenako du 03/09/2026 : « 2000 annonces » annoncé pour
  1 878 en base — une promesse fausse, vérifiable par n'importe quel visiteur.*
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import requests

from . import config
from .competences import Resultat, competence

API_ANTHROPIC = "https://api.anthropic.com/v1/messages"

# Les neuf icônes que verifier.py accepte en tête de texte, et leur rubrique.
RUBRIQUES: dict[str, tuple[str, str]] = {
    "lieu": ("📍", "Lieux emblématiques"),
    "site": ("🧭", "Découvrir Diako"),
    "legende": ("📖", "Légendes et récits"),
    "evenement": ("📅", "Fêtes et saisons"),
    "culture": ("🎭", "Culture"),
    "plat": ("🍲", "Cuisine malgache"),
    "musique": ("🎶", "Musique"),
    "histoire": ("📜", "Histoire"),
    "conseil": ("🙏", "Conseils de voyage"),
}
ICONES = {icone for icone, _ in RUBRIQUES.values()}

UTM = "utm_source=facebook&utm_medium=post&utm_campaign={campagne}&utm_content={cle}"
HASHTAGS_SOCLE = ["#Diako", "#Madagascar", "#VoyageMadagascar"]
HASHTAGS_APPOINT = ["#TourismeMadagascar", "#Mitsangatsangana", "#Diakomada"]

# ── Chiffres ──────────────────────────────────────────────────────────────
# ⚠ Les espaces de milliers ne sont pas toutes l'espace ordinaire : Intl et les
#   copier-coller apportent l'insécable, la fine insécable et l'espace chiffre.
#   Écrites en chr() plutôt qu'en séquence \u : l'outil Write décode les \uXXXX et
#   poserait le caractère réel dans la source (incident du 18/09/2026).
ESPACES = "".join(chr(c) for c in (0x00A0, 0x202F, 0x2007, 0x2009))
_NOMBRE = re.compile(r"\d+(?:[ ." + ESPACES + r"]\d{3})+|\d+")
# Les lignes de service ne portent pas de fait : le lien (slugs, utm) et les hashtags.
_LIGNES_DE_SERVICE = ("👉", "📷", "#", "📱")

# ── Malgache ──────────────────────────────────────────────────────────────
HORS_ALPHABET = re.compile(r"[cquwxç]", re.I)
# Les mots qui ouvrent une question OUVERTE : celles-là ne prennent pas « ve ».
INTERROGATIFS_MG = ("iza", "inona", "aiza", "oviana", "ahoana", "firy", "nahoana",
                    "avy aiza", "manao ahoana", "hatraiza", "impiry")
# Une question fermée attestée sur la page : « Efa nilomano tao amin'ny … ve ianao ? »
QUESTIONS_MG = {
    "lieu": "Efa nandeha tany {sujet} ve ianao ?",
    "plat": "Efa nanandrana {sujet} ve ianao ?",
    "site": "Efa nijery ny Diako ve ianao ?",
}
QUESTIONS_FR = {
    "lieu": "Et vous, vous y êtes déjà allé ?",
    "plat": "Et vous, vous en avez déjà mangé ?",
    "site": "Et vous, vous cherchez quoi en premier avant de partir ?",
}


# ─────────────────────────── petits outils ───────────────────────────

def _texte(valeur: Any) -> str:
    """Le modèle envoie des chaînes ; un appel Python peut envoyer autre chose."""
    if valeur is None:
        return ""
    if isinstance(valeur, (list, tuple)):
        return "\n\n".join(_texte(v) for v in valeur if v)
    if isinstance(valeur, dict):
        return json.dumps(valeur, ensure_ascii=False)
    return str(valeur).strip()


def _blocs(valeur: Any) -> list[str]:
    """Une liste de paragraphes, quelle que soit la forme reçue."""
    if valeur is None or valeur == "":
        return []
    if isinstance(valeur, (list, tuple)):
        return [_texte(v) for v in valeur if _texte(v)]
    brut = _texte(valeur)
    if brut.startswith("["):
        try:
            return _blocs(json.loads(brut))
        except json.JSONDecodeError:
            pass
    decoupe = re.split(r"\n\s*\n", brut) if "\n\n" in brut else brut.splitlines()
    return [b.strip() for b in decoupe if b.strip()]


def _mots(valeur: Any) -> list[str]:
    if isinstance(valeur, (list, tuple)):
        return [_texte(v) for v in valeur if _texte(v)]
    return _texte(valeur).replace(",", " ").split()


def _entier(valeur: Any, defaut: int) -> int:
    chiffres = re.sub(r"\D", "", _texte(valeur))
    return int(chiffres) if chiffres else defaut


def sans_accent(texte: str) -> str:
    return unicodedata.normalize("NFD", texte or "").encode("ascii", "ignore").decode()


def cle_de(titre: str) -> str:
    """La clé d'une publication : elle sert de nom de dossier ET d'utm_content."""
    brut = re.sub(r"[^a-z0-9]+", "-", sans_accent(titre).lower()).strip("-")
    return brut[:40].strip("-") or "publication"


def hashtag_de(titre: str) -> str:
    mots = re.findall(r"[A-Za-z0-9]+", sans_accent(titre))
    return "#" + "".join(m.capitalize() for m in mots)[:28] if mots else ""


# ─────────────────────────── contrôles ───────────────────────────

def nombres(texte: str) -> list[str]:
    """Les nombres d'un texte, séparateurs de milliers retirés (« 3 377 » → « 3377 »)."""
    return [re.sub(r"\D", "", n) for n in _NOMBRE.findall(_texte(texte))]


def chiffres_non_sources(texte: str, chiffres: Any = "") -> list[str]:
    """Les nombres du texte qui ne figurent pas dans les chiffres fournis.

    Les lignes de service (lien, crédits photo, hashtags) sont écartées : un slug ou
    un utm peut porter des chiffres sans rien promettre au lecteur."""
    sources = set(nombres(_texte(chiffres)))
    vus: list[str] = []
    for ligne in _texte(texte).splitlines():
        if ligne.strip().startswith(_LIGNES_DE_SERVICE):
            continue
        for n in nombres(ligne):
            if n not in sources and n not in vus:
                vus.append(n)
    return vus


def mots_hors_alphabet(texte: str, noms_propres: Any = ()) -> list[str]:
    """Les mots qui portent c, u, q, w, x ou ç — hors noms propres admis."""
    admis = {sans_accent(m).lower().strip("'’") for m in _mots(noms_propres)}
    # un nom propre en plusieurs mots (« Diego-Suarez ») est admis mot à mot
    for m in list(admis):
        admis.update(re.findall(r"[a-z0-9]+", m))
    fautifs: list[str] = []
    for mot in re.findall(r"[\w'’-]+", _texte(texte)):
        nu = mot.lower().strip("'’-")
        if not nu or nu.isdigit() or not HORS_ALPHABET.search(nu):
            continue
        if sans_accent(nu) in admis or nu in admis:
            continue
        if nu not in fautifs:
            fautifs.append(nu)
    return fautifs


def defaut_particule_ve(question: str) -> str:
    """« » si la question malgache va ; sinon ce qui cloche.

    Une question FERMÉE (celle à laquelle on répond oui ou non) prend « ve ». Celles
    qui commencent par un interrogatif (inona, aiza…) sont ouvertes, et les
    alternatives en « sa » n'en prennent pas."""
    q = _texte(question).strip()
    if not q or not q.rstrip().endswith("?"):
        return ""
    nu = sans_accent(q).lower().lstrip("🙋 ").strip()
    nu = re.sub(r"^[^a-z]+", "", nu)
    if any(nu.startswith(i) for i in INTERROGATIFS_MG):
        return ""
    if re.search(r"\bsa\b", nu):
        return ""           # alternative : « … sa … ? » n'appelle pas « ve »
    if re.search(r"\bve\b", nu):
        return ""
    return "question fermée malgache sans la particule « ve »"


def controler_texte(texte: str, *, cle: str, lien: str = "", chiffres: Any = "",
                    noms_propres: Any = (), lignes_malgaches: Any = ()) -> list[str]:
    """Les défauts d'un texte de publication, dans l'ordre où ils se corrigent.

    Ce sont les mêmes contrôles que `marketing/atelier/verifier.py`, mais posés AVANT
    la fabrication : une faute vue ici coûte un mot, vue là-bas elle coûte une série."""
    defauts: list[str] = []
    lignes = _texte(texte).splitlines()
    if not lignes:
        return ["texte vide"]
    premier = lignes[0].split(" ", 1)[0]
    if premier not in ICONES:
        defauts.append(f"le texte ne commence pas par l'icône d'une rubrique ({premier!r})")
    if config.SITE not in texte:
        defauts.append("aucun lien vers le site")
    elif f"utm_content={cle}" not in texte:
        defauts.append(f"le lien ne porte pas utm_content={cle}")
    if lien and lien not in texte:
        defauts.append(f"le lien attendu ({lien}) n'est pas dans le texte")
    derniere = lignes[-1].split()
    if len(derniere) != 5 or derniere[0] != "#Diako" or not all(h.startswith("#") for h in derniere):
        defauts.append("la dernière ligne doit porter 5 hashtags, #Diako en tête")
    if not any("🙋" in l for l in lignes):
        defauts.append("aucune question (ligne 🙋)")
    for n in chiffres_non_sources(texte, chiffres):
        defauts.append(f"chiffre non sourcé : {n} — donne-moi `chiffres` ou retire-le")
    for ligne in _blocs(lignes_malgaches):
        for mot in mots_hors_alphabet(ligne, noms_propres):
            defauts.append(f"mot hors alphabet malgache : {mot}")
        faute = defaut_particule_ve(ligne)
        if faute:
            defauts.append(faute)
    if len(texte) > 2000:
        defauts.append(f"texte long : {len(texte)} caractères")
    return defauts


# ─────────────────────────── assemblage ───────────────────────────

def assembler(*, icone: str, titre: str, sous_titre_mg: str, emoji: str, corps: list[str],
              question: str, cta: str, lien: str, cle: str, hashtags: list[str],
              auteurs_photos: list[str] | None = None, campagne: str = "publication") -> str:
    """Le texte final, dans la forme de la page. Rien d'autre n'écrit cette forme."""
    tete = f"{icone} {titre}"
    if sous_titre_mg:
        tete += f" — {sous_titre_mg}"
    tete = f"{tete} {emoji}🇲🇬".replace("  ", " ").strip()
    adresse = config.SITE + (lien or "/")
    adresse += ("&" if "?" in adresse else "?") + UTM.format(campagne=campagne, cle=cle)
    blocs = [tete, *corps, "🙋 " + question.lstrip("🙋 ").strip(), f"👉 {cta} : {adresse}"]
    if auteurs_photos:
        uniques: list[str] = []
        for a in auteurs_photos:
            if a and a not in uniques:
                uniques.append(a)
        blocs.append("📷 Photos : " + " · ".join(uniques)
                     + " — Wikimedia Commons, licences libres (détail sur chaque image)")
    blocs.append(" ".join(hashtags))
    return "\n\n".join(b for b in blocs if b).strip()


def cinq_hashtags(titre: str, fournis: Any = "") -> list[str]:
    """Cinq hashtags, #Diako en tête : ni quatre, ni six — verifier.py compte."""
    liste = [h if h.startswith("#") else "#" + h for h in _mots(fournis) if h.strip("#")]
    if not liste or liste[0] != "#Diako":
        liste = ["#Diako"] + [h for h in liste if h != "#Diako"]
    propre = hashtag_de(titre)
    for candidat in [propre, *HASHTAGS_SOCLE[1:], *HASHTAGS_APPOINT]:
        if len(liste) >= 5:
            break
        if candidat and candidat not in liste:
            liste.append(candidat)
    return liste[:5]


# ─────────────────────────── le modèle ───────────────────────────

CONSIGNE_REDACTION = """Tu écris pour la page Facebook Di'ako, le réseau social du voyage à
Madagascar (site diako.fonenako.mg). Ton chaleureux, phrases courtes, jamais de superlatif
commercial, jamais de promesse de service que le site ne rend pas.

Tu rends UNIQUEMENT un objet JSON, sans un mot autour :
{"corps": ["paragraphe 1", "paragraphe 2", "paragraphe 3"],
 "question": "une question ouverte ou fermée posée au lecteur",
 "sous_titre_mg": "un sous-titre court en malgache",
 "hashtags": ["#Diako", "#Autre", "#Autre", "#Autre", "#Autre"]}

Règles absolues :
- AUCUN CHIFFRE que la liste « chiffres vérifiés » ne contient pas. Aucune date, aucune
  distance, aucun prix, aucune durée inventés. Sans chiffre vérifié, écris sans chiffre.
- AUCUN fait que les « faits connus » ne portent pas. Tu n'ajoutes rien de ta mémoire :
  une phrase jolie et fausse coûte la confiance de la page.
- Le malgache n'emploie ni c, ni u, ni q, ni w, ni x, ni ç. Une question fermée malgache
  prend la particule « ve » (« Efa nandeha tany Ampefy ve ianao ? »).
- Trois paragraphes au plus, deux phrases chacun. Pas de lien, pas de hashtag dans le
  corps : ils sont posés après toi."""


def _appeler_claude(systeme: str, demande: str, max_tokens: int = 1600) -> str | None:
    """Le modèle, s'il y a une clé. Sinon None — l'appelant sait écrire sans lui.

    ⚠ Appel HTTP brut, comme `cerveau.py` : le SDK anthropic n'est pas dans
      requirements.txt et ce bot ne doit pas dépendre d'un paquet de plus.
    ⚠ `output_config.effort` n'existe pas sur les modèles d'avant 2026 : un 400 au
      premier essai le fait retirer, au lieu de rendre « pas de modèle ».
    ⚠ Le CORPS de l'erreur est tracé, pas seulement le statut : un json_validate_failed
      ou un quota épuisé ne se lit pas dans un code HTTP (incident Groq du 03/09/2026)."""
    cle = config.cle_anthropic()
    reglages = config.charger()
    if not cle or reglages.get("cerveau") == "regles":
        return None
    corps: dict[str, Any] = {
        "model": reglages.get("modele_anthropic", "claude-sonnet-5"),
        "max_tokens": max_tokens,
        "system": systeme,
        "messages": [{"role": "user", "content": demande}],
        "output_config": {"effort": "low"},
    }
    entetes = {"x-api-key": cle, "anthropic-version": "2023-06-01",
               "content-type": "application/json"}
    for _ in range(2):
        try:
            r = requests.post(API_ANTHROPIC, headers=entetes, json=corps, timeout=120)
        except requests.RequestException as e:
            print(f"[redaction] Claude injoignable : {type(e).__name__} {e}")
            return None
        if r.ok:
            blocs = r.json().get("content", [])
            return "".join(b.get("text", "") for b in blocs if b.get("type") == "text").strip()
        if r.status_code == 400 and corps.pop("output_config", None) is not None:
            continue
        print(f"[redaction] Claude {r.status_code} : {r.text[:300]}")
        return None
    return None


def _json_du_modele(reponse: str | None) -> dict | None:
    if not reponse:
        return None
    morceau = re.search(r"\{.*\}", reponse, re.S)
    if not morceau:
        return None
    try:
        lu = json.loads(morceau.group(0))
    except json.JSONDecodeError:
        return None
    return lu if isinstance(lu, dict) else None


# ─────────────────────────── compétence : rédiger ───────────────────────────

# ── Le lien : vérifié, jamais cru sur parole ──────────────────────────────
# 🔴 LE MODÈLE INVENTE DES SLUGS. Mesuré le 20/09/2026 : pour la réserve d'Anja,
#    gpt-oss a proposé « /lieu/anja-reserve » — la vraie page est « /lieu/anja ».
#    Un lien mort dans une publication lue par 14 000 abonnés est le pire défaut
#    possible : public, définitif, et il fait perdre le clic.
#    Le site est une application d'une seule page : TOUTE adresse rend 200. On
#    interroge donc `partage.php`, qui sert aux robots un og:title propre à la
#    page — un chemin inconnu retombe sur le titre générique du site.
TITRE_GENERIQUE = "Diako — Voyage & tourisme à Madagascar"
AGENT_ROBOT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"


def verifier_lien(chemin: str, delai: int = 12) -> tuple[bool, str]:
    """(le lien mène-t-il à une vraie page, ce que le partage annonce)."""
    if not chemin:
        return True, ""
    if not chemin.startswith("/"):
        chemin = "/" + chemin
    try:
        r = requests.get(config.SITE + chemin, headers={"User-Agent": AGENT_ROBOT}, timeout=delai)
    except requests.RequestException as e:
        return False, f"page injoignable ({type(e).__name__})"
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}"
    trouve = re.search(r'<meta property="og:title" content="([^"]*)"', r.text)
    titre = (trouve.group(1) if trouve else "").replace("&#039;", "'").replace("&amp;", "&")
    if not titre or titre.strip() == TITRE_GENERIQUE:
        return False, "page inconnue (le partage retombe sur le titre du site)"
    return True, titre


@competence(
    "rediger_publication",
    "Rédiger une publication",
    "Écrit le texte d'une publication Facebook pour la page Di'ako à partir d'un sujet : "
    "accroche, corps, question, hashtags et le lien vers la page du site. Français ou "
    "malgache. N'invente jamais un chiffre : ceux du paramètre `chiffres` seulement.",
    parametres={
        "sujet": "de quoi parle la publication (un lieu, un plat, une fête, une page du site)",
        "titre": "le titre affiché ; à défaut, le sujet sert de titre",
        "rubrique": "lieu, site, legende, evenement, culture, plat, musique, histoire ou conseil",
        "langue": "fr (défaut) ou mg — la langue du corps et de la question",
        "lien": "le chemin de la page sur le site, ex. /lieu/ampefy ou /site/lac-andraikiba",
        "chiffres": "les nombres déjà comptés, avec leur source. Sans eux, aucun chiffre",
        "faits": "les faits vérifiés à reprendre, un par ligne (base Diako, Wikipédia)",
        "corps": "un corps déjà écrit, un paragraphe par ligne (au lieu de le faire écrire)",
        "question": "la question finale, si tu en veux une précise",
        "sous_titre_mg": "le sous-titre malgache de la première ligne",
        "hashtags": "les hashtags voulus ; complétés jusqu'à cinq, #Diako en tête",
        "emoji": "l'emoji de la première ligne",
        "cta": "l'appel de la ligne du lien, ex. « La fiche sur Diako »",
        "cle": "la clé de la publication (dossier et utm_content) ; déduite du titre sinon",
        "campagne": "la valeur utm_campaign ; « publication » par défaut",
        "auteurs_photos": "les auteurs des photos, pour la ligne de crédits",
    },
    obligatoires=("sujet",),
    exemples=(
        "écris la publication sur Ampefy, lien /lieu/ampefy",
        "rédige un post en malgache sur le romazava",
        "écris le post du lac Andraikiba avec ces chiffres : 2 hôtels, 3 restaurants",
    ),
    famille="marketing",
)
def rediger_publication(sujet: str, titre: str = "", rubrique: str = "lieu", langue: str = "fr",
                        lien: str = "", chiffres: Any = "", faits: Any = "", corps: Any = "",
                        question: str = "", sous_titre_mg: str = "", hashtags: Any = "",
                        emoji: str = "", cta: str = "", cle: str = "",
                        campagne: str = "publication", auteurs_photos: Any = "") -> Resultat:
    sujet = _texte(sujet)
    titre = _texte(titre) or sujet
    cle = cle_de(_texte(cle) or titre)
    rubrique = (_texte(rubrique) or "lieu").lower()
    if rubrique not in RUBRIQUES:
        rubrique = "lieu"
    icone, nom_rubrique = RUBRIQUES[rubrique]
    langue = "mg" if _texte(langue).lower().startswith("mg") else "fr"
    lien = _texte(lien)
    if lien and not lien.startswith("/"):
        lien = "/" + lien
    # 🔴 UN LIEN NON VÉRIFIÉ NE PART PAS. Le modèle propose des chemins
    #    plausibles qui n'existent pas (« /lieu/anja-reserve » quand la vraie
    #    page est « /lieu/anja », mesuré le 20/09/2026). On demande au site
    #    AVANT d'écrire : un lien faux est retiré, et la note le dit — plutôt
    #    qu'une publication devant 14 000 abonnés qui mène au vide.
    note_lien = ""
    if lien:
        valide, ce_quon_lit = verifier_lien(lien)
        if not valide:
            note_lien = f"lien {lien} retiré : {ce_quon_lit}"
            lien = ""
        else:
            note_lien = f"lien vérifié : {ce_quon_lit}"
    emoji = _texte(emoji) or "🌍"
    # Sans page precise, on ne promet pas « la fiche » : le lien mene a l accueil.
    cta = _texte(cta) or (f"La fiche {titre} sur Diako" if lien
                          else "Diako, le voyage a Madagascar")
    blocs = _blocs(corps)
    question = _texte(question)
    sous_titre_mg = _texte(sous_titre_mg)
    notes: list[str] = []
    if note_lien:
        notes.append(note_lien)
    origine = "gabarit"

    # ── le modèle, quand il y a une clé et qu'il manque quelque chose ──
    if not blocs or not question or not sous_titre_mg:
        demande = (
            f"Sujet : {sujet}\n"
            f"Titre affiché : {titre}\n"
            f"Rubrique : {nom_rubrique}\n"
            f"Langue du corps et de la question : {'malgache' if langue == 'mg' else 'français'}\n"
            f"Page du site : {config.SITE}{lien or '/'}\n"
            f"Chiffres vérifiés (les seuls autorisés) : {_texte(chiffres) or 'AUCUN'}\n"
            f"Faits connus (les seuls autorisés) :\n{_texte(faits) or '(aucun fait fourni)'}"
        )
        lu = _json_du_modele(_appeler_claude(CONSIGNE_REDACTION, demande))
        if lu:
            origine = "modèle"
            blocs = blocs or _blocs(lu.get("corps"))
            question = question or _texte(lu.get("question"))
            sous_titre_mg = sous_titre_mg or _texte(lu.get("sous_titre_mg"))
            hashtags = hashtags or lu.get("hashtags") or ""
        else:
            notes.append("Écrit sans modèle (pas de clé Anthropic, ou appel refusé) : "
                         "texte de gabarit, volontairement court et sans détail.")

    # ── le gabarit, qui ne raconte que ce qu'on lui a donné ──
    if not blocs:
        blocs = [f"Aujourd'hui sur Diako : {titre}."]
        blocs += [b for b in _blocs(faits)][:2]
        blocs.append("Tout ce que nous avons rassemblé est sur sa page Diako.")
        if langue == "mg":
            notes.append("Le corps est en français : sans modèle ni texte fourni, je n'écris "
                         "pas de prose malgache — je ne devine pas une langue.")
    if not question:
        table = QUESTIONS_MG if langue == "mg" else QUESTIONS_FR
        modele_q = table.get(rubrique) or table.get("lieu", "")
        question = modele_q.format(sujet=titre)
    if not sous_titre_mg:
        notes.append("Pas de sous-titre malgache : la première ligne n'en porte pas.")

    texte = assembler(
        icone=icone, titre=titre, sous_titre_mg=sous_titre_mg, emoji=emoji, corps=blocs,
        question=question, cta=cta, lien=lien, cle=cle,
        hashtags=cinq_hashtags(titre, hashtags),
        # ⚠ un auteur porte souvent deux mots (« krishna naudin ») : on découpe par
        #   ligne, jamais par espace, sinon le crédit se casse en deux crédits faux.
        auteurs_photos=_blocs(auteurs_photos) if auteurs_photos else None,
        campagne=_texte(campagne) or "publication",
    )

    # ── contrôles ──
    lignes_mg = [sous_titre_mg] + ([question] if langue == "mg" else [])
    defauts = controler_texte(texte, cle=cle, lien=lien, chiffres=chiffres,
                              noms_propres=[titre, sujet, sous_titre_mg], lignes_malgaches=lignes_mg)
    bloquants = [d for d in defauts if "texte long" not in d]

    rendu = [texte, "", "———"]
    rendu.append(f"Source du texte : {origine} · rubrique {nom_rubrique} · clé `{cle}`"
                 + (f" · langue malgache" if langue == "mg" else ""))
    if any(lignes_mg):
        rendu.append("🇲🇬 Le malgache est à FAIRE RELIRE PAR ANDRY avant publication.")
    if not _texte(chiffres):
        rendu.append("Aucun chiffre fourni : le texte n'en annonce aucun.")
    for n in notes:
        rendu.append("· " + n)
    if defauts:
        rendu.append("Défauts à corriger :")
        rendu += [f"  ✗ {d}" for d in defauts]
    else:
        rendu.append("✓ Forme conforme à ce que verifier.py exige.")

    return Resultat(
        texte="\n".join(rendu),
        ok=not bloquants,
        donnees={"texte": texte, "cle": cle, "lien": lien, "rubrique": rubrique,
                 "langue": langue, "origine": origine, "defauts": defauts,
                 "sous_titre_mg": sous_titre_mg, "question": question},
        suites=[{"texte": "Préparer la publication",
                 "action": "faire:preparer_publication|" + json.dumps(
                     {"cle": cle, "titre": titre, "texte": texte, "lien": lien,
                      "sous_titre_mg": sous_titre_mg, "rubrique": rubrique},
                     ensure_ascii=False)}],
    )


# ─────────────────────────── compétence : idées ───────────────────────────

def _deja_traite() -> dict[str, str]:
    """Les sujets déjà pris par les séries en cours — clé → où. On ne repasse pas dessus."""
    pris: dict[str, str] = {}
    for dossier in (config.ATELIER / "sortie", config.ATELIER / "sortie2",
                    config.DOSSIER_DONNEES / "sorties"):
        if not dossier.exists():
            continue
        for d in dossier.iterdir():
            if d.is_dir() and re.match(r"\d{4}-\d{2}-\d{2}-", d.name):
                pris[d.name[11:]] = f"{dossier.name}/{d.name[:10]}"
    return pris


def _candidats_du_site() -> list[dict]:
    """Les lieux réels du site, relevés en base par collecter_lieux.py (candidats.json).

    ⚠ Lecture seule, et rien d'autre : un sujet qui n'a pas de page sur le site ne
      peut pas être proposé, sinon le lien de la publication mène nulle part."""
    fichier = config.ATELIER / "candidats.json"
    if not fichier.exists():
        return []
    try:
        lus = json.loads(fichier.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    sortie = []
    for c in lus if isinstance(lus, list) else []:
        titre = c.get("nom_lieu") or c.get("nom_site") or c.get("cle")
        if titre and c.get("lien"):
            sortie.append({"titre": titre, "lien": c["lien"], "cle": c.get("cle") or cle_de(titre),
                           "rubrique": "lieu", "source": "candidats.json (base Diako)"})
    return sortie


ANGLES = {
    "lieu": ["ce qu'on y voit", "comment on y va", "la meilleure saison pour y aller",
             "une journée sur place"],
    "plat": ["comment il se prépare", "où le manger", "l'histoire du plat"],
    "site": ["à quoi sert la page", "ce qu'on y trouve", "comment s'en servir"],
}


@competence(
    "idees_publications",
    "Proposer des sujets",
    "Propose des sujets de publication à partir du CONTENU RÉEL du site : lieux, plats, "
    "pages, publications du fil. Écarte ce qui est déjà programmé et ne propose jamais un "
    "sujet dont le site n'a pas la page.",
    parametres={
        "lieux": "les lieux à considérer, un par ligne (nom | /lien)",
        "plats": "les plats à considérer, un par ligne (nom | /lien)",
        "sites": "les pages du site à considérer, une par ligne (nom | /lien)",
        "publications": "les publications du fil à considérer, une par ligne",
        "combien": "combien de sujets proposer (6 par défaut)",
        "eviter": "les sujets à ne pas proposer, séparés par des virgules",
    },
    exemples=("propose-moi 5 sujets de publication", "des idées pour la semaine"),
    famille="marketing",
)
def idees_publications(lieux: Any = "", plats: Any = "", sites: Any = "",
                       publications: Any = "", combien: Any = "", eviter: Any = "") -> Resultat:
    voulu = max(1, min(20, _entier(combien, 6)))

    def _lus(valeur: Any, rubrique: str, provenance: str) -> list[dict]:
        out = []
        for ligne in _blocs(valeur):
            nom, _, adresse = ligne.partition("|")
            nom, adresse = nom.strip(" -·"), adresse.strip()
            if not nom:
                continue
            out.append({"titre": nom, "lien": adresse, "cle": cle_de(nom),
                        "rubrique": rubrique, "source": provenance})
        return out

    matiere = (_lus(lieux, "lieu", "liste fournie") + _lus(plats, "plat", "liste fournie")
               + _lus(sites, "site", "liste fournie")
               + _lus(publications, "legende", "fil du site"))
    depuis_le_site = False
    if not matiere:
        matiere = _candidats_du_site()
        depuis_le_site = True

    if not matiere:
        return Resultat(
            texte=("Je ne propose rien : je n'ai aucune matière réelle.\n"
                   "Donne-moi des lieux, des plats ou des pages (nom | /lien), ou lance "
                   "d'abord la collecte du site. Inventer un sujet, c'est promettre une "
                   "page que le site n'a pas."),
            ok=False,
        )

    pris = _deja_traite()
    exclus = {cle_de(m) for m in _texte(eviter).split(",") if m.strip()}
    retenus, ecartes = [], []
    for item in matiere:
        if item["cle"] in pris:
            ecartes.append(f"{item['titre']} (déjà : {pris[item['cle']]})")
            continue
        if item["cle"] in exclus:
            continue
        angles = ANGLES.get(item["rubrique"], ANGLES["lieu"])
        item["angle"] = angles[len(retenus) % len(angles)]
        retenus.append(item)
        if len(retenus) >= voulu:
            break

    lignes = [f"{len(retenus)} sujet(s) proposé(s)"
              + (" depuis candidats.json (contenu réel du site)" if depuis_le_site else ""), ""]
    for i, item in enumerate(retenus, 1):
        adresse = item["lien"] or "— pas de lien connu : à vérifier avant de publier"
        lignes.append(f"{i}. {item['titre']} — {item['angle']}")
        lignes.append(f"   {adresse}  ·  clé `{item['cle']}`  ·  {item['source']}")
    if ecartes:
        lignes += ["", "Déjà programmés, écartés : " + ", ".join(ecartes[:8])]
    lignes += ["", "Aucun sujet ne porte de chiffre : les nombres se comptent avant d'écrire."]

    return Resultat(
        texte="\n".join(lignes),
        ok=bool(retenus),
        donnees={"idees": retenus, "ecartes": ecartes},
        suites=([{"texte": f"Rédiger « {retenus[0]['titre']} »",
                  "action": "faire:rediger_publication|" + json.dumps(
                      {"sujet": retenus[0]["titre"], "titre": retenus[0]["titre"],
                       "lien": retenus[0]["lien"], "rubrique": retenus[0]["rubrique"]},
                      ensure_ascii=False)}] if retenus else []),
    )
