# -*- coding: utf-8 -*-
"""chiffres3.py — recalcule TOUS les chiffres publiés par la série 3, depuis le miroir
local du référentiel Diako, en LECTURE SEULE.

    python marketing/atelier/chiffres3.py            # affiche le tableau
    python marketing/atelier/chiffres3.py --ecrire   # écrit aussi chiffres3.json

⚠ Le miroir `bot-diako/data/bot.db` est chargé depuis `public.pages`, `public.places` et
  `public.attractions` SANS filtre `is_published` (voir bot-diako/bot/diako.py,
  rafraichir_referentiel). Un compte tiré de `ref_pages` n'est donc PAS un compte de fiches
  PUBLIÉES : les textes disent « référencés sur Diako », jamais « publiés ».

⚠ `ref_lieux.touristique` ne désigne pas des sites touristiques : dans Analamanga il est posé
  sur des quartiers de Tana (Ankadifotsy, Ambohipo…). Il n'est pas utilisé ici.

⚠ `ref_sites` est bruité (doublons « Antrema » ×9, entrées nommées « 10 », « 11 », une
  ambassade classée en réserve) : aucun compte de `ref_sites` n'est publié.

Seules sources retenues : les NOMS de `ref_lieux` (gazetier propre, `merged_into IS NULL`)
et les catégories de `ref_pages`.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
DEPOT = ICI.parent.parent
BASE = DEPOT / "bot-diako" / "data" / "bot.db"

# Une ville = une ou plusieurs lignes de ref_lieux (deux orthographes pour Fort-Dauphin).
# ⚠ On vise les SLUGS, pas les noms : « Morondava » désigne aussi un quartier de Tana
#   qui porte 1 fiche, et le compte par nom annonçait 45 fiches au lieu de 44.
# clé de publication -> (libellé, [slugs exacts dans ref_lieux], région attendue)
VILLES = [
    ("antananarivo",     "Antananarivo",      ["antananarivo-2"],                  "Analamanga"),
    ("mahajanga",        "Mahajanga",         ["mahajanga"],                     "Boeny"),
    ("fianarantsoa",     "Fianarantsoa",      ["fianarantsoa"],                  "Haute Matsiatra"),
    ("toliara",          "Toliara",           ["toliara"],                       "Atsimo-Andrefana"),
    ("toamasina",        "Toamasina",         ["toamasina"],                     "Atsinanana"),
    ("antsirabe",        "Antsirabe",         ["antsirabe"],                     "Vakinankaratra"),
    ("antsiranana",      "Antsiranana",       ["antsiranana"],                   "Diana"),
    ("ambohidratrimo",   "Ambohidratrimo",    ["ambohidratrimo"],                "Analamanga"),
    ("sambava",          "Sambava",           ["sambava"],                       "Sava"),
    ("morondava",        "Morondava",         ["morondava"],                     "Menabe"),
    ("antsohihy",        "Antsohihy",         ["antsohihy"],                     "Sofia"),
    ("tolagnaro",        "Taolagnaro",        ["tolagnaro", "taolagnaro"],       "Anosy"),
    ("ranomafana",       "Ranomafana",        ["ranomafana-3"],                    "Vatovavy"),
    ("moramanga",        "Moramanga",         ["moramanga"],                     "Alaotra-Mangoro"),
    ("ranohira",         "Ranohira",          ["ranohira"],                      "Ihorombe"),
    ("ambatondrazaka",   "Ambatondrazaka",    ["ambatondrazaka"],                "Alaotra-Mangoro"),
    ("manakara",         "Manakara",          ["manakara"],                      "Fitovinany"),
    ("ambositra",        "Ambositra",         ["ambositra-2"],                     "Amoron'i Mania"),
    ("farafangana",      "Farafangana",       ["farafangana"],                   "Atsimo-Atsinanana"),
    ("ambanja",          "Ambanja",           ["ambanja"],                       "Diana"),
    ("ambilobe",         "Ambilobe",          ["ambilobe"],                      "Diana"),
    ("fenoarivo",        "Fenoarivo Atsinanana", ["fenoarivo-atsinanana"],               "Analanjirofo"),
    ("morombe",          "Morombe",           ["morombe"],                       "Atsimo-Andrefana"),
    ("imerintsiatosika", "Imerintsiatosika",  ["imerintsiatosika"],              "Itasy"),
    ("tsiroanomandidy",  "Tsiroanomandidy",   ["tsiroanomandidy-2"],               "Bongolava"),
    ("ihosy",            "Ihosy",             ["ihosy"],                         "Ihorombe"),
    ("antalaha",         "Antalaha",          ["antalaha"],                      "Sava"),
    ("mananjary",        "Mananjary",         ["mananjary-5"],                     "Vatovavy"),
    ("maintirano",       "Maintirano",        ["maintirano-2"],                    "Melaky"),
    ("ambovombe",        "Ambovombe",         ["ambovombe"],                     "Androy"),
]

# Comptes toponymiques publiés : un motif PRÉCIS, celui que la phrase annonce.
# clé -> (libellé du motif tel qu'il est écrit dans le texte, sens, mode, aiguille)
MOTIFS = [
    ("ambohi",  "Ambohi-",  "an- (à) + vohitra (la colline)",      "debut", "Ambohi"),
    ("ambodi",  "Ambodi-",  "an- (à) + vody (le pied, la base)",   "debut", "Ambodi"),
    ("ambala",  "Ambala-",  "an- (à) + vala (le parc à zébus)",    "debut", "Ambala"),
    ("ambato",  "Ambato-",  "an- (à) + vato (le rocher)",          "debut", "Ambato"),
    ("anala",   "Anala-",   "an- (à) + ala (la forêt)",            "debut", "Anala"),
    ("ampasi",  "Ampasi-",  "an- (à) + fasika (le sable)",         "debut", "Ampasi"),
    ("ankazo",  "Ankazo-",  "an- (à) + hazo (l'arbre)",            "debut", "Ankazo"),
    ("andrano", "Andrano-", "an- (à) + rano (l'eau)",              "debut", "Andrano"),
    ("antsira", "Antsira-", "an- (à) + sira (le sel)",             "debut", "Antsira"),
    ("rano",    "Rano-",    "rano (l'eau)",                        "debut", "Rano"),
    ("maro",    "Maro-",    "maro (nombreux)",                     "debut", "Maro"),
    ("tsara",   "Tsara-",   "tsara (bon, beau)",                   "debut", "Tsara"),
    ("soa",     "Soa-",     "soa (bien, beau)",                    "debut", "Soa"),
    ("maha",    "Maha-",    "maha- (qui rend, qui peut)",          "debut", "Maha"),
    ("vohi",    "Vohi-",    "vohitra (la colline)",                "debut", "Vohi"),
    ("tana",    "Tana-",    "tanàna (le village, la ville)",       "debut", "Tana"),
    ("be",      "-be",      "be (grand, beaucoup)",                "fin",   "be"),
    ("kely",    "-kely",    "kely (petit)",                        "fin",   "kely"),
    ("arivo",   "-arivo",   "arivo (mille)",                       "fin",   "arivo"),
    ("rano_f",  "-rano",    "rano (l'eau)",                        "fin",   "rano"),
]


def connexion() -> sqlite3.Connection:
    if not BASE.exists():
        raise SystemExit(f"base absente : {BASE}")
    return sqlite3.connect(f"file:{BASE.as_posix()}?mode=ro", uri=True)


def main() -> int:
    c = connexion()
    out: dict = {}

    charge = c.execute("select valeur from etat where cle='referentiel_charge_le'").fetchone()
    quand = datetime.fromtimestamp(float(charge[0])) if charge else None
    out["referentiel_charge_le"] = quand.strftime("%d/%m/%Y à %H:%M") if quand else "inconnu"
    out["base"] = "bot-diako/data/bot.db (miroir local, lecture seule)"
    out["avertissement"] = ("ref_pages est chargé sans filtre is_published : « référencés sur "
                            "Diako », jamais « publiés ». ref_sites et ref_lieux.touristique "
                            "sont bruités et ne sont pas utilisés.")

    # ── totaux ──
    out["total_lieux"] = c.execute("select count(*) from ref_lieux").fetchone()[0]
    out["total_villes"] = c.execute("select count(*) from ref_lieux where genre='ville'").fetchone()[0]
    out["total_pages"] = c.execute("select count(*) from ref_pages").fetchone()[0]
    out["total_regions"] = c.execute(
        "select count(distinct region) from ref_lieux where region is not null and region<>''").fetchone()[0]
    out["requete_totaux"] = ("select count(*) from ref_lieux | "
                             "select count(*) from ref_lieux where genre='ville' | "
                             "select count(*) from ref_pages | "
                             "select count(distinct region) from ref_lieux where region<>''")

    # ── villes ──
    out["requete_ville"] = (
        "select count(distinct p.id), "
        "sum(case when p.categories like '%hotel%' then 1 else 0 end), "
        "sum(case when p.categories like '%restaurant%' then 1 else 0 end) "
        "from ref_pages p join ref_lieux l on l.id=p.lieu_id where l.slug in (<slugs>)")
    villes = {}
    print(f"{'clé':18} {'ville':22} {'région':18} {'pages':>6} {'hôtels':>7} {'restos':>7}")
    for cle, libelle, slugs_ville, region in VILLES:
        trous = ",".join("?" * len(slugs_ville))
        pages, hot, res = c.execute(
            "select count(distinct p.id), "
            "sum(case when p.categories like '%hotel%' then 1 else 0 end), "
            "sum(case when p.categories like '%restaurant%' then 1 else 0 end) "
            f"from ref_pages p join ref_lieux l on l.id=p.lieu_id where l.slug in ({trous})",
            slugs_ville).fetchone()
        regions = sorted({r[0] for r in c.execute(
            f"select region from ref_lieux where slug in ({trous})", slugs_ville)})
        noms = [r[0] for r in c.execute(
            f"select nom from ref_lieux where slug in ({trous}) order by slug", slugs_ville)]
        if region not in regions:
            raise SystemExit(f"{cle} : région attendue {region!r}, trouvé {regions!r}")
        villes[cle] = {"libelle": libelle, "noms": noms, "region": region, "slugs": slugs_ville,
                       "pages": pages or 0, "hotels": hot or 0, "restaurants": res or 0}
        print(f"{cle:18} {libelle:22} {region:18} {pages or 0:6} {hot or 0:7} {res or 0:7}")
    out["villes"] = villes

    # ── motifs toponymiques ──
    noms = [r[0] for r in c.execute("select nom from ref_lieux where nom is not null and nom<>''")]
    motifs = {}
    print()
    for cle, libelle, sens, mode, aiguille in MOTIFS:
        a = aiguille.lower()
        if mode == "debut":
            n = sum(1 for x in noms if x.lower().startswith(a))
        else:
            n = sum(1 for x in noms if x.lower().endswith(a))
        ex = [x for x in noms if (x.lower().startswith(a) if mode == "debut" else x.lower().endswith(a))]
        vus, exemples = set(), []
        for x in ex:                      # des homonymes existent : un nom par exemple
            if x.lower() not in vus:
                vus.add(x.lower()); exemples.append(x)
        motifs[cle] = {"motif": libelle, "sens": sens, "mode": mode, "aiguille": aiguille,
                       "nombre": n, "exemples": exemples[:40]}
        phrase = ("commencent par" if mode == "debut" else "finissent par")
        print(f"  {libelle:10} {n:6} noms {phrase} {libelle:10} — {sens}")
    out["motifs"] = motifs
    out["requete_motif"] = ("noms = select nom from ref_lieux where nom<>'' ; puis "
                            "nombre = len([x for x in noms if x.lower().startswith/endswith(aiguille)])")

    if "--ecrire" in sys.argv:
        (ICI / "chiffres3.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print("\nchiffres3.json écrit")
    print(f"\nRéférentiel chargé le {out['referentiel_charge_le']} — "
          f"{out['total_lieux']} lieux, {out['total_villes']} villes, {out['total_pages']} fiches, "
          f"{out['total_regions']} régions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
