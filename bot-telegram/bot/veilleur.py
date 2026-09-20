"""L'horloge de la page : une tournée toutes les ~25 minutes, sans Andry.

Le bot Di'ako a été écrit sur un principe — « rien ne sort en public sans un
clic d'Andry » (voir `validation.py`). Le 20/09/2026 il a retiré ce principe
pour tous les bots du parc : « il faut que je ne sois plus un blocage pour
eux ». Ce fil est ce qui remplace son clic sur les gestes qui ne peuvent pas
mal tourner ; tout le reste continue de passer par la file de validation.

CE QU'IL FAIT
· `auto_page.tournee()` : commentaires puis messages, chacun borné par la
  porte (12 commentaires/h, 40 messages/h) et jamais deux fois le même.
· Ce qui demande un humain part sur Telegram — une fois. Un rappel qui se
  répète toutes les 25 minutes devient un bruit qu'on n'ouvre plus.

CE QU'IL NE FAIT PAS
· Il ne publie pas. La publication reste commandée (`publier_page`,
  `programmer_page`) ou validée : une publication automatique demande un
  relecteur, et sur cette page il n'y en a pas encore.
· Il ne parle pas la nuit pour les commentaires : `garde.porte` refuse le
  canal « commentaire » entre 22 h et 6 h (Tana). Les messages passent, eux —
  quelqu'un qui écrit à 23 h attend une réponse.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import auto_page, config

TANA = timezone(timedelta(hours=3))
INTERVALLE_MIN = 25
PREMIER_REVEIL_S = 120          # le serveur vient de se lever, on le laisse respirer
FICHIER = config.DOSSIER_DONNEES / "veille_page.json"
MAX_RAPPELS = 6                 # par envoi Telegram : au-delà, on renvoie au tableau


def _lire() -> dict:
    try:
        return json.loads(FICHIER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _ecrire(etat: dict) -> None:
    config.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    FICHIER.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")


def _cle(item: dict) -> str:
    """Ce qui identifie durablement une demande, pour ne pas la re-signaler."""
    return f"{item.get('quoi')}:{item.get('id') or item.get('psid')}"


def _texte_pour_andry(nouveaux: list[dict], hors_fenetre: list[dict] | None = None) -> str:
    lignes = ["🗣️ Page Di'ako — ce que je n'ai pas voulu trancher :"]
    for it in nouveaux[:MAX_RAPPELS]:
        quoi = "commentaire" if it.get("quoi") == "commentaire" else "message privé"
        # Facebook retire le champ `from` des commentaires (RGPD) : le nom
        # est presque toujours vide. « de ? » ne renseigne personne.
        qui = (it.get("auteur") or "").strip()
        lignes.append(f"\n• [{it.get('humeur')}] {quoi}"
                      + (f" de {qui}" if qui else ""))
        lignes.append(f"  « {(it.get('texte') or '')[:160]} »")
        if it.get("permalien"):
            lignes.append(f"  {it['permalien']}")
    reste = len(nouveaux) - MAX_RAPPELS
    if reste > 0:
        lignes.append(f"\n… et {reste} autre(s). « commentaires recents » pour tout voir.")
    if hors_fenetre:
        # Meta n'accepte une réponse que dans les 24 h qui suivent le message
        # de la personne. Au-delà, l'API ne peut plus rien : seul Andry le peut,
        # depuis Business Suite. Le taire reviendrait à perdre ces gens.
        vieux = max((h.get("age_jours") or 0) for h in hors_fenetre)
        lignes.append(f"\n⏳ {len(hors_fenetre)} conversation(s) privée(s) attendent "
                      f"toujours, jusqu'à {vieux:.0f} jours — hors des 24 h de Meta, "
                      f"l'API ne peut plus répondre. À faire dans Business Suite.")
    return "\n".join(lignes)


class Veilleur:
    """Un fil, une horloge, et de quoi dire ce qu'il a fait."""

    def __init__(self, prevenir=None):
        # `prevenir(texte)` : ce qui porte un mot à Andry. Injecté, pour que ce
        # module ne dépende pas du client Telegram — et reste testable.
        self._prevenir = prevenir
        self._stop = threading.Event()
        self._fil: threading.Thread | None = None
        self.dernier: dict | None = None

    def demarrer(self) -> None:
        if self._fil and self._fil.is_alive():
            return
        self._fil = threading.Thread(target=self._boucle, daemon=True, name="veille-page")
        self._fil.start()

    def arreter(self) -> None:
        self._stop.set()

    def etat(self) -> dict:
        etat = _lire()
        return {
            "actif": bool(self._fil and self._fil.is_alive()) and not self._stop.is_set(),
            "minutes": INTERVALLE_MIN,
            "derniere": self.dernier or etat.get("derniere"),
            "signales": len(etat.get("signales", [])),
        }

    def passer_une_fois(self) -> dict:
        """Une tournée, et la remontée de ce qui est NOUVEAU. Ne lève jamais."""
        rendu = auto_page.tournee()
        etat = _lire()
        connus = set(etat.get("signales", []))

        attente = list(rendu.get("pour_andry", []))
        nouveaux = [it for it in attente if _cle(it) not in connus]
        if nouveaux and self._prevenir:
            try:
                self._prevenir(_texte_pour_andry(nouveaux, rendu.get("hors_fenetre")))
                connus.update(_cle(it) for it in nouveaux)
            except Exception:                                # noqa: BLE001
                # Telegram muet : on ne marque RIEN comme signalé, sinon la
                # demande disparaît sans que personne ne l'ait vue.
                pass

        self.dernier = {
            "quand": datetime.now(TANA).isoformat(timespec="seconds"),
            "resume": auto_page.resume(rendu),
            "pour_andry": len(attente),
            "nouveaux_signales": len(nouveaux) if self._prevenir else 0,
        }
        # On garde les 400 dernières clés : de quoi couvrir des semaines sans
        # laisser le fichier grossir sans fin.
        _ecrire({"derniere": self.dernier, "signales": sorted(connus)[-400:]})
        return rendu

    def _boucle(self) -> None:
        if self._stop.wait(PREMIER_REVEIL_S):
            return
        while not self._stop.is_set():
            try:
                self.passer_une_fois()
            except Exception:                                # noqa: BLE001
                pass                                         # une tournée ratée n'arrête pas l'horloge
            if self._stop.wait(INTERVALLE_MIN * 60):
                return
