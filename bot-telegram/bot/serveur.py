"""Le serveur local : la boucle Telegram, l'API d'état, une page de contrôle.

Rien n'est exposé au réseau : tout est sur 127.0.0.1, comme les autres bots du
PC. Le poste de pilotage (8760) lit `/api/etat` ; c'est le contrat commun.

La boucle Telegram tourne dans un fil séparé. Sans jeton, elle ne démarre pas
et le bot reste utilisable par `/api/simuler` — c'est ainsi qu'on l'éprouve
avant qu'Andry n'ait créé le bot chez BotFather.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import cerveau, competences, config, telegram, validation, veilleur

RACINE = Path(__file__).resolve().parent.parent
app = FastAPI(title="Bot Di'ako")

_etat = {
    "demarre_a": datetime.now().isoformat(timespec="seconds"),
    "derniere_activite": None,
    "messages_traites": 0,
    "erreurs": 0,
    "telegram": "non démarré",
}
_canal: telegram.Telegram | None = None


def _prevenir_andry(texte: str) -> None:
    """Porte un mot à Andry sur Telegram. LÈVE si le canal est muet.

    L'exception est VOULUE : le veilleur ne marque une demande « signalée »
    que si l'envoi a réussi. Sans cela, une panne de Telegram ferait
    disparaître en silence la question d'un client.
    """
    if _canal is None or _canal.simulation or not _canal.id_autorise:
        raise RuntimeError("Telegram indisponible")
    _canal.envoyer(_canal.id_autorise, texte)


VEILLEUR = veilleur.Veilleur(_prevenir_andry)


# ── La boucle Telegram ────────────────────────────────────────────────────
def _boucle() -> None:
    global _canal
    _canal = telegram.Telegram()
    if _canal.simulation:
        _etat["telegram"] = "simulation (aucun jeton dans ~/.diako-secrets/telegram_bot_diako.txt)"
        return
    if not telegram.prendre_verrou():
        _etat["telegram"] = "arrêté : un autre programme relève déjà ce jeton"
        return
    if not _canal.id_autorise:
        _etat["telegram"] = "arrêté : aucun identifiant Telegram autorisé"
        return
    _etat["telegram"] = "à l'écoute"
    try:
        while True:
            try:
                for message in _canal.relever():
                    _traiter(message)
            except RuntimeError as e:      # 409 : deux lecteurs sur le même jeton
                _etat["telegram"] = str(e)
                _etat["erreurs"] += 1
                return
            except Exception as e:         # une panne réseau ne tue pas la boucle
                _etat["erreurs"] += 1
                _etat["telegram"] = f"erreur passagère : {type(e).__name__}"
                time.sleep(5)
    finally:
        telegram.rendre_verrou()


def _traiter(message: telegram.Message) -> None:
    assert _canal is not None
    if not _canal.autorise(message):
        # On ne répond RIEN à un inconnu : la page et le site sont derrière ce bot.
        return
    _etat["derniere_activite"] = datetime.now().isoformat(timespec="seconds")
    _etat["messages_traites"] += 1
    if message.rappel_id:
        _canal.accuser_clic(message.rappel_id)
    reponse = cerveau.traiter(message.chat_id, message.texte, message.rappel)
    _canal.envoyer(message.chat_id, reponse.texte, reponse.boutons or None)
    for image in reponse.images[:5]:
        if Path(image).exists():
            _canal.envoyer_photo(message.chat_id, Path(image))


@app.on_event("startup")
def _demarrer() -> None:
    competences.charger_toutes()
    validation.purger()
    threading.Thread(target=_boucle, daemon=True, name="telegram").start()
    # La page répond seule : commentaires et messages, toutes les ~25 min.
    # Voir bot/veilleur.py et bot/auto_page.py.
    VEILLEUR.demarrer()


# ── L'API ─────────────────────────────────────────────────────────────────
@app.get("/api/etat")
def etat() -> dict:
    """Le contrat attendu par le poste de pilotage (8760)."""
    return {
        "bot": "diako-telegram",
        "titre": "Bot Di'ako (Telegram)",
        "port": config.PORT,
        **_etat,
        "competences": len(competences.REGISTRE),
        "veille_page": VEILLEUR.etat(),
        "en_attente": len(validation.en_attente()),
        "page": config.PAGE_DIAKO,
        "jeton_page": bool(config.jeton_page()),
    }


@app.get("/api/competences")
def liste_competences() -> dict:
    return {
        "familles": {
            famille: [
                {"nom": c.nom, "titre": c.titre, "description": c.description,
                 "publique": c.publique, "parametres": c.parametres,
                 "exemples": list(c.exemples)}
                for c in liste
            ]
            for famille, liste in competences.par_famille().items()
        }
    }


@app.get("/api/validations")
def validations() -> dict:
    return {"attente": validation.en_attente()}


class Demande(BaseModel):
    texte: str = ""
    rappel: str | None = None
    chat_id: str = "simulation"


@app.post("/api/simuler")
def simuler(demande: Demande) -> dict:
    """Joue un message SANS Telegram : c'est le banc d'essai du bot."""
    reponse = cerveau.traiter(demande.chat_id, demande.texte, demande.rappel)
    return {
        "texte": reponse.texte,
        "boutons": reponse.boutons,
        "images": [str(i) for i in reponse.images],
    }


@app.get("/api/journal")
def journal(lignes: int = 60) -> JSONResponse:
    fichier = telegram.JOURNAL_SORTIE
    if not fichier.exists():
        return JSONResponse({"lignes": []})
    contenu = fichier.read_text(encoding="utf-8").splitlines()[-max(1, min(500, lignes)):]
    return JSONResponse({"lignes": contenu})


@app.get("/")
def accueil() -> FileResponse:
    return FileResponse(RACINE / "web" / "index.html")
