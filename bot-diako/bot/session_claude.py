"""Une session Claude tourne-t-elle sur ce PC ? Alors pas de tournée Facebook.

🔴 RÈGLE POSÉE PAR ANDRY LE 03/09/2026 : « quand une session tourne ici, il
faut impérativement arrêter les tâches des bots de collecte pour ne pas
bouffer toute la RAM ». L'incident : événement Windows 2004 (mémoire
épuisée) à 11 h 10, la tournée AKORA de 14 h 28 qui perd son navigateur à
852 Mo libres, quatre sessions Claude ouvertes la veille à 751 Mo libres.

Ce qui mange la RAM, c'est CHROMIUM pendant une tournée — près d'un gigaoctet
par bot — pas le serveur. Donc le bot reste debout ; c'est la tournée
AUTOMATIQUE qui attend. Un clic humain sur « Lancer la collecte » reste
possible : la règle vise les tâches, pas la main d'Andry.

Le signal vient de `~/.claude/outils/session_active.py` : chaque session
Claude dépose un marqueur dans `~/.claude/sessions-actives/`, rafraîchi à
chaque message, retiré à la fin. Une session peut mourir sans adieu : un
marqueur sans nouvelle depuis FRAICHEUR_MIN minutes ne compte plus.

⚠ CE MODULE EST COPIÉ À L'IDENTIQUE dans les trois bots de collecte
  (Fonenako 8756, Diako 8757, AKORA 8758). Toute correction se reporte sur
  les trois copies — même convention que `verrou_navigateur.py`.
"""
from __future__ import annotations

import time
from pathlib import Path

DOSSIER = Path.home() / ".claude" / "sessions-actives"
FRAICHEUR_MIN = 120


def active(fraicheur_min: int = FRAICHEUR_MIN) -> str | None:
    """Une phrase qui dit pourquoi on attend, ou None si la voie est libre.

    Jamais d'exception : un dossier absent ou illisible vaut « personne ».
    """
    try:
        if not DOSSIER.exists():
            return None
        maintenant = time.time()
        ages = []
        for marqueur in DOSSIER.glob("*.json"):
            try:
                age = (maintenant - marqueur.stat().st_mtime) / 60
            except OSError:
                continue
            if age < fraicheur_min:
                ages.append(age)
    except Exception:                                     # noqa: BLE001
        return None
    if not ages:
        return None
    return (f"{len(ages)} session(s) Claude active(s) sur ce PC — dernier signe "
            f"il y a {int(min(ages))} min")
