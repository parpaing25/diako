"""Démarre le bot Di'ako : serveur local (127.0.0.1:8763) + écoute Telegram.

    python demarrer.py                       # ouvre l'interface
    python demarrer.py --sans-navigateur     # ce que lance le gardien
    python demarrer.py --port 8763

⚠ LES ARGUMENTS SONT CEUX DU GARDIEN, PAS LES MIENS. `~/bots-hub/gardien-tous.ps1`
  relance chaque bot par « python demarrer.py --sans-navigateur --port <port> » :
  un bot qui ne comprend pas ces deux options ne redémarre jamais tout seul, et
  personne ne s'en aperçoit tant qu'il n'est pas tombé.

🔴 DEUX SERVEURS PEUVENT SE LIER AU MÊME PORT SOUS WINDOWS. Le premier lié
   répond, le second se tait — et on croit tester le code qu'on vient d'écrire
   alors qu'un ancien processus répond à sa place. Mesuré le 20/09/2026 sur ce
   bot : trois instances vivantes, celle qui répondait datait d'avant deux
   correctifs. On refuse donc de démarrer si le port répond déjà.

Sans jeton Telegram, le bot démarre quand même : l'interface et `/api/simuler`
permettent de tout éprouver. Le jeton se pose dans
`~/.diako-secrets/telegram_bot_diako.txt` (une ligne, celle que donne BotFather).
"""
from __future__ import annotations

import argparse
import socket
import threading
import webbrowser

import uvicorn

from bot import config


def port_deja_tenu(port: int) -> bool:
    """Quelqu'un écoute-t-il déjà ? (connexion, pas bind : le bind réussirait.)"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def main() -> int:
    analyseur = argparse.ArgumentParser(description="Bot Di'ako")
    analyseur.add_argument("--port", type=int, default=config.PORT)
    analyseur.add_argument("--sans-navigateur", "--muet", dest="muet", action="store_true",
                           help="ne pas ouvrir l'interface (tâche planifiée, gardien)")
    analyseur.add_argument("--forcer", action="store_true",
                           help="démarrer même si le port répond déjà (à éviter)")
    options = analyseur.parse_args()

    if port_deja_tenu(options.port) and not options.forcer:
        print(f"Le port {options.port} répond déjà : un bot Di'ako tourne. "
              f"Je ne démarre pas une seconde instance (elle serait muette).")
        return 0

    adresse = f"http://127.0.0.1:{options.port}/"
    if not options.muet:
        threading.Timer(1.5, lambda: webbrowser.open(adresse)).start()
    print(f"Bot Di'ako — {adresse}")
    print("Telegram :", "jeton présent" if config.jeton_telegram() else "AUCUN jeton (mode simulation)")
    uvicorn.run("bot.serveur:app", host="127.0.0.1", port=options.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
