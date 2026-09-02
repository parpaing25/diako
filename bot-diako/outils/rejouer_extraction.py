#!/usr/bin/env python
"""Rejoue l'extraction sur les textes DÉJÀ collectés, et compte ce qu'elle donne.

Une règle qui n'a jamais tourné sur des données réelles n'est pas une règle,
c'est une intention. Ce script prend les textes de `data/bot.db`, les repasse
dans `bot/extraction.py` tel qu'il est aujourd'hui, et affiche le résultat à
côté de ce que la base contient — pour qu'on voie l'écart avant de relancer
quoi que ce soit.

LECTURE SEULE, des deux côtés : la base est ouverte en `mode=ro`, et rien
n'est écrit ni dans SQLite, ni vers Supabase.

    python outils/rejouer_extraction.py                 # tout, en résumé
    python outils/rejouer_extraction.py chambres        # une famille
    python outils/rejouer_extraction.py vehicules -v    # avec le détail
    python outils/rejouer_extraction.py parcs -v
    python outils/rejouer_extraction.py circuits -v
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import extraction  # noqa: E402
from bot.config import BASE  # noqa: E402

FAMILLES = ("chambres", "circuits", "vehicules", "parcs")


def _connexion() -> sqlite3.Connection:
    cx = sqlite3.connect(f"file:{BASE.as_posix()}?mode=ro", uri=True)
    cx.row_factory = sqlite3.Row
    return cx


def _categories(brut: str | None) -> list[str]:
    try:
        return json.loads(brut or "[]")
    except (ValueError, TypeError):
        return []


def _lieux_connus(cx: sqlite3.Connection) -> list[str]:
    """Le référentiel de lieux, tel que `diako.lieux_connus()` le rend.

    On le relit ici directement plutôt que d'appeler `diako`, qui ouvrirait la
    base en écriture — ce script ne doit jamais pouvoir écrire.
    """
    noms = [r["nom"] for r in cx.execute("SELECT nom FROM ref_lieux WHERE nom <> ''")]
    return sorted(noms, key=len, reverse=True)


# ── Chambres ────────────────────────────────────────────────────────────────
def rejouer_chambres(cx: sqlite3.Connection, detail: bool) -> None:
    en_base, chiffrees = cx.execute(
        "SELECT COUNT(*), SUM(prix_ar IS NOT NULL) FROM lignes_chambre"
    ).fetchone()
    print(f"CHAMBRES — en base : {en_base} lignes, {chiffrees or 0} avec un prix.")

    total = pages = convertis = 0
    for r in cx.execute("SELECT id, nom_etab, texte, site_web FROM trouvailles"):
        lues = extraction.types_de_chambre(r["texte"])
        if not lues:
            continue
        pages += 1
        total += len(lues)
        convertis += sum(1 for c in lues if c.get("description"))
        if detail:
            print(f"\n  {r['nom_etab'] or '?'}  ({r['site_web'] or r['id'][:8]})")
            for c in lues:
                marque = " (converti)" if c.get("description") else ""
                print(f"     {c['prix_ar']:>9} Ar / {c['unite']:<8} {c['nom'][:52]}"
                      f"{marque}  {c['saison'] or ''}")
    print(f"  relecture par règles : {total} chambre(s) chiffrée(s) "
          f"sur {pages} trouvaille(s), dont {convertis} converties d'une devise.")


# ── Circuits ────────────────────────────────────────────────────────────────
def rejouer_circuits(cx: sqlite3.Connection, detail: bool) -> None:
    en_base = cx.execute("SELECT COUNT(*) FROM lignes_circuit").fetchone()[0]
    print(f"CIRCUITS — en base : {en_base} ligne(s).")

    lieux = _lieux_connus(cx)
    total = avec_prix = 0
    for r in cx.execute("SELECT id, nom_etab, categories, texte FROM trouvailles"):
        if "agence_voyage" not in _categories(r["categories"]):
            continue
        lus = extraction.circuits(r["texte"], lieux)
        for c in lus:
            total += 1
            avec_prix += 1 if c["prix_ar"] else 0
            if detail:
                duree = f"{c['jours']}j" + (f"/{c['nuits']}n" if c["nuits"] else "")
                print(f"\n  [{duree:>7}] {c['titre'][:64]}")
                print(f"     prix    : {c['prix_ar'] or '—'} ({c['prix_unite']})")
                print(f"     trajet  : {c['depart'] or '—'} → {c['arrivee'] or '—'}")
                print(f"     inclus  : {', '.join(c['inclus']) or '—'}")
                print(f"     transp. : {', '.join(c['transports']) or '—'}")
    print(f"  relecture par règles : {total} circuit(s), dont {avec_prix} tarifé(s).")


# ── Véhicules ───────────────────────────────────────────────────────────────
def rejouer_vehicules(cx: sqlite3.Connection, detail: bool) -> None:
    en_base, tarifees = cx.execute(
        "SELECT COUNT(*), SUM(prix_jour_ar IS NOT NULL) FROM lignes_vehicule"
    ).fetchone()
    print(f"VÉHICULES — en base : {en_base} ligne(s), {tarifees or 0} tarifée(s).")

    vues = total = avec_prix = 0
    muettes = []
    for r in cx.execute("SELECT id, nom_etab, categories, texte FROM trouvailles"):
        cats = _categories(r["categories"])
        if not any(c in cats for c in ("location_vehicule", "transporteur")):
            continue
        vues += 1
        lues = extraction.lignes_vehicule(r["texte"])
        if not lues:
            muettes.append(r)
            continue
        total += len(lues)
        avec_prix += sum(1 for v in lues if v.get("prix_jour_ar"))
        if detail:
            print(f"\n  {r['nom_etab'] or '?'}  ({r['id'][:8]})")
            for v in lues:
                print(f"     {str(v.get('prix_jour_ar') or '—'):>9} Ar/jour  "
                      f"{v['type_vehicule']:<9} {v.get('modele') or '':<14}"
                      f" chauffeur={v.get('avec_chauffeur')}"
                      f" carburant={v.get('carburant_inclus')}"
                      f" note={v.get('note_prix') or '—'}")
    print(f"  relecture par règles : {total} offre(s) sur {vues} trouvaille(s), "
          f"dont {avec_prix} avec un prix par jour ; {len(muettes)} muettes.")
    if detail and muettes:
        print("\n  Trouvailles sans aucune offre lue :")
        for r in muettes:
            premiere = next((l.strip() for l in r["texte"].split("\n") if l.strip()), "")
            print(f"     {r['id'][:8]}  {premiere[:70]}")


# ── Parcs (droits d'entrée) ─────────────────────────────────────────────────
def rejouer_parcs(cx: sqlite3.Connection, detail: bool) -> None:
    rapprochees = cx.execute(
        "SELECT COUNT(*) FROM trouvailles WHERE site_id IS NOT NULL"
    ).fetchone()[0]
    print(f"PARCS — {rapprochees} trouvaille(s) rapprochée(s) d'un site du référentiel.")

    lus = 0
    compteur = {"resident_ar": 0, "nonresident_ar": 0,
                "guide_obligatoire": 0, "guide_groupe_ar": 0}
    for r in cx.execute(
        "SELECT id, site_id, site_nom, texte FROM trouvailles WHERE site_id IS NOT NULL"
    ):
        tarifs = extraction.droits_entree(r["texte"], r["site_nom"] or "")
        poses = {k: v for k, v in tarifs.items() if v is not None}
        if not poses:
            continue
        lus += 1
        for cle in poses:
            compteur[cle] += 1
        if detail:
            print(f"  {r['site_nom'] or r['site_id'][:8]:38s} {poses}")
    print(f"  relecture par règles : {lus} trouvaille(s) donnent au moins un tarif "
          f"— {compteur}")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    detail = "-v" in sys.argv or "--detail" in sys.argv
    demandees = [a for a in args if a in FAMILLES] or list(FAMILLES)

    cx = _connexion()
    for famille in demandees:
        print("=" * 78)
        {"chambres": rejouer_chambres, "circuits": rejouer_circuits,
         "vehicules": rejouer_vehicules, "parcs": rejouer_parcs}[famille](cx, detail)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
