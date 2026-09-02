# -*- coding: utf-8 -*-
"""LE VERROU DU NAVIGATEUR — un seul bot ouvre Chromium à la fois.

🔴 POURQUOI CE FICHIER EXISTE. Le 24/08/2026, trois bots ont lancé leur
collecte en même temps (11:00 pour Fonenako et Diako, 10:00 pour AKORA, plus
une moisson déclenchée à la main). Chacun avait pourtant SON garde-fou mémoire
— « je n'ouvre pas Chromium sous 900 Mo » — et chacun l'a passé de bon droit :
au moment de décider, il restait 1,2 Go. Le problème est qu'ils ont décidé
**en même temps, chacun dans son coin**. Trois Chromium plus tard, la machine
était à 187 Mo de RAM libre : exactement le niveau auquel les trois bots sont
morts la veille.

Un garde-fou par bot ne suffit pas quand la ressource est partagée. Il faut un
tour de rôle, et il doit vivre HORS des trois dépôts — d'où ce dossier.

CE QUE CE N'EST PAS : une file d'attente. Un bot qui ne peut pas prendre le
verrou **renonce** à sa partie navigateur et le dit dans son journal ; il
repassera à son prochain créneau. Faire patienter un bot immobiliserait son
serveur web, et l'utilisateur croirait à une panne.

Usage, côté bot :

    from verrou_navigateur import verrou_navigateur

    with verrou_navigateur("diako") as pris:
        if not pris:
            journal("Un autre bot occupe le navigateur, partie Facebook sautée.")
        else:
            ...ouvrir Chromium...
            verrou_navigateur.toucher("diako")   # de temps en temps, tant que ça dure

Le verrou est un simple fichier JSON. Un bot tué net ne le rend pas : on le
considère donc **périmé** au-delà de `PEREMPTION_S`, sinon une mort brutale
bloquerait tous les autres jusqu'au prochain redémarrage.

🔴 LE 02/09/2026, LE VERROU A BLOQUÉ TOUT LE MONDE DEHORS. La machine a
redémarré brutalement à 11 h 11 pendant qu'un bot écrivait le fichier : NTFS a
gardé sa taille (68 octets) et perdu son contenu (68 octets nuls). `_lire()`
rendait alors `None`, `prendre()` concluait « personne ne le tient » mais ne
retirait pas le fichier, et `open(…, "x")` échouait pour tous, définitivement.
Un fichier présent mais illisible est un porteur mort : on le retire.

⚠ CE MODULE EST COPIÉ À L'IDENTIQUE dans `~/bots-hub/` et dans les trois bots
  (Fonenako 8756, Diako 8757, AKORA 8758). Toute correction se reporte sur
  les quatre copies.
"""
from __future__ import annotations

import contextlib
import json
import os
import time

# ⚠ CHEMIN ABSOLU, PAS `__file__`. Ce module est COPIÉ dans chaque bot (ils
# vivent dans trois dépôts distincts, aucun ne peut importer chez le voisin).
# Si le verrou se posait à côté de la copie, chaque bot verrouillerait son
# propre fichier et personne ne verrait personne — un verrou qui ne verrouille
# rien est pire que pas de verrou, parce qu'on croit être protégé.
FICHIER = os.path.join(os.path.expanduser("~"), "bots-hub",
                       "verrou-navigateur.json")

# ⚠ UNE TOURNÉE FACEBOOK COMPLÈTE DURE PRÈS DE TROIS HEURES, pas « une petite
#   heure » : mesuré le 01/09/2026 sur Diako, 15 h 04 → 17 h 49 pour 158
#   sources. Avec une péremption d'une heure, le verrou se désarmait au
#   moment où la collecte était la plus lourde. Le porteur `touche` le fichier
#   à chaque source ; la péremption n'est qu'un filet pour un bot tué net.
PEREMPTION_S = 4 * 3600


def _lire() -> dict | None:
    try:
        with open(FICHIER, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _vivant(porteur: dict | None) -> bool:
    """Le verrou est-il tenu par quelqu'un qui existe encore ?"""
    if not porteur:
        return False
    if time.time() - float(porteur.get("depuis", 0)) > PEREMPTION_S:
        return False
    pid = int(porteur.get("pid", 0))
    if not pid:
        return False
    # Sous Windows, `os.kill(pid, 0)` lève si le processus n'existe plus.
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        # Le processus existe mais appartient à un autre utilisateur. Il
        # existe : le verrou tient.
        return True
    except OSError:
        return False


def prendre(bot: str) -> bool:
    """Tente de prendre le verrou. True s'il est à nous."""
    porteur = _lire()
    if _vivant(porteur) and porteur.get("bot") != bot:
        return False
    try:
        # `x` échoue si le fichier existe : c'est notre garde anti-collision
        # entre deux bots qui décident à la même seconde. Si le porteur était
        # mort — ou si le fichier est ILLISIBLE, ce qui revient au même — on
        # le retire juste avant. ⚠ `os.path.exists`, pas `porteur is not
        # None` : c'est cette différence qui a fermé le verrou à tout le monde
        # le 02/09/2026.
        if os.path.exists(FICHIER):
            with contextlib.suppress(OSError):
                os.remove(FICHIER)
        with open(FICHIER, "x", encoding="utf-8") as f:
            json.dump({"bot": bot, "pid": os.getpid(), "depuis": time.time()}, f)
        return True
    except FileExistsError:
        return False
    except OSError:
        # Disque plein, dossier absent… On ne bloque pas la collecte pour ça :
        # sans verrou, on retombe simplement sur le comportement d'avant.
        return True


def toucher(bot: str) -> None:
    """Rafraîchit l'horodatage : « je suis toujours là ». Silencieux si le verrou n'est pas à nous."""
    porteur = _lire()
    if not porteur or porteur.get("bot") != bot or int(porteur.get("pid", 0)) != os.getpid():
        return
    with contextlib.suppress(OSError):
        with open(FICHIER, "w", encoding="utf-8") as f:
            json.dump({"bot": bot, "pid": os.getpid(), "depuis": time.time()}, f)


def rendre(bot: str) -> None:
    porteur = _lire()
    # Un fichier illisible n'est à personne : on le retire aussi, sinon il
    # bloquerait le prochain `prendre()` de tout le monde.
    if porteur is None or porteur.get("bot") == bot:
        with contextlib.suppress(OSError):
            os.remove(FICHIER)


def qui() -> str | None:
    """Le nom du bot qui tient le navigateur, pour l'afficher."""
    porteur = _lire()
    return porteur.get("bot") if _vivant(porteur) else None


@contextlib.contextmanager
def verrou_navigateur(bot: str):
    pris = prendre(bot)
    try:
        yield pris
    finally:
        if pris:
            rendre(bot)
