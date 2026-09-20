# -*- coding: utf-8 -*-
"""attendre_et_programmer.py — attend que la fenetre de Facebook s'ouvre, puis programme
la DERNIERE publication de la serie 2 (19/10 12:00, d-recit).

    pythonw marketing/atelier/attendre_et_programmer.py       # detache, sans fenetre

Pourquoi : Facebook refuse toute programmation au-dela d'environ 28,9 jours. Le 20/09 a
07 h 18, le 19/10 12:00 etait encore a 29,2 jours (refus HTTP 400 code 100). La fenetre
s'ouvre vers 14 h 00 ; ce veilleur reessaie toutes les 15 minutes jusqu'a ce que ce soit fait.

Gardes :
  · VERROU (dossier cree atomiquement) : deux copies ne tournent jamais ensemble, meme si
    Andry double-clique programmer-la-suite.cmd pendant que le veilleur tourne ;
  · borne dure : 48 essais au plus (12 h), puis il s'arrete en le disant dans son journal ;
  · le programmateur relit la file de Facebook avant chaque envoi : aucun doublon possible ;
  · journal attendre.log, une ligne par essai, pour qu'un echec ne soit pas invisible.
"""
from __future__ import annotations

import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ICI = Path(__file__).resolve().parent
DEPOT = ICI.parents[1]
JOURNAL = ICI / "attendre.log"
VERROU = ICI / ".verrou-attente"
ESSAIS = 48
PAUSE = 15 * 60


def noter(texte: str) -> None:
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now():%d/%m %H:%M}  {texte}\n")


def main() -> int:
    try:
        VERROU.mkdir()
    except FileExistsError:
        noter("une autre copie tourne deja (verrou) : rien fait")
        return 1
    try:
        for essai in range(1, ESSAIS + 1):
            r = subprocess.run([sys.executable, str(ICI / "programmer.py"), "--sortie", "sortie2",
                                "--fenetre-jours", "28.95"], cwd=str(DEPOT), capture_output=True,
                               text=True, encoding="utf-8", errors="replace")
            sortie = (r.stdout or "") + (r.stderr or "")
            derniere = [l for l in sortie.splitlines() if l.strip()][-1] if sortie.strip() else "(aucune sortie)"
            noter(f"essai {essai}/{ESSAIS} : {derniere[:200]}")
            if "programmee    2026-10-19-d-recit" in sortie or "deja en file  2026-10-19-d-recit" in sortie \
                    or "programmée    2026-10-19-d-recit" in sortie or "déjà en file  2026-10-19-d-recit" in sortie:
                noter("FAIT : la serie 2 est complete (30/30)")
                return 0
            time.sleep(PAUSE)
        noter("ARRET : 48 essais sans succes, a reprendre a la main")
        return 1
    finally:
        VERROU.rmdir()


if __name__ == "__main__":
    sys.exit(main())
