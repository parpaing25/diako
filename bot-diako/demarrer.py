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
import sys

# La console Windows est en cp1252 : sans ça, un simple accent dans le journal
# fait planter le serveur au démarrage.
for flux in (sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

from bot.serveur import demarrer  # noqa: E402  (après la reconfiguration des flux)

if __name__ == "__main__":
    analyseur = argparse.ArgumentParser(description="Bot de collecte Diako")
    analyseur.add_argument("--port", type=int, default=8757)
    analyseur.add_argument("--sans-navigateur", action="store_true")
    arguments = analyseur.parse_args()

    print(f"Interface : http://127.0.0.1:{arguments.port}   (Ctrl+C pour arrêter)")
    demarrer(port=arguments.port, ouvrir=not arguments.sans_navigateur)
