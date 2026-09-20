"""La page Di'ako répond seule — et remonte à Andry ce qu'elle ne doit pas trancher.

Ce module ajoute au bot Telegram ce que les quatre autres pages du parc ont
déjà : une tournée automatique qui lit les commentaires et les messages, répond
à ce qui ne peut pas mal tourner, et se tait sur le reste. Il passe par
`bots-garde` — registre des gestes, porte, registre de ton — la même
bibliothèque que bot-onja, bot-page, bot-hourdis et bot-imprimante.

CE QUE LA MESURE A DIT (20/09/2026, 74 commentaires réels de la page)
  74 commentaires de tiers sur les 40 dernières publications. **74 sans
  réponse** : la page n'a jamais répondu à personne. Après tri :
      24 reçoivent un gabarit   (appréciations : « Tsara ireo sary »,
                                 « Spectaculaire 😍 », « Toliara mamiko 💕 »)
       7 remontent à Andry      (5 questions + 2 plaintes sur la propreté)
      15 identifications d'ami  silence — « Hasina Vanessa Andrianjafi » seul
                                 ne nous parle pas
       3 publicités de tiers    silence — dont « On a des paréo idéal…
                                 Visitez notre page », que le registre calibré
                                 pour l'humour rangeait en COMPLIMENT et qui
                                 aurait reçu un « Misaotra betsaka ! 🙏 » public
      25 neutres                silence

TROIS GARDES PROPRES À CETTE PAGE
· `identifications=True` — sur une page de voyage, marquer le nom d'un ami est
  la réaction la plus courante et ne s'adresse pas à nous. Le drapeau est
  ÉTEINT par défaut dans la bibliothèque : allumé chez Onjaniaina il changeait
  46 verdicts sur 224, et cette page-là vit de rire en retour.
· `INTERROGATIF` — « Efa mba operationnel ve izy svp merci » et « Waw 😍 c'est
  où sa » sont des QUESTIONS que le mot « merci » faisait passer pour des
  compliments. Un bot qui remercie quelqu'un qui demande un renseignement
  passe pour sourd.
· La TRISTESSE remonte à Andry. Sur une page de voyage, « Trop maloto
  indrindra aty » (= c'est très sale ici) n'est pas du chagrin, c'est une
  critique d'un lieu — elle mérite une vraie réponse ou aucune.

UN SEUL RÉPONDEUR
`garde.porte.RESPONSABLES` déclare bot-diako responsable des quatre canaux de
cette page. Andry garde ses commandes Telegram (`repondre_commentaire`,
`repondre_message`) : les deux chemins ne se doublent pas, parce que la lecture
demande TOUJOURS les réponses imbriquées (`comments{}`) et voit donc aussi
celles qu'il a écrites à la main.
"""
from __future__ import annotations

import os
import random
import re
import sys
from pathlib import Path

from . import config

# bots-garde vit à côté des dépôts : un seul exemplaire pour les cinq bots.
_GARDE = os.environ.get("BOTS_GARDE") or str(
    Path.home() / "Desktop" / "Fonenako preprod" / "29031"
    / "Fonenako FinAL GITHUB" / "bots-garde")
if _GARDE not in sys.path:
    sys.path.insert(0, _GARDE)

# La porte SIMULE par défaut : un bot fraîchement installé ne parle pas au
# monde. Les quatre autres pages posent BOTS_SIMULATION=0 dans leur unité
# systemd ; celle-ci est lancée sous Windows par un gardien qui ne passe
# aucun environnement, donc on le pose ici. `setdefault` : une variable
# explicite gagne toujours, et « BOTS_SIMULATION=1 python demarrer.py »
# suffit à rendre le bot muet sans toucher à une ligne de code.
os.environ.setdefault("BOTS_SIMULATION", "0")

from garde import facebook, porte, registre, ton    # noqa: E402

PAR = "bot-diako"
PAGE = config.PAGE_DIAKO

# ═══════════════════════════════════════════════════════════════════════
# LES GABARITS — écrits à la main, jamais générés.
# ⚠ À FAIRE RELIRE PAR ANDRY : je ne suis pas locuteur malgache. « Misaotra »
#   est déjà employé par le bot Onjaniaina en production ; rien de neuf n'est
#   inventé ici. Le reste est de l'emoji, qui ne se trompe pas de langue.
# ═══════════════════════════════════════════════════════════════════════
GABARITS = {
    ton.COMPLIMENT: ["Misaotra betsaka ! 🙏", "Misaotra ! 😊", "Misaotra e 🙏",
                     "Misaotra 😍", "🙏❤️"],
    ton.RIRE: ["😂🤣", "😄", "🤣🤣"],
}

# Ce qui n'est JAMAIS répondu par l'automate — et attend Andry sur Telegram.
POUR_ANDRY = {ton.QUESTION, ton.COLERE, ton.TRISTESSE}

# Ce qui ne reçoit rien et ne dérange personne.
SILENCE = {ton.INTERPELLATION, ton.INDESIRABLE, ton.NEUTRE}

# Une question ne porte pas toujours un « ? ». En malgache la particule VE
# suffit, et « c'est où sa » n'en a pas non plus. Mesuré sur les 74
# commentaires : retire 7 des 31 réponses envisagées, dont les 2 questions
# que le mot « merci » avait fait passer pour des compliments.
INTERROGATIF = re.compile(
    r"\?|\bve\b|\baiza\b|\bahoana\b|\bohatrinona\b|\bfiry\b|\brahoviana\b"
    r"|\bc'?est o[uù]\b|\bo[uù] [cs]a\b|\bcombien\b|\bquel\w*\b",
    re.I)

AGE_MAX_HEURES = 72       # au-delà, une réponse arrive trop tard pour être lue
FENETRE_MESSAGE_H = 24    # Meta refuse au-delà ; ce n'est pas notre choix


def _texte(humeur, servis):
    """Un gabarit qui n'a servi ni ces trois jours, ni dans cette tournée.

    Deux mémoires, parce qu'une seule ne suffit pas : le registre ne connaît
    un geste qu'une fois CONFIRMÉ, donc entre deux envois d'une même passe il
    ne voit encore rien.
    """
    choix = GABARITS.get(humeur)
    if not choix:
        return None
    frais = [t for t in choix
             if t not in servis and registre.deja_dit(PAGE, t, 72) < 2]
    if not frais:
        frais = [t for t in choix if t not in servis] or choix
    t = random.choice(frais)
    servis.add(t)
    return t


def _avis(texte):
    """L'humeur, avec les deux gardes propres à cette page."""
    a = ton.consigne(texte, identifications=True)
    if a["repondre"] and INTERROGATIF.search(texte or ""):
        # Une question déguisée en remerciement reste une question.
        a = dict(a, humeur=ton.QUESTION, repondre=False,
                 consigne="tournure interrogative : c'est une question, pas un compliment")
    return a


# ─────────────────────────────────────────────────────── les commentaires
def commentaires(publications=25):
    """Une tournée de commentaires. Rend le compte rendu, ne lève jamais."""
    compte = {"lus": 0, "repondus": 0, "pour_andry": [], "refuses": [],
              "muets": 0}
    try:
        coms = facebook.commentaires_avec_reponses(PAGE, publications, pages_max=1)
    except Exception as e:                                   # noqa: BLE001
        return dict(compte, erreur=str(e)[:200])

    compte["lus"] = len(coms)
    plafond = porte.PLAFONDS["commentaire"]["heure"]
    servis = set()

    for c in sorted(coms, key=lambda x: x.get("quand") or "", reverse=True):
        # Le plafond arrête les ENVOIS, pas la lecture : au-delà on continue
        # de trier, pour que rien de ce qui attend un humain ne se perde.
        # Le 20/09/2026 sur Di'ako, un `break` ici faisait disparaître
        # 4 questions de clients sur 7 avec les 31 commentaires non lus.
        plein = compte["repondus"] >= plafond
        if c["auteur_id"] == str(PAGE):        # jamais à nous-mêmes
            continue
        if c["nos_reponses"]:                  # Facebook fait foi, y compris
            continue                           # pour les réponses d'Andry
        if registre.deja_fait(PAGE, "commentaire", c["id"]):
            continue
        avis = _avis(c["texte"])
        vieux = c["age_heures"] is not None and c["age_heures"] > AGE_MAX_HEURES

        # Ce qui demande un humain remonte QUEL QUE SOIT L'ÂGE. L'âge borne
        # ce que le bot DIT, pas ce qu'il MONTRE : le 20/09/2026 sur Di'ako,
        # neuf questions de clients — dont « Tarif Bungalow ? Repas ? » —
        # n'atteignaient jamais Andry parce que la page dormait depuis août.
        # Le veilleur ne signale chaque demande qu'une fois.
        if avis["humeur"] in POUR_ANDRY:
            compte["pour_andry"].append({
                "quoi": "commentaire", "id": c["id"], "auteur": c["auteur"],
                "texte": c["texte"][:200], "humeur": avis["humeur"],
                "permalien": c.get("permalien") or "",
                "age_jours": round((c["age_heures"] or 0) / 24, 1)})
            continue
        if avis["humeur"] in SILENCE or not avis["repondre"]:
            compte["muets"] += 1
            continue

        # Répondre à un commentaire de deux mois est étrange : on se tait.
        if vieux:
            compte["trop_vieux"] = compte.get("trop_vieux", 0) + 1
            continue

        if plein:
            compte.setdefault("reportes", 0)
            compte["reportes"] += 1
            continue

        reponse = _texte(avis["humeur"], servis)
        if not reponse:
            compte["muets"] += 1
            continue

        try:
            porte.franchir(
                PAGE, "commentaire", PAR, c["id"], reponse,
                envoyer=lambda cid=c["id"], t=reponse:
                    facebook.repondre_au_commentaire(PAGE, cid, t),
                autorise_par_le_ton=avis,
                detail=f"humeur {avis['humeur']} à {avis['confiance']:.0%}")
            compte["repondus"] += 1
        except porte.Refus as r:
            compte["refuses"].append({"id": c["id"], "motif": str(r)[:140]})
        except Exception as e:                               # noqa: BLE001
            compte["refuses"].append({"id": c["id"], "motif": str(e)[:140]})
    return compte


# ────────────────────────────────────────────────────────── les messages
def messages(conversations=40):
    """Une tournée de messages privés. Rend le compte rendu, ne lève jamais."""
    compte = {"lus": 0, "repondus": 0, "pour_andry": [], "refuses": [],
              "muets": 0, "hors_fenetre": []}
    try:
        fils = facebook.conversations_a_repondre(
            PAGE, limite=conversations, fenetre_heures=FENETRE_MESSAGE_H)
    except Exception as e:                                   # noqa: BLE001
        return dict(compte, erreur=str(e)[:200])

    compte["lus"] = len(fils)
    plafond = porte.PLAFONDS["message"]["heure"]
    servis = set()

    for f in sorted(fils, key=lambda x: x.get("quand") or "", reverse=True):
        # Le plafond arrête les ENVOIS, pas la lecture : au-delà on continue
        # de trier, pour que rien de ce qui attend un humain ne se perde.
        # Le 20/09/2026 sur Di'ako, un `break` ici faisait disparaître
        # 4 questions de clients sur 7 avec les 31 commentaires non lus.
        plein = compte["repondus"] >= plafond
        if not f.get("psid") or not f.get("id"):
            continue
        if registre.deja_fait(PAGE, "message", f["id"]):
            continue

        # Hors des 24 h : on ne tente pas, et on le DIT. Tenter puis avaler le
        # refus ferait passer une conversation perdue pour une conversation
        # traitée.
        if not f.get("joignable"):
            compte["hors_fenetre"].append({
                "quoi": "message", "psid": f["psid"], "auteur": f["nom"],
                "texte": f["texte"][:200],
                "age_jours": round((f.get("age_heures") or 0) / 24, 1)})
            continue

        avis = _avis(f["texte"])

        # En privé, tout ce qui n'est pas une pure marque d'affection revient
        # à Andry : un message nominatif mérite un humain.
        if avis["humeur"] in POUR_ANDRY or avis["humeur"] == ton.INDESIRABLE:
            compte["pour_andry"].append({
                "quoi": "message", "psid": f["psid"], "auteur": f["nom"],
                "texte": f["texte"][:200], "humeur": avis["humeur"]})
            continue
        if avis["humeur"] in SILENCE or not avis["repondre"]:
            compte["muets"] += 1
            continue

        if plein:
            compte.setdefault("reportes", 0)
            compte["reportes"] += 1
            continue

        reponse = _texte(avis["humeur"], servis)
        if not reponse:
            compte["muets"] += 1
            continue

        try:
            porte.franchir(
                PAGE, "message", PAR, f["id"], reponse,
                envoyer=lambda p=f["psid"], t=reponse:
                    facebook.envoyer_message(PAGE, p, t),
                autorise_par_le_ton=avis,
                detail=f"humeur {avis['humeur']} à {avis['confiance']:.0%}")
            compte["repondus"] += 1
        except porte.Refus as r:
            compte["refuses"].append({"psid": f["psid"], "motif": str(r)[:140]})
        except Exception as e:                               # noqa: BLE001
            compte["refuses"].append({"psid": f["psid"], "motif": str(e)[:140]})
    return compte


# ──────────────────────────────────────────────────── une tournée complète
def tournee(publications=40, conversations=40):
    # 40 et pas 25 : la requete la plus large dépasse ce que Facebook accepte
    # et le lecteur redescend d'un palier. Partie de 25 elle retombe à 12
    # publications (34 commentaires, 3 demandes vues) ; partie de 40 elle
    # retombe à 20 (74 commentaires, 9 demandes vues). Mesuré le 20/09/2026.
    """Commentaires puis messages. L'échec de l'un n'emporte pas l'autre."""
    rendu = {}
    for nom, fonction, arg in (("commentaires", commentaires, publications),
                               ("messages", messages, conversations)):
        try:
            rendu[nom] = fonction(arg)
        except Exception as e:                               # noqa: BLE001
            rendu[nom] = {"erreur": str(e)[:200]}
    rendu["pour_andry"] = (rendu["commentaires"].get("pour_andry", [])
                           + rendu["messages"].get("pour_andry", []))
    rendu["hors_fenetre"] = rendu["messages"].get("hors_fenetre", [])
    return rendu


def resume(rendu):
    """Une ligne lisible pour le journal et pour Telegram."""
    c, m = rendu.get("commentaires", {}), rendu.get("messages", {})
    return (f"commentaires {c.get('repondus', 0)}/{c.get('lus', 0)} · "
            f"messages {m.get('repondus', 0)}/{m.get('lus', 0)} · "
            f"pour Andry {len(rendu.get('pour_andry', []))} · "
            f"hors 24 h {len(rendu.get('hors_fenetre', []))}")
