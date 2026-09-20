"""Compétences générales : l'état de la machine, les notes, la file d'attente.

Ce sont celles qui répondent à « où on en est ? » sans rien ouvrir : elles
interrogent les API locales des autres bots, qui tournent déjà sur ce PC.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import requests

from . import config, validation
from .competences import Resultat, competence

NOTES = config.DOSSIER_DONNEES / "notes.json"

# Les adresses du PC, fixées une fois pour toutes (voir hermes/CLAUDE.md).
BOTS = {
    "bot-annonces (Fonenako)": 8756,
    "bot-diako (collecte)": 8757,
    "bot-fournisseurs (AKORA)": 8758,
    "bot-page (Fonenako)": 8759,
    "poste de pilotage": 8760,
    "veille Hourdis": 8761,
    "Tsena imprimante": 8762,
    "bot Di'ako (moi)": config.PORT,
}


@competence(
    nom="etat_bots",
    titre="L'état des bots du PC",
    description="Dit quels bots tournent sur cette machine et lesquels sont muets.",
    famille="divers",
    exemples=("les bots tournent ?", "qui est mort ?"),
)
def etat_bots() -> Resultat:
    lignes, debout = [], 0
    for nom, port in BOTS.items():
        try:
            r = requests.get(f"http://127.0.0.1:{port}/api/etat", timeout=3)
            if r.ok:
                debout += 1
                lignes.append(f"✅ {nom} — {port}")
            else:
                lignes.append(f"⚠️ {nom} — {port} répond {r.status_code}")
        except requests.RequestException:
            lignes.append(f"❌ {nom} — {port} muet")
    entete = f"{debout} bot(s) debout sur {len(BOTS)}."
    return Resultat(texte=entete + "\n\n" + "\n".join(lignes),
                    donnees={"debout": debout, "total": len(BOTS)})


@competence(
    nom="file_validation",
    titre="Ce qui attend ma confirmation",
    description="Liste les actions préparées qui attendent le clic d'Andry.",
    famille="divers",
    exemples=("qu'est-ce qui attend ?",),
)
def file_validation() -> Resultat:
    attente = validation.en_attente()
    if not attente:
        return Resultat(texte="Rien en attente.")
    lignes = [f"· {a['resume']} (déposée {a['cree_a'][11:16]})" for a in attente]
    return Resultat(
        texte=f"{len(attente)} action(s) en attente :\n\n" + "\n".join(lignes),
        donnees={"attente": len(attente)},
        suites=[{"texte": "Voir et confirmer", "action": "faire:file_validation|"}],
    )


def _notes() -> list[dict]:
    if not NOTES.exists():
        return []
    try:
        return json.loads(NOTES.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


@competence(
    nom="noter",
    titre="Noter une idée",
    description="Garde une note (idée de publication, chose à faire, remarque).",
    parametres={"texte": "la note à garder, telle qu'Andry l'a dite"},
    obligatoires=("texte",),
    famille="divers",
    exemples=("note : penser aux baleines de Sainte-Marie en juillet",),
)
def noter(texte: str) -> Resultat:
    notes = _notes()
    notes.append({"quand": datetime.now().isoformat(timespec="minutes"), "texte": texte})
    config.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    NOTES.write_text(json.dumps(notes, ensure_ascii=False, indent=1), encoding="utf-8")
    return Resultat(texte=f"Noté ({len(notes)} notes).")


@competence(
    nom="notes",
    titre="Relire les notes",
    description="Rend les dernières notes gardées.",
    parametres={"combien": "nombre de notes à rendre (10 par défaut)"},
    famille="divers",
)
def lire_notes(combien: str = "10") -> Resultat:
    try:
        n = max(1, min(50, int(combien)))
    except (TypeError, ValueError):
        n = 10
    notes = _notes()[-n:]
    if not notes:
        return Resultat(texte="Aucune note.")
    lignes = [f"· {x['quand'][5:16].replace('T', ' ')} — {x['texte']}" for x in reversed(notes)]
    return Resultat(texte="\n".join(lignes), donnees={"total": len(_notes())})
