"""Rendre visibles les fiches que le bot a écrites et que personne ne voit.

🔴 CE QUI S'EST PASSÉ. Entre le 16/08 et le 01/09/2026, le bot a créé 334 fiches
   d'établissement dans Diako. **Aucune n'est visible sur le site.** Le
   déclencheur `pages_avant_ecriture()` force `is_published = false` sur toute
   insertion faite par un compte qui n'est pas administrateur ; le compte du bot
   (contact.diako@gmail.com) n'a reçu le rôle `admin` qu'après coup. Vérifié le
   04/09/2026 par une écriture annulée : aujourd'hui l'insertion garde bien
   `is_published = true`. Ces 334 fiches sont un résidu, et rien ne les rattrape
   tout seul.

   Leur qualité n'est pas mauvaise : complétude moyenne 58/100, 215 avec photo,
   210 avec un contact, 334 rattachées à un lieu. À comparer aux 3 689 fiches du
   site, dont 293 seulement portent une photo.

⚠ MAIS ON NE LES PUBLIE PAS EN BLOC. Le même mois, le bot ne mettait pas ses
  fiches neuves dans son référentiel local : il en a donc créé plusieurs pour le
  même établissement — 25 fois « Hotel Restaurant Dera », 17 fois « Hôtel de la
  Mer ». Publier sans trier donnerait à Diako des dizaines de doublons visibles,
  et ce serait pire que l'oubli.

CE QUE FAIT L'OUTIL, dans l'ordre :
  1. il écarte ce qui n'est pas une enseigne : nom sans mot distinctif
     (« Madagascar »), titre d'annonce en capitales, phrase d'accroche, logement
     à louer (le métier de Fonenako, pas de Diako) ;
  2. il écarte les fiches trop maigres (moins de 40/100, ni photo ni contact) ;
  3. il écarte celles qu'une fiche DÉJÀ EN LIGNE désigne déjà ;
  4. il ne garde, par établissement, que la fiche la plus complète — les autres
     restent invisibles, rien n'est supprimé ;
  5. il publie le reste, et dit ce qu'il a écarté et pourquoi.

⚠ « MÊME ÉTABLISSEMENT » NE SE JUGE PAS SUR LE NOM EXACT. « Hotel La Bombonera »
  et « Hotel La Bombonera, Ambatoloaka, Nosy Be, Madagascar » sont le même hôtel,
  « Mada Infinity Tour » et « Mada Infinity Tours » la même agence. On compare
  donc les mots DISTINCTIFS du nom (`diako._forts`, le vocabulaire que le bot
  emploie déjà pour rapprocher) : si les mots de l'un sont tous dans l'autre,
  c'est le même établissement.

    python outils/publier_fiches_oubliees.py            # à blanc, n'écrit rien
    python outils/publier_fiches_oubliees.py --detail   # à blanc, fiche par fiche
    python outils/publier_fiches_oubliees.py --ecrire   # publie pour de bon
"""
from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from bot import diako  # noqa: E402

# Le bot a commencé à écrire des fiches le 16/08/2026. Avant, ce sont les
# imports (office du tourisme, Wikivoyage, OSM), qui ne nous regardent pas.
DEPUIS = "2026-08-16"

# ── Ce qui n'est pas une enseigne ───────────────────────────────────────────
MOTS_ANNONCE = re.compile(
    r"\b(?:a\s+louer|à\s+louer|a\s+vendre|à\s+vendre|appartement|maison\s+basse"
    r"|studio\s+meuble|terrain|bon\s+plan|arrivage|en\s+vitrine|nouvelle\s+collection"
    r"|disponibles?\s+demain|profitez|promo|reduction|réduction)\b",
    re.IGNORECASE,
)
# Une phrase, pas un nom : elle interroge, elle s'exclame, ou elle s'adresse au
# lecteur. Trois marques que ne porte aucune enseigne.
PHRASE = re.compile(r"[?!]\s*$|^(?:des|envie|come\s+and|venez|profitez)\b", re.IGNORECASE)
# Un titre de publication, écrit en capitales pour attirer l'œil. Une enseigne
# tient en trois mots ; « EXCURSION UNE JOURNNÉE MANDRAKA MANTASOA » est le
# titre d'une offre, avec sa faute de frappe.
TITRE_CRIE = re.compile(r"^[^a-zà-ÿ]*$")


def normaliser(nom: str) -> str:
    """Le nom réduit à ses lettres et chiffres, sans accent ni casse."""
    plat = unicodedata.normalize("NFD", nom or "")
    plat = "".join(c for c in plat if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", plat.lower())


def mots_distinctifs(nom: str) -> frozenset[str]:
    """Les mots qui désignent CET établissement, pluriel ramené au singulier.

    « hôtel », « restaurant », « madagascar » n'en sont pas : ce sont des
    catégories ou des géographies, que `diako._forts` écarte déjà. Un nom qui
    n'en garde aucun ne désigne personne.
    """
    forts = diako._forts(set(diako.jetons(nom or "")))
    return frozenset(m[:-1] if len(m) > 3 and m.endswith("s") else m for m in forts)


def meme_etablissement(a: frozenset[str], b: frozenset[str],
                       rares: frozenset[str] = frozenset()) -> bool:
    """Les deux noms designent-ils le meme etablissement ?

    Les mots de l'un doivent tous se retrouver dans l'autre. UN SEUL mot commun
    ne suffit pas, sauf s'il est rare : mesure du 04/09/2026, sur 124 fiches
    ecartees comme « deja en ligne », 118 l'etaient sur un mot banal —
    « A-Vezo Tours » contre « Vezo Hotel », « 301 mi Voyage » contre
    « Mi Hotel », « Abdou Nosy Be Guide » contre « Nosy Be Hotel ». Un
    rapprochement trop large ne protege plus, il supprime.
    """
    if not a or not b:
        return False
    if a == b:
        return True
    petit, grand = (a, b) if len(a) <= len(b) else (b, a)
    if not petit <= grand:
        return False
    if len(petit) >= 2:
        return True
    return next(iter(petit)) in rares


def motif_d_ecart(fiche: dict) -> str | None:
    """Pourquoi cette fiche ne doit pas paraître. None = elle peut paraître."""
    nom = (fiche.get("name") or "").strip()
    if len(normaliser(nom)) < 4:
        return "nom trop court pour désigner un établissement"
    if not mots_distinctifs(nom):
        return "aucun mot distinctif dans le nom (lieu ou catégorie seule)"
    if PHRASE.search(nom):
        return "le nom est une phrase d'accroche, pas une enseigne"
    if MOTS_ANNONCE.search(nom):
        return "annonce (vente, location de logement, promotion) — pas un établissement"
    if TITRE_CRIE.match(nom) and len(nom.split()) >= 4:
        return "titre de publication en capitales, pas une enseigne"
    complet = int(fiche.get("completeness") or 0)
    if complet < 40 and not fiche.get("cover_url") and not fiche.get("contact"):
        return f"fiche trop maigre ({complet}/100, ni photo ni contact)"
    return None


def choisir(fiches: list[dict],
            noms_en_ligne: list[str]) -> tuple[list[dict], list[tuple[dict, str]]]:
    """Rend les fiches à publier, et celles qu'on laisse avec leur motif.

    ⚠ `noms_en_ligne` porte les noms de TOUTES les fiches déjà visibles, pas
      seulement des récentes. Une première version ne comparait qu'aux fiches
      écrites depuis le 16/08 — or aucune n'était visible, l'ensemble était donc
      vide et le garde-fou ne mordait sur rien.
    """
    a_publier, ecartees = [], []

    # ① Ce qui n'est pas une enseigne sort d'abord : sinon une annonce mieux
    #    remplie évincerait la vraie fiche du même établissement.
    candidates = []
    for f in fiches:
        if f.get("deja_publiee"):
            continue
        motif = motif_d_ecart(f)
        if motif:
            ecartees.append((f, motif))
        else:
            candidates.append(f)

    # ② La plus complète d'abord : c'est elle qui représentera l'établissement.
    #    À complétude égale, celle qui a une photo, puis un contact.
    candidates.sort(key=lambda f: (int(f.get("completeness") or 0),
                                   bool(f.get("cover_url")), bool(f.get("contact"))),
                    reverse=True)

    deja = [mots_distinctifs(n) for n in noms_en_ligne]
    deja = [m for m in deja if m]

    # Un mot est RARE s'il ne sert qu'a deux NOMS DISTINCTS au plus, dans tout
    # Diako. « bombonera » l'est, « beach » ne l'est pas. Le seuil vient de la
    # mesure : sous cette barre, les rapprochements observes etaient tous justes.
    #
    # ⚠ ON COMPTE LES NOMS, PAS LES FICHES. Le bot a ecrit 25 fiches nommees
    #   « Hotel Restaurant Dera » : compter les fiches ferait passer « dera »
    #   pour un mot banal, et les 25 doublons seraient tous publies. C'est
    #   exactement le defaut que ce module doit reparer.
    frequence: defaultdict[str, int] = defaultdict(int)
    noms_vus = set()
    for nom in noms_en_ligne + [f["name"] for f in candidates]:
        mots = mots_distinctifs(nom)
        if not mots or mots in noms_vus:
            continue
        noms_vus.add(mots)
        for mot in mots:
            frequence[mot] += 1
    rares = frozenset(mot for mot, n in frequence.items() if n <= 2)

    retenus: list[tuple[frozenset[str], dict]] = []
    for f in candidates:
        mots = mots_distinctifs(f["name"])
        jumelle = next((m for m in deja if meme_etablissement(mots, m, rares)), None)
        if jumelle is not None:
            ecartees.append((f, "une fiche déjà en ligne désigne cet établissement"))
            continue
        double = next((g for m, g in retenus if meme_etablissement(mots, m, rares)), None)
        if double is not None:
            ecartees.append((f, f"doublon interne : déjà représenté par "
                                f"« {double['name'][:40]} »"))
            continue
        retenus.append((mots, f))
        a_publier.append(f)

    return a_publier, ecartees


def lire() -> tuple[list[dict], list[str]]:
    """Les fiches écrites par le bot, et les noms de tout ce qui est déjà en ligne."""
    fiches = diako.executer_sql(
        "SELECT id::text, name, completeness, "
        "(cover_url IS NOT NULL AND cover_url <> '') AS cover_url, "
        "(coalesce(phone, whatsapp) IS NOT NULL) AS contact, "
        "is_published AS deja_publiee "
        f"FROM public.pages WHERE created_at > '{DEPUIS}' ORDER BY name"
    )
    en_ligne = diako.executer_sql("SELECT name FROM public.pages WHERE is_published")
    return fiches, [l["name"] for l in en_ligne if l.get("name")]


def main() -> int:
    lecture = argparse.ArgumentParser(description=__doc__)
    lecture.add_argument("--ecrire", action="store_true",
                         help="publie pour de bon (sans lui, rien n'est écrit)")
    lecture.add_argument("--detail", action="store_true",
                         help="liste chaque fiche écartée avec son motif")
    args = lecture.parse_args()

    fiches, noms_en_ligne = lire()
    if not fiches:
        print("Aucune fiche écrite depuis le", DEPUIS, "— rien à faire.")
        return 0

    a_publier, ecartees = choisir(fiches, noms_en_ligne)
    invisibles = [f for f in fiches if not f.get("deja_publiee")]

    print(f"{len(fiches)} fiche(s) écrites depuis le {DEPUIS}, "
          f"dont {len(invisibles)} invisibles sur le site.")
    print(f"  → {len(a_publier)} à publier")
    print(f"  → {len(ecartees)} laissées invisibles")

    motifs = defaultdict(int)
    for _, motif in ecartees:
        motifs[motif.split(" :")[0]] += 1
    for motif, n in sorted(motifs.items(), key=lambda x: -x[1]):
        print(f"      {n:4}  {motif}")

    if args.detail:
        print("\n── Écartées, une par ligne " + "─" * 46)
        for f, motif in sorted(ecartees, key=lambda x: x[1]):
            print(f"  {f['name'][:46]:46} · {motif}")
        print("\n── À publier " + "─" * 60)
        for f in a_publier:
            print(f"  {f['completeness']:3}/100  {f['name'][:56]}")

    if not args.ecrire:
        print("\nÀ blanc : rien n'a été écrit. Relancer avec --ecrire pour publier.")
        return 0

    # Un seul ordre pour tout le lot : soit les fiches paraissent ensemble, soit
    # aucune. Un lot à moitié publié laisserait un état que personne ne saurait
    # décrire le lendemain.
    identifiants = ", ".join(f"'{f['id']}'::uuid" for f in a_publier)
    diako.executer_sql(
        f"UPDATE public.pages SET is_published = true WHERE id IN ({identifiants});",
        proprietaire=True,
    )
    controle = diako.executer_sql(
        f"SELECT count(*) AS n FROM public.pages "
        f"WHERE id IN ({identifiants}) AND is_published"
    )
    visibles = int(controle[0]["n"]) if controle else 0
    print(f"\n{visibles} fiche(s) désormais visibles sur https://diako.fonenako.mg.")
    if visibles != len(a_publier):
        print(f"⚠ {len(a_publier) - visibles} n'ont PAS été publiées : le "
              "déclencheur a peut-être repris la main. Vérifier le rôle du compte.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
