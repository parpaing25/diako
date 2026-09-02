"""La santé du bot, pour le rail de l'interface : est-il en état de faire son travail ?

Quatre voyants, tous mesurés au moment de la demande (ou mis en cache quelques
minutes quand la mesure coûte un appel réseau) :

- **le bot** — depuis quand il tourne, et ce que l'arrêt précédent a laissé ;
- **Facebook** — la session est-elle enregistrée ;
- **l'IA** — la passerelle répond-elle (le chemin réglé, pas un autre) ;
- **la mémoire** — reste-t-il de quoi ouvrir Chromium (`memoire_mini_mo`).

🔴 POURQUOI UN MODULE À PART. Le 02/09/2026, le tableau de bord affichait
« Compte Facebook connecté, 409 sources surveillées » pendant que la collecte
de 18 h sautait sa partie Facebook faute de mémoire (214 Mo libres), que la
passerelle rendait 429 par vagues, et que 311 trouvailles dormaient « en
lecture » depuis dix jours. Tout allait bien à l'écran ; rien n'allait. Ce que
le bot ne peut pas faire doit se voir AVANT de lancer quoi que ce soit.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

import requests

from . import base
from .config import DOSSIER_DONNEES

DEMARRE_A = datetime.now(timezone.utc)
JOURNAL_ERREURS = DOSSIER_DONNEES / "bot-erreurs.log"

_ia = {"verifie_a": 0.0, "ok": None, "detail": ""}
_verrou = threading.Lock()
CACHE_IA_S = 300


def _verifier_ia(config: dict) -> dict:
    """Interroge la passerelle au plus une fois toutes les cinq minutes."""
    transport = config.get("llm_transport") or "passerelle"
    if not config.get("llm_actif"):
        return {"ok": None, "detail": "relecture éteinte", "chemin": transport}
    if transport == "anthropic":
        return {"ok": None, "detail": "API Claude (non sondée)", "chemin": transport}

    with _verrou:
        if time.time() - _ia["verifie_a"] < CACHE_IA_S:
            return {"ok": _ia["ok"], "detail": _ia["detail"], "chemin": transport}
    adresse = (config.get("llm_passerelle") or "http://127.0.0.1:4000").rstrip("/")
    ok, detail = False, ""
    try:
        r = requests.get(f"{adresse}/health/liveliness", timeout=3)
        ok = r.ok
        detail = "passerelle joignable" if ok else f"HTTP {r.status_code}"
    except requests.RequestException as e:
        detail = f"passerelle injoignable ({type(e).__name__})"
    with _verrou:
        _ia.update(verifie_a=time.time(), ok=ok, detail=detail)
    return {"ok": ok, "detail": detail, "chemin": transport}


def _erreurs_recentes() -> dict:
    """Ce que `data/bot-erreurs.log` dit du passé proche : démarrages et pannes."""
    if not JOURNAL_ERREURS.exists():
        return {"demarrages_24h": 0, "derniere_erreur": ""}
    try:
        lignes = JOURNAL_ERREURS.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return {"demarrages_24h": 0, "derniere_erreur": ""}
    aujourdhui = datetime.now()
    demarrages = 0
    derniere = ""
    for ligne in lignes[-2000:]:
        if ligne.startswith("=== démarrage "):
            try:
                quand = datetime.strptime(ligne[14:33], "%Y-%m-%d %H:%M:%S")
                if (aujourdhui - quand).total_seconds() < 86_400:
                    demarrages += 1
            except ValueError:
                pass
        elif "Error" in ligne or "Traceback" in ligne or "Fatal" in ligne:
            derniere = ligne.strip()[:160]
    return {"demarrages_24h": demarrages, "derniere_erreur": derniere}


def etat(config: dict, session_facebook: bool, memoire_libre_mo: int | None) -> dict:
    mini = int(config.get("memoire_mini_mo") or 900)
    return {
        "demarre_a": DEMARRE_A.isoformat(timespec="seconds"),
        "depuis_s": int((datetime.now(timezone.utc) - DEMARRE_A).total_seconds()),
        "facebook": bool(session_facebook),
        "ia": _verifier_ia(config),
        "memoire": {
            "libre_mo": memoire_libre_mo,
            "mini_mo": mini,
            "ok": None if memoire_libre_mo is None else memoire_libre_mo >= mini,
        },
        "en_lecture": base.compteurs().get("en_traitement", 0),
        **_erreurs_recentes(),
    }
