"""La file de validation : rien ne sort en public sans un clic d'Andry.

Le bot prépare l'action complète (texte, image, heure, destinataire), la range
ici avec un résumé lisible, et envoie deux boutons. Tant qu'il n'a pas cliqué,
rien n'est parti.

⚠ UNE ACTION EN ATTENTE EXPIRE. Une publication confirmée trois heures plus
  tard n'est plus celle qu'on avait préparée — les chiffres ont bougé, l'heure
  visée est passée. Au-delà de `DUREE_MINUTES`, la confirmation est refusée et
  l'action doit être refaite.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from . import competences, config

FICHIER = config.DOSSIER_DONNEES / "validations.json"
DUREE_MINUTES = 60


def _lire() -> dict[str, dict]:
    if not FICHIER.exists():
        return {}
    try:
        return json.loads(FICHIER.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _ecrire(tout: dict[str, dict]) -> None:
    config.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    FICHIER.write_text(json.dumps(tout, ensure_ascii=False, indent=2), encoding="utf-8")


def deposer(nom: str, arguments: dict[str, Any], resume: str) -> str:
    """Range une action à confirmer et rend son identifiant (court, pour un bouton)."""
    tout = _lire()
    cle = uuid.uuid4().hex[:10]
    tout[cle] = {
        "competence": nom,
        "arguments": arguments,
        "resume": resume,
        "cree_a": datetime.now().isoformat(timespec="seconds"),
        "etat": "en_attente",
    }
    _ecrire(tout)
    return cle


def lire(cle: str) -> dict | None:
    return _lire().get(cle)


def en_attente() -> list[dict]:
    return [
        {"cle": cle, **v}
        for cle, v in sorted(_lire().items(), key=lambda kv: kv[1]["cree_a"])
        if v.get("etat") == "en_attente"
    ]


def _marquer(cle: str, etat: str, note: str = "") -> None:
    tout = _lire()
    if cle in tout:
        tout[cle]["etat"] = etat
        tout[cle]["fini_a"] = datetime.now().isoformat(timespec="seconds")
        if note:
            tout[cle]["note"] = note[:500]
        _ecrire(tout)


def confirmer(cle: str) -> competences.Resultat:
    """Exécute l'action rangée sous `cle`, si elle est encore valable."""
    action = lire(cle)
    if action is None:
        return competences.Resultat(texte="Cette demande n'existe plus.", ok=False)
    if action.get("etat") != "en_attente":
        return competences.Resultat(
            texte=f"Déjà traitée ({action.get('etat')}).", ok=False
        )
    cree = datetime.fromisoformat(action["cree_a"])
    if datetime.now() - cree > timedelta(minutes=DUREE_MINUTES):
        _marquer(cle, "expiree")
        return competences.Resultat(
            texte=("Demande expirée (plus d'une heure). Je la refais si tu veux — "
                   "les chiffres et l'heure visée ont pu changer."),
            ok=False,
        )
    resultat = competences.executer(action["competence"], action["arguments"])
    _marquer(cle, "faite" if resultat.ok else "echouee", resultat.texte)
    return resultat


def annuler(cle: str) -> competences.Resultat:
    action = lire(cle)
    if action is None or action.get("etat") != "en_attente":
        return competences.Resultat(texte="Rien à annuler.", ok=False)
    _marquer(cle, "annulee")
    return competences.Resultat(texte="Annulé. Rien n'est parti.")


def purger(jours: int = 7) -> int:
    """Oublie les actions traitées il y a plus de `jours`."""
    tout = _lire()
    limite = datetime.now() - timedelta(days=jours)
    a_jeter = [
        cle
        for cle, v in tout.items()
        if v.get("etat") != "en_attente"
        and datetime.fromisoformat(v.get("fini_a", v["cree_a"])) < limite
    ]
    for cle in a_jeter:
        del tout[cle]
    if a_jeter:
        _ecrire(tout)
    return len(a_jeter)
