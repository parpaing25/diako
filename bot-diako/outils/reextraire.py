#!/usr/bin/env python
"""Rejoue l'extraction PAR RÈGLES sur les trouvailles déjà collectées, et l'écrit.

Frère écrivain de `rejouer_extraction.py`, qui lui ne fait que compter. Celui-ci
remplace les lignes de chambres, de circuits et de véhicules par ce que les
règles d'aujourd'hui savent lire dans le texte déjà en base.

🔴 POURQUOI. Le 24/08/2026, `bot/extraction.py` a appris trois choses qu'il ne
savait pas : lire un prix affiché en euros (et le convertir en le disant), lire
un tarif écrit deux lignes sous le nom de la chambre, et lire une grille de
location de véhicule. Mesure sur le corpus : **60 → 239 chambres chiffrées,
0 → 16 circuits, 0 → 13 offres de véhicule**. Mais corriger le code ne corrige
pas le passé : ces lignes ont été figées au moment de la collecte. Sans ce
passage, il faudrait re-moissonner chaque site pour en profiter.

⚠⚠ CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ. Il n'appelle NI le modèle, NI un
rapprochement supplémentaire au catalogue. Leçon payée le même jour sur le bot
frère d'AKORA : un outil de rejeu qui « améliore » le chemin normal en
rappelant l'appariement a publié un rouleau de grillage comme de la tôle à
380 000 Ar, et une annonce de terrain comme de la brique. Un outil de rejeu
refait ce que fait le collecteur — exactement, pas mieux.

⚠ Les lignes que quelqu'un a décochées (`garder = 0`) sont respectées : on ne
les recrée pas, sinon le refus serait effacé à chaque passage.

Usage :
    python outils/reextraire.py            # à blanc : montre, n'écrit rien
    python outils/reextraire.py --ecrire   # écrit, après sauvegarde
"""
from __future__ import annotations

import shutil
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import base, diako, extraction  # noqa: E402
from bot.config import BASE, charger  # noqa: E402

FAMILLES = (
    ("lignes_chambre", "chambres", base.ajouter_ligne_chambre,
     base.supprimer_ligne_chambre),
    ("lignes_circuit", "circuits", base.ajouter_ligne_circuit,
     base.supprimer_ligne_circuit),
    ("lignes_vehicule", "véhicules", base.ajouter_ligne_vehicule,
     base.supprimer_ligne_vehicule),
)


def _relire(trouvaille: sqlite3.Row, cfg: dict, lieux: list[str]) -> dict:
    """Le MÊME chemin que le collecteur, selon l'origine de la trouvaille.

    ⚠ `lieux` est passé en argument, PAS relu ici : `diako.lieux_connus()`
    reconstruit une liste de 18 334 toponymes à chaque appel. Le faire par
    trouvaille (1 621 fois) mettait la passe hors de tout délai raisonnable.
    """
    # ⚠ `analyser` et `analyser_site` ne prennent PAS la config : les taux de
    # change passent par `taux=`, et seulement pour un site. C'est ce que fait
    # le collecteur, on ne fait rien de plus.
    texte = trouvaille["texte"] or ""
    if (trouvaille["source_genre"] or "") == "site":
        return extraction.analyser_site(
            texte, nom_connu=trouvaille["nom_etab"] or "",
            noms_de_lieux=lieux, taux=cfg.get("taux_ariary"))
    return extraction.analyser(texte, noms_de_lieux=lieux)


def principal() -> None:
    ecrire = "--ecrire" in sys.argv
    cfg = charger()
    # Le référentiel des lieux, chargé UNE fois pour toute la passe.
    lieux = diako.lieux_connus()

    cx = sqlite3.connect(f"file:{BASE}?mode=ro", uri=True)
    cx.row_factory = sqlite3.Row
    trouvailles = cx.execute(
        """SELECT t.id, t.texte, t.nom_etab, s.genre AS source_genre
             FROM trouvailles t LEFT JOIN sources s ON s.id = t.source_id
            WHERE t.texte IS NOT NULL AND t.texte <> ''""").fetchall()
    ancien = {nom: cx.execute(f"SELECT * FROM {nom}").fetchall()
              for nom, _, _, _ in FAMILLES}
    cx.close()

    par_trouvaille: dict = {nom: {} for nom, _, _, _ in FAMILLES}
    for nom, lignes in ancien.items():
        for l in lignes:
            par_trouvaille[nom].setdefault(l["trouvaille_id"], []).append(l)

    plan: dict = {nom: {"creer": [], "retirer": [], "respectees": 0}
                  for nom, _, _, _ in FAMILLES}
    echecs: list[str] = []

    for t in trouvailles:
        try:
            champs = _relire(t, cfg, lieux)
        except Exception as e:          # un texte illisible ne casse pas la passe…
            echecs.append(f"{t['id'][:8]} {type(e).__name__}: {e}"[:90])
            continue                    # …mais il se voit (cf. plus bas).
        for nom, _, _, _ in FAMILLES:
            neuves = champs.get(nom) or []
            vieilles = par_trouvaille[nom].get(t["id"], [])
            decochees = {(l["nom"] or "").strip().lower() for l in vieilles
                         if not l["garder"]}
            plan[nom]["respectees"] += len(decochees)
            plan[nom]["retirer"].extend(l["id"] for l in vieilles if l["garder"])
            for ligne in neuves:
                if (ligne.get("nom") or "").strip().lower() in decochees:
                    continue
                if nom == "lignes_circuit":
                    # Le collecteur rapproche les deux bouts du trajet.
                    for cote, cle in (("depart", "depart_id"),
                                      ("arrivee", "arrivee_id")):
                        lieu = diako.rapprocher_lieu(ligne.get(cote) or "")
                        ligne[cle] = lieu["id"] if lieu else None
                plan[nom]["creer"].append((t["id"], ligne))

    print(f"{len(trouvailles)} trouvailles relues\n")
    print(f"  {'':12} {'en base':>9} {'après':>7} {'chiffrées':>10}")
    for nom, libelle, _, _ in FAMILLES:
        chiffre = "prix_ar" if nom != "lignes_vehicule" else "prix_jour_ar"
        avant = len(ancien[nom])
        apres = len(plan[nom]["creer"])
        nb_prix = sum(1 for _, l in plan[nom]["creer"] if l.get(chiffre))
        print(f"  {libelle:12} {avant:>9} {apres:>7} {nb_prix:>10}")

    if not ecrire:
        print("\nÀ blanc : rien n'a été écrit. Relancer avec --ecrire.")
        return

    sauvegarde = Path(f"{BASE}.avant-reextraction-"
                      f"{__import__('datetime').datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(BASE, sauvegarde)
    print(f"\nSauvegarde : {sauvegarde.name}")

    for nom, libelle, ajouter, supprimer in FAMILLES:
        for lid in plan[nom]["retirer"]:
            supprimer(lid)
        for rang, (tid, ligne) in enumerate(plan[nom]["creer"], start=1):
            ajouter(tid, ligne, ordre=rang)
        print(f"  {libelle} : {len(plan[nom]['retirer'])} remplacée(s), "
              f"{len(plan[nom]['creer'])} écrite(s), "
              f"{plan[nom]['respectees']} décochée(s) respectée(s)")


if __name__ == "__main__":
    principal()
