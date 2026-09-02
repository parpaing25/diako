#!/usr/bin/env python
"""Pourquoi 55 chambres sur 94 n'ont pas de prix — en regardant le TEXTE BRUT.

`room_types.base_price_ar` est NOT NULL côté Diako : une chambre sans prix ne
partira jamais. Avant de toucher à l'extraction, il faut voir ce que le texte
d'origine disait vraiment autour du nom de la chambre.

LECTURE SEULE. La base est ouverte en `mode=ro`, rien n'est écrit nulle part.

    python outils/diagnostic_chambres.py            # toutes les chambres sans prix
    python outils/diagnostic_chambres.py --large    # + 40 lignes de contexte
    python outils/diagnostic_chambres.py <id>       # une seule trouvaille
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import extraction  # noqa: E402
from bot.config import BASE  # noqa: E402


def _connexion() -> sqlite3.Connection:
    cx = sqlite3.connect(f"file:{BASE.as_posix()}?mode=ro", uri=True)
    cx.row_factory = sqlite3.Row
    return cx


def _fenetre(texte: str, nom: str, avant: int = 2, apres: int = 6) -> list[str]:
    """Les lignes du texte d'origine autour du libellé de la chambre.

    C'est la seule façon de trancher entre « le prix n'est pas dans le texte »
    et « le prix est là, l'extraction ne l'a pas rattaché ». Le rapprochement
    se fait sur les mots du nom, pas sur l'égalité : le LLM reformate.
    """
    lignes = texte.split("\n")
    mots = [m for m in re.split(r"\W+", extraction.sans_accent(nom).lower())
            if len(m) >= 4]
    if not mots:
        return []
    meilleure, score_max = None, 0
    for i, ligne in enumerate(lignes):
        n = extraction.sans_accent(ligne).lower()
        score = sum(1 for m in mots if m in n)
        if score > score_max:
            meilleure, score_max = i, score
    if meilleure is None or score_max == 0:
        return []
    return lignes[max(0, meilleure - avant):meilleure + apres + 1]


def _devises_du_texte(texte: str) -> dict:
    """Combien de montants par devise. Une page en euros se voit tout de suite."""
    n = extraction.sans_accent(extraction.MOTIF_TEL.sub(" ", texte))
    return {
        "ariary": len(re.findall(r"\d[\d\s.,]*\s*(?:ar\b|ariary|mga)", n)),
        "euro": len(re.findall(r"(?:€|\beuros?\b)", n)),
        "dollar": len(re.findall(r"(?:\$|\busd\b)", n)),
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    large = "--large" in sys.argv
    cx = _connexion()

    where = "lc.prix_ar IS NULL"
    params: tuple = ()
    if args:
        where += " AND lc.trouvaille_id = ?"
        params = (args[0],)

    lignes = cx.execute(f"""
        SELECT lc.id, lc.trouvaille_id, lc.nom, lc.unite, lc.capacite, lc.saison,
               t.texte, t.site_web, t.nom_etab, t.titre, t.lu_par_llm, t.permalien
          FROM lignes_chambre lc
          JOIN trouvailles t ON t.id = lc.trouvaille_id
         WHERE {where}
         ORDER BY lc.trouvaille_id, lc.ordre, lc.id
    """, params).fetchall()

    total, avec = cx.execute(
        "SELECT COUNT(*), SUM(prix_ar IS NOT NULL) FROM lignes_chambre"
    ).fetchone()
    print(f"CHAMBRES : {total} en base, {avec} avec prix, {total - (avec or 0)} sans.")
    print(f"{len(lignes)} ligne(s) examinée(s).\n")

    courante = None
    recuperables = 0
    for r in lignes:
        if r["trouvaille_id"] != courante:
            courante = r["trouvaille_id"]
            devises = _devises_du_texte(r["texte"])
            print("=" * 78)
            print(f"TROUVAILLE {courante}  ({r['nom_etab'] or '?'})")
            print(f"  source   : {r['site_web'] or r['permalien'] or '—'}")
            print(f"  llm lu   : {r['lu_par_llm']}   texte : {len(r['texte'])} car.")
            print(f"  montants : Ar×{devises['ariary']}  €×{devises['euro']}  "
                  f"$×{devises['dollar']}")
            # Ce que les règles seules savent lire sur ce même texte.
            par_regles = extraction.types_de_chambre(r["texte"])
            print(f"  règles   : {len(par_regles)} chambre(s) chiffrée(s) "
                  f"→ {[(c['nom'][:28], c['prix_ar']) for c in par_regles][:6]}")
            globaux = [m for m in extraction.montants(r["texte"])
                       if m["montant"] >= 5_000]
            print(f"  montants Ar ≥ 5 000 : "
                  f"{[(m['montant'], m['unite']) for m in globaux][:8]}")
            print("=" * 78)

        print(f"\n— [{r['id']}] « {r['nom']} »  unité={r['unite']} "
              f"capacité={r['capacite']} saison={r['saison'] or '—'}")
        contexte = _fenetre(r["texte"], r["nom"], 2, 12 if large else 6)
        if not contexte:
            print("   (libellé introuvable dans le texte : reformulé par le modèle)")
            continue
        chiffre = any(re.search(r"\d{3}", l) for l in contexte)
        recuperables += 1 if chiffre else 0
        for l in contexte:
            marque = ">>" if re.search(r"\d[\d\s.,]{2,}", l) else "  "
            print(f"   {marque} {l.strip()[:150]}")

    print(f"\n{recuperables}/{len(lignes)} chambre(s) ont au moins un nombre "
          f"à 3 chiffres dans leur voisinage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
