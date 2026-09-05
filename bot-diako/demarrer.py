#!/usr/bin/env python
"""Point d'entrée du bot Diako : lance le serveur local et ouvre l'interface.

    python demarrer.py            -> http://127.0.0.1:8757
    python demarrer.py --port 9000
    python demarrer.py --sans-navigateur

Le port 8757 est volontairement voisin du 8756 du bot immobilier : les deux
peuvent tourner en même temps sans se marcher dessus.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

# La console Windows est en cp1252 : sans ça, un simple accent dans le journal
# fait planter le serveur au démarrage.
for flux in (sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bot.serveur import demarrer  # noqa: E402  (après la reconfiguration des flux)

TAILLE_MAX_JOURNAL = 2 * 1024 * 1024      # au-delà, le précédent passe en .1


def journaliser_les_plantages(rediriger_stderr: bool) -> Path:
    """Envoie les plantages (et stderr en mode sans fenêtre) dans `data/bot-erreurs.log`.

    🔴 POURQUOI. Le gardien (`outils/gardien.ps1`) lance le bot SANS fenêtre.
    Tout ce que Python écrit sur stderr — une exception dans un fil, un
    avertissement uvicorn, un plantage du pilote Playwright — partait dans le
    vide. Le 02/09/2026, `gardien.log` comptait 18 relances depuis le 23/08 et
    il était impossible de dire lesquelles étaient des plantages du bot et
    lesquelles des morts de la machine (les journaux Windows ont montré trois
    redémarrages brutaux ce jour-là). Un bot qui meurt doit laisser une trace
    là où on la cherchera.

    `faulthandler` couvre ce que Python ne peut pas attraper lui-même : un
    segfault dans une bibliothèque native, un arrêt sur manque de mémoire.
    """
    from bot.config import DOSSIER_DONNEES

    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    chemin = DOSSIER_DONNEES / "bot-erreurs.log"
    try:
        if chemin.exists() and chemin.stat().st_size > TAILLE_MAX_JOURNAL:
            chemin.replace(chemin.with_suffix(".log.1"))
    except OSError:
        pass
    fichier = open(chemin, "a", encoding="utf-8", buffering=1)      # noqa: SIM115
    fichier.write(
        f"\n=== démarrage {datetime.now():%Y-%m-%d %H:%M:%S} (pid {os.getpid()}) ===\n"
    )
    if rediriger_stderr:
        sys.stderr = fichier
    import faulthandler
    faulthandler.enable(file=fichier, all_threads=True)
    return chemin


if __name__ == "__main__":
    analyseur = argparse.ArgumentParser(description="Bot de collecte Diako")
    analyseur.add_argument("--port", type=int, default=8757)
    analyseur.add_argument("--sans-navigateur", action="store_true")
    arguments = analyseur.parse_args()

    # Sans fenêtre (gardien, tâche planifiée), stderr n'a nulle part où aller :
    # on le détourne vers le fichier. Avec une fenêtre, on garde la console et
    # on n'y ajoute que les plantages durs.
    journal = journaliser_les_plantages(rediriger_stderr=arguments.sans_navigateur)

    print(f"Interface : http://127.0.0.1:{arguments.port}   (Ctrl+C pour arrêter)")
    print(f"Plantages : {journal}")
    demarrer(port=arguments.port, ouvrir=not arguments.sans_navigateur)
