# -*- coding: utf-8 -*-
"""Retirer des textes DEJA EN LIGNE le chrome de Facebook qui s'y est glisse.

POURQUOI (03/09/2026). Apres le nettoyage du fil, 106 des 213 recits encore
visibles portaient dans leur corps « Voir moins... », « Contenu IA »,
« . Suivre », « Ecrivez un commentaire public... » ou « Indicateur de statut
En ligne » : des morceaux de l'interface de Facebook, captures avec le texte.
Un recit affichait meme deux fois sa ligne de provenance.

`redaction.nettoyer()` ne voyait que les LIGNES entieres de bruit ; ce qui
etait colle au texte passait. C'est corrige pour les prochaines publications
(`extraction.sans_bruit_de_fil`), mais le bot ne republie pas ce qu'il a deja
publie : les textes en ligne ne se corrigeront pas tout seuls.

GARDE-FOUS. On ne reecrit un texte que s'il reste substantiel : jamais vide,
jamais ampute de plus de 40 %. Les cas ecartes sont affiches, pas ecrits.
Mesure du 03/09 : 106 recits visibles a nettoyer, 1 seul ecarte (une page dont
l'auteur s'appelle litteralement « Indicateur de statut En ligne »).

    python outils/nettoyer_textes.py            # a blanc, montre ce qui changerait
    python outils/nettoyer_textes.py --ecrire   # applique

Les fiches (`pages.long_desc`, 323 concernees) ne sont PAS touchees ici :
`trg_pages_avant` est un BEFORE INSERT OR UPDATE, et toute ecriture sur une
fiche passe obligatoirement par `executer_sql(..., proprietaire=True)` sous
peine de la depublier. A traiter dans un second temps, avec ce prefixe.
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import base, diako  # noqa: E402
from bot.extraction import BRUIT_FIL, sans_bruit_de_fil  # noqa: E402

PERTE_MAX = 0.40


def propre(texte: str) -> str:
    """Le texte sans le chrome, sans ligne de provenance en double."""
    lignes = [l for l in (texte or "").split("\n") if not BRUIT_FIL.match(l.strip())]
    net = sans_bruit_de_fil("\n".join(lignes))

    vues, gardees = set(), []
    for ligne in net.split("\n"):
        cle = ligne.strip()
        if cle.startswith("Vu sur Facebook"):
            if cle in vues:
                continue
            vues.add(cle)
        gardees.append(ligne)
    net = re.sub(r"\n{3,}", "\n\n", "\n".join(gardees))
    return net.strip()


def main() -> None:
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
            flux.reconfigure(encoding="utf-8", errors="replace")

    analyseur = argparse.ArgumentParser(description="Nettoyer les textes publies")
    analyseur.add_argument("--ecrire", action="store_true")
    options = analyseur.parse_args()

    lignes = diako.executer_sql(
        "SELECT id, status, body FROM public.posts WHERE body IS NOT NULL AND body <> ''"
    ) or []

    ecritures, refuses, exemples = [], [], []
    for ligne in lignes:
        avant = ligne.get("body") or ""
        apres = propre(avant)
        if apres == avant.strip():
            continue
        if not apres or len(apres) < len(avant) * (1 - PERTE_MAX):
            refuses.append((ligne["id"], ligne.get("status"), len(avant), len(apres)))
            continue
        ecritures.append((ligne["id"], apres))
        if len(exemples) < 8:
            coupe = [m for m in ("Voir moins", "Voir plus", "Contenu IA", "Suivre",
                                 "commentaire public", "Indicateur de statut",
                                 "Vu sur Facebook")
                     if avant.count(m) > apres.count(m)]
            exemples.append((ligne.get("status"), ", ".join(coupe) or "espaces", apres[-70:]))

    print(f"{len(ecritures)} recit(s) a nettoyer sur {len(lignes)} relus.")
    for statut, coupe, fin in exemples:
        print(f"  [{statut}] retire : {coupe}")
        print("      ...", re.sub(r"\s+", " ", fin))
    if refuses:
        print(f"\n{len(refuses)} texte(s) ECARTES (perte > {int(PERTE_MAX * 100)} % ou vides) :")
        for ident, statut, a, b in refuses[:10]:
            print(f"  [{statut}] {ident} : {a} -> {b} caracteres")

    if not options.ecrire:
        print("\n(a blanc : rien n'a ete ecrit ; ajoutez --ecrire)")
        return
    if not ecritures:
        return

    par_lot = 40
    for debut in range(0, len(ecritures), par_lot):
        lot = ecritures[debut:debut + par_lot]
        requetes = [
            "UPDATE public.posts SET body = '{}' WHERE id = '{}'::uuid;".format(
                v.replace("'", "''"), i)
            for i, v in lot
        ]
        diako.executer_sql("\n".join(requetes), proprietaire=True)
        print(f"  ecrit {debut + len(lot)}/{len(ecritures)}")

    controle = diako.executer_sql(
        "SELECT count(*) FILTER (WHERE status = 'published') AS visibles_avec_bruit, "
        "count(*) AS tous FROM public.posts WHERE body ~* "
        "'(indicateur de statut|contenu ia|voir moins|voir plus|crivez un commentaire)'"
    )
    print(f"Controle apres ecriture : {controle}")
    base.logguer(
        f"Nettoyage des textes en ligne ({date.today().isoformat()}) : "
        f"{len(ecritures)} recit(s) debarrasses du chrome de Facebook.",
        niveau="avert",
    )


if __name__ == "__main__":
    main()
