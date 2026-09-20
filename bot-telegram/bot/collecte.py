"""Compétences « collecte » — elles PILOTENT `bot-diako` (port 8757), sans le refaire.

Le bot de collecte a déjà tout : les sources Facebook, le navigateur sous
verrou, l'extraction, la notation, la publication des fiches. Ici, on ne fait
que lui parler par son API locale et traduire ses réponses en français pour
Telegram.

⚠ UN SEUL NAVIGATEUR À LA FOIS SUR CE PC. Lancer une collecte quand une session
  Claude tourne coupe la tournée (verrou partagé `~/bots-hub`). On ne force
  jamais : si le bot répond qu'il est occupé, on le dit.
"""
from __future__ import annotations

import requests

from . import config
from .competences import Resultat, competence

BASE = config.BOT_COLLECTE
DELAI = 8


def _get(chemin: str, **params) -> tuple[dict | None, str]:
    try:
        r = requests.get(BASE + chemin, params=params or None, timeout=DELAI)
    except requests.RequestException:
        return None, "Le bot de collecte (8757) ne répond pas — il est peut-être arrêté."
    if not r.ok:
        return None, f"Le bot de collecte répond {r.status_code} sur {chemin}."
    return r.json(), ""


def _post(chemin: str, **params) -> tuple[dict | None, str]:
    try:
        r = requests.post(BASE + chemin, params=params or None, timeout=30)
    except requests.RequestException:
        return None, "Le bot de collecte (8757) ne répond pas — il est peut-être arrêté."
    if not r.ok:
        return None, f"Le bot de collecte répond {r.status_code} sur {chemin}."
    return r.json(), ""


@competence(
    nom="etat_collecte",
    titre="L'état de la collecte",
    description="Où en est le bot de collecte Diako : tournée en cours, trouvailles à trier, dernière collecte.",
    famille="collecte",
    exemples=("où en est la collecte ?", "combien de trouvailles à trier ?"),
)
def etat_collecte() -> Resultat:
    etat, erreur = _get("/api/etat")
    if etat is None:
        return Resultat(texte=erreur, ok=False)
    lignes = []
    for cle, valeur in etat.items():
        if isinstance(valeur, (str, int, float, bool)) and valeur not in ("", None):
            lignes.append(f"· {cle} : {valeur}")
    return Resultat(texte="Collecte Diako\n\n" + "\n".join(lignes[:18]), donnees=etat)


@competence(
    nom="trouvailles",
    titre="Les trouvailles à trier",
    description="Liste les publications collectées qui attendent un tri, les plus prometteuses d'abord.",
    parametres={"combien": "nombre de trouvailles à montrer (5 par défaut)",
                "recherche": "un mot à chercher dans les trouvailles (facultatif)"},
    famille="collecte",
    exemples=("montre-moi les trouvailles", "trouvailles hôtel Nosy Be"),
)
def trouvailles(combien: str = "5", recherche: str = "") -> Resultat:
    try:
        n = max(1, min(20, int(combien)))
    except (TypeError, ValueError):
        n = 5
    donnees, erreur = _get("/api/trouvailles", statut="a_trier", recherche=recherche, tri="score")
    if donnees is None:
        return Resultat(texte=erreur, ok=False)
    liste = donnees if isinstance(donnees, list) else donnees.get("trouvailles", [])
    if not liste:
        return Resultat(texte="Aucune trouvaille à trier.")
    lignes = []
    for t in liste[:n]:
        titre = (t.get("titre") or t.get("nom") or t.get("texte") or "")[:70].replace("\n", " ")
        score = t.get("score", "")
        lignes.append(f"· [{score}] {titre}")
    return Resultat(
        texte=f"{len(liste)} trouvaille(s) à trier, voici les {min(n, len(liste))} premières :\n\n"
              + "\n".join(lignes)
              + "\n\nLe tri se fait dans l'interface du bot : http://127.0.0.1:8757",
        donnees={"total": len(liste)},
    )


@competence(
    nom="lancer_collecte",
    titre="Lancer une tournée de collecte",
    description="Démarre une tournée de collecte Facebook et web du bot Diako.",
    parametres={"ia": "mettre « oui » pour faire relire les trouvailles par le modèle"},
    famille="collecte",
    exemples=("lance une collecte",),
)
def lancer_collecte(ia: str = "") -> Resultat:
    reponse, erreur = _post("/api/collecte/lancer", ia="1" if ia.lower().startswith("o") else "")
    if reponse is None:
        return Resultat(texte=erreur, ok=False)
    if reponse.get("ok") is False:
        return Resultat(texte=f"Refusé par le bot : {reponse.get('raison', 'raison inconnue')}", ok=False)
    return Resultat(
        texte="Tournée lancée. ⚠ Elle ouvre Chromium : si une session Claude tourne sur le PC, "
              "elle peut être coupée faute de mémoire.",
        donnees=reponse,
    )


@competence(
    nom="arreter_collecte",
    titre="Arrêter la collecte",
    description="Arrête la tournée de collecte en cours.",
    famille="collecte",
    exemples=("arrête la collecte",),
)
def arreter_collecte() -> Resultat:
    reponse, erreur = _post("/api/collecte/arreter")
    if reponse is None:
        return Resultat(texte=erreur, ok=False)
    return Resultat(texte="Collecte arrêtée.", donnees=reponse)


@competence(
    nom="publier_trouvailles",
    titre="Publier le lot de fiches trié",
    description="Publie sur le site les fiches du lot validé dans le bot de collecte.",
    famille="collecte",
    publique=True,
    exemples=("publie le lot",),
)
def publier_trouvailles() -> Resultat:
    reponse, erreur = _post("/api/publier-lot")
    if reponse is None:
        return Resultat(texte=erreur, ok=False)
    return Resultat(texte="Publication du lot lancée par le bot de collecte.", donnees=reponse)
