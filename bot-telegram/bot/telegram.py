"""La passerelle Telegram : lire les messages d'Andry, lui répondre.

Trois principes, tirés de ce qui a déjà coûté cher sur les autres bots :

  ① **Un seul relève les messages.** Telegram refuse deux lecteurs sur le même
     jeton (409 Conflict) et, le jour où c'est arrivé, les cinq bots Hermes
     sont tombés ensemble. Le bot prend donc un verrou de fichier au démarrage
     et refuse de tourner en double.

  ② **Rien ne part sans laisser de trace.** Tout envoi est écrit dans
     `logs/telegram-out.log` AVANT d'être envoyé : sans ce journal, un envoi
     refusé par l'API est un silence, et un silence ne se diagnostique pas.

  ③ **Sans jeton, le bot fonctionne quand même — en simulation.** Les
     compétences, le cerveau et la file de validation se testent alors de bout
     en bout, l'envoi étant simplement écrit dans le journal. C'est ce qui
     permet de tout vérifier avant qu'Andry ne crée le bot chez BotFather.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import requests

from . import config

API = "https://api.telegram.org/bot{jeton}/{methode}"
JOURNAL_SORTIE = config.DOSSIER_JOURNAUX / "telegram-out.log"
FICHIER_DECALAGE = config.DOSSIER_DONNEES / "telegram-offset.json"
VERROU = config.DOSSIER_DONNEES / "telegram.lock"


@dataclass
class Message:
    """Ce qu'on retient d'une mise à jour Telegram."""

    chat_id: str
    texte: str
    auteur: str
    message_id: int | None = None
    # Renseigné quand la mise à jour est un clic sur un bouton.
    rappel: str | None = None
    rappel_id: str | None = None
    piece_jointe: dict[str, Any] | None = None
    brut: dict[str, Any] = field(default_factory=dict)

    @property
    def est_clic(self) -> bool:
        return self.rappel is not None


def _journaliser(sens: str, charge: dict) -> None:
    config.DOSSIER_JOURNAUX.mkdir(parents=True, exist_ok=True)
    ligne = json.dumps(
        {"quand": datetime.now().isoformat(timespec="seconds"), "sens": sens, **charge},
        ensure_ascii=False,
    )
    with JOURNAL_SORTIE.open("a", encoding="utf-8") as f:
        f.write(ligne + "\n")


class Telegram:
    """Le canal. `simulation=True` n'appelle jamais l'API."""

    def __init__(self, jeton: str | None = None, simulation: bool | None = None) -> None:
        self.jeton = jeton if jeton is not None else config.jeton_telegram()
        self.simulation = (not self.jeton) if simulation is None else simulation
        self.id_autorise = config.id_andry()
        self._dernier_envoi = 0.0

    # ── Lecture ──────────────────────────────────────────────────────────
    def _decalage(self) -> int:
        if FICHIER_DECALAGE.exists():
            try:
                return int(json.loads(FICHIER_DECALAGE.read_text(encoding="utf-8"))["offset"])
            except (json.JSONDecodeError, KeyError, ValueError):
                return 0
        return 0

    def _poser_decalage(self, valeur: int) -> None:
        config.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
        FICHIER_DECALAGE.write_text(json.dumps({"offset": valeur}), encoding="utf-8")

    def relever(self, attente: int = 25) -> list[Message]:
        """Les messages en attente. Liste vide en simulation."""
        if self.simulation:
            return []
        r = requests.get(
            API.format(jeton=self.jeton, methode="getUpdates"),
            params={"offset": self._decalage(), "timeout": attente,
                    "allowed_updates": json.dumps(["message", "callback_query"])},
            timeout=attente + 10,
        )
        if r.status_code == 409:
            raise RuntimeError(
                "409 Conflict : un autre programme relève déjà ce jeton Telegram. "
                "Un seul lecteur par jeton — voir hermes/CLAUDE.md."
            )
        r.raise_for_status()
        messages: list[Message] = []
        dernier = 0
        for maj in r.json().get("result", []):
            dernier = max(dernier, int(maj["update_id"]))
            m = self._convertir(maj)
            if m:
                messages.append(m)
        if dernier:
            self._poser_decalage(dernier + 1)
        return messages

    def _convertir(self, maj: dict) -> Message | None:
        if "callback_query" in maj:
            cq = maj["callback_query"]
            msg = cq.get("message", {})
            return Message(
                chat_id=str(msg.get("chat", {}).get("id", "")),
                texte="",
                auteur=str(cq.get("from", {}).get("id", "")),
                message_id=msg.get("message_id"),
                rappel=cq.get("data"),
                rappel_id=cq.get("id"),
                brut=maj,
            )
        msg = maj.get("message") or maj.get("edited_message")
        if not msg:
            return None
        piece = None
        for cle in ("photo", "document", "voice", "audio", "video"):
            if cle in msg:
                piece = {"type": cle, "contenu": msg[cle]}
                break
        return Message(
            chat_id=str(msg.get("chat", {}).get("id", "")),
            texte=(msg.get("text") or msg.get("caption") or "").strip(),
            auteur=str(msg.get("from", {}).get("id", "")),
            message_id=msg.get("message_id"),
            piece_jointe=piece,
            brut=maj,
        )

    def autorise(self, message: Message) -> bool:
        """Le bot ne parle qu'à Andry : sa page et son site sont derrière."""
        if not self.id_autorise:
            return False
        return message.auteur == self.id_autorise

    # ── Écriture ─────────────────────────────────────────────────────────
    def _appeler(self, methode: str, charge: dict) -> dict:
        _journaliser("sortie", {"methode": methode, **charge})
        if self.simulation:
            return {"ok": True, "simulation": True}
        # Un rythme minimal : Telegram coupe au-delà de ~30 messages/seconde,
        # et un bot qui se fait couper perd la réponse, pas seulement du temps.
        ecart = time.monotonic() - self._dernier_envoi
        rythme = float(config.charger().get("rythme_telegram_s", 1.0))
        if ecart < rythme:
            time.sleep(rythme - ecart)
        self._dernier_envoi = time.monotonic()
        r = requests.post(API.format(jeton=self.jeton, methode=methode), json=charge, timeout=60)
        if not r.ok:
            _journaliser("erreur", {"methode": methode, "code": r.status_code, "corps": r.text[:400]})
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    def envoyer(self, chat_id: str, texte: str, boutons: list[list[dict]] | None = None) -> dict:
        """Un message. `boutons` = lignes de {'texte': …, 'action': …}."""
        charge: dict[str, Any] = {
            "chat_id": chat_id,
            # ⚠ Pas de Markdown : un nom d'établissement avec un `_` ou un `*`
            #   fait échouer l'envoi entier, et on perd la réponse.
            "text": texte[:4000],
            "disable_web_page_preview": True,
        }
        if boutons:
            charge["reply_markup"] = {
                "inline_keyboard": [
                    [{"text": b["texte"], "callback_data": b["action"][:64]} for b in ligne]
                    for ligne in boutons
                ]
            }
        return self._appeler("sendMessage", charge)

    def accuser_clic(self, rappel_id: str, texte: str = "") -> dict:
        return self._appeler("answerCallbackQuery", {"callback_query_id": rappel_id, "text": texte[:190]})

    def envoyer_photo(self, chat_id: str, chemin: Path, legende: str = "") -> dict:
        """Une image du disque (affiche fabriquée, capture d'écran)."""
        _journaliser("sortie", {"methode": "sendPhoto", "chat_id": chat_id,
                                "fichier": str(chemin), "legende": legende[:200]})
        if self.simulation:
            return {"ok": True, "simulation": True}
        with chemin.open("rb") as f:
            r = requests.post(
                API.format(jeton=self.jeton, methode="sendPhoto"),
                data={"chat_id": chat_id, "caption": legende[:1000]},
                files={"photo": (chemin.name, f)},
                timeout=120,
            )
        return r.json() if r.ok else {"ok": False, "erreur": r.text[:300]}


def prendre_verrou() -> bool:
    """Empêche deux relevés sur le même jeton (409 Conflict garanti sinon)."""
    config.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    try:
        VERROU.touch(exist_ok=False)
        return True
    except FileExistsError:
        # Un verrou de plus de 10 minutes est un reste de plantage, pas un bot vivant.
        age = time.time() - VERROU.stat().st_mtime
        if age > 600:
            VERROU.touch()
            return True
        return False


def rendre_verrou() -> None:
    VERROU.unlink(missing_ok=True)
