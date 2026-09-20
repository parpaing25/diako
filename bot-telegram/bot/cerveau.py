"""Le cerveau : comprendre ce qu'Andry demande, appeler la bonne compétence.

Trois chemins, dans cet ordre :

  ① **Une commande** (`/etat`, `/file`, `/aide`…) — déterministe, instantanée,
     elle ne coûte rien et ne peut pas se tromper. Tout ce qu'Andry fait dix
     fois par jour doit en avoir une.
  ② **Un clic** sur un bouton — confirmation ou refus d'une action en attente.
  ③ **Une phrase libre** — le modèle choisit une compétence et ses arguments,
     dans la liste du registre. Il ne peut appeler QUE ce qui y est déclaré :
     c'est ce qui l'empêche d'inventer une action.

⚠ SANS MODÈLE, LE BOT RESTE UTILE. Si aucune clé n'est posée, ou si l'appel
  échoue, on retombe sur un routage par mots-clés. Le pire cas est « je n'ai pas
  compris, voici les commandes », jamais un bot muet.

⚠ LE MODÈLE NE PARLE PAS À LA PLACE DES COMPÉTENCES. Il choisit l'outil ; le
  texte rendu à Andry est celui de la compétence, avec ses chiffres. Le modèle
  ne reformule que quand aucune compétence ne correspond.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

from . import competences, config, validation
from .competences import Resultat

SESSIONS = config.DOSSIER_DONNEES / "sessions.json"
TOURS_GARDES = 8            # on garde le fil court : le contexte coûte et dérive
API_ANTHROPIC = "https://api.anthropic.com/v1/messages"
API_GROQ = "https://api.groq.com/openai/v1/chat/completions"

CONSIGNE = """Tu es l'assistant de gestion de Di'ako : la page Facebook Di'ako et le site
diako.fonenako.mg (réseau social malgache du voyage). Tu parles à Andry, le patron, en
français, brièvement, sans flatterie.

Tu disposes d'outils. Règles absolues :
- Tu n'inventes AUCUN chiffre, aucun nom d'établissement, aucune date : tout vient d'un outil.
- Pour agir (publier, programmer, répondre, déployer), tu appelles l'outil ; Andry confirmera
  lui-même par un bouton, tu n'as pas à le lui demander.
- Si la demande est ambiguë ou s'il manque un paramètre, tu poses UNE question courte.
- Si aucun outil ne convient, tu réponds en une ou deux phrases, et tu dis ce qui manque.
"""


@dataclass
class Reponse:
    """Ce que le bot renvoie à Telegram pour un message reçu."""

    texte: str
    boutons: list[list[dict[str, str]]] = field(default_factory=list)
    images: list[Path] = field(default_factory=list)


# ── Mémoire de conversation, volontairement courte ────────────────────────
def _fil(chat_id: str) -> list[dict]:
    if not SESSIONS.exists():
        return []
    try:
        return json.loads(SESSIONS.read_text(encoding="utf-8")).get(chat_id, [])
    except json.JSONDecodeError:
        return []


def _noter_fil(chat_id: str, tours: list[dict]) -> None:
    config.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    tout = {}
    if SESSIONS.exists():
        try:
            tout = json.loads(SESSIONS.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            tout = {}
    tout[chat_id] = tours[-TOURS_GARDES:]
    SESSIONS.write_text(json.dumps(tout, ensure_ascii=False), encoding="utf-8")


def oublier(chat_id: str) -> None:
    _noter_fil(chat_id, [])


# ── Les commandes ─────────────────────────────────────────────────────────
def _aide() -> str:
    lignes = ["Ce que je sais faire :", ""]
    titres = {"page": "📣 La page Di'ako", "site": "🌐 Le site et la base",
              "marketing": "🎨 Publications et marketing", "collecte": "🔎 La collecte",
              "divers": "🧰 Divers"}
    for famille, liste in sorted(competences.par_famille().items()):
        lignes.append(titres.get(famille, famille))
        for comp in liste:
            marque = " ✋" if comp.publique else ""
            lignes.append(f"  · {comp.titre}{marque}")
        lignes.append("")
    lignes += [
        "✋ = je prépare, tu confirmes d'un bouton.",
        "",
        "Commandes : /etat /file /aide /oublier",
        "Sinon, écris simplement ce que tu veux.",
    ]
    return "\n".join(lignes)


def _file_attente() -> Reponse:
    attente = validation.en_attente()
    if not attente:
        return Reponse(texte="Rien en attente de ta confirmation.")
    lignes = ["En attente de ton clic :", ""]
    boutons: list[list[dict[str, str]]] = []
    for action in attente[:5]:
        lignes.append(f"· {action['resume']}")
        boutons.append([
            {"texte": "✅ " + action["resume"][:24], "action": f"ok:{action['cle']}"},
            {"texte": "✖", "action": f"non:{action['cle']}"},
        ])
    return Reponse(texte="\n".join(lignes), boutons=boutons)


COMMANDES = {
    "/start": lambda: Reponse(texte="Bot Di'ako prêt.\n\n" + _aide()),
    "/aide": lambda: Reponse(texte=_aide()),
    "/help": lambda: Reponse(texte=_aide()),
    "/file": _file_attente,
    "/oublier": lambda: Reponse(texte="Fil oublié, on repart de zéro."),
}


# ── Le modèle ─────────────────────────────────────────────────────────────
def _outils() -> list[dict]:
    return [comp.schema() for comp in competences.REGISTRE.values()]


def _appeler_claude(fil: list[dict], outil_impose: str | None = None) -> dict | None:
    cle = config.cle_anthropic()
    if not cle:
        return None
    reglages = config.charger()
    corps = {
        "model": reglages.get("modele_anthropic", "claude-sonnet-5"),
        "max_tokens": 1200,
        "system": CONSIGNE,
        "tools": _outils(),
        "messages": fil,
    }
    if outil_impose:
        corps["tool_choice"] = {"type": "tool", "name": outil_impose}
    r = requests.post(
        API_ANTHROPIC,
        headers={"x-api-key": cle, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json=corps,
        timeout=90,
    )
    if not r.ok:
        print(f"[cerveau] Claude {r.status_code} : {r.text[:300]}")
        return None
    return r.json()


def _appeler_groq(fil: list[dict], outil_impose: str | None = None) -> dict | None:
    """Repli gratuit. Format OpenAI : les outils y ont une autre forme."""
    cle = config._lire(config.CLE_GROQ)
    if not cle:
        return None
    outils = [
        {"type": "function",
         "function": {"name": o["name"], "description": o["description"],
                      "parameters": o["input_schema"]}}
        for o in _outils()
    ]
    messages = [{"role": "system", "content": CONSIGNE}]
    for tour in fil:
        contenu = tour["content"]
        if isinstance(contenu, list):  # on aplatit les blocs Claude
            contenu = " ".join(b.get("text", "") for b in contenu if isinstance(b, dict))
        messages.append({"role": tour["role"], "content": contenu})
    r = requests.post(
        API_GROQ,
        headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json"},
        json={"model": config.charger().get("modele_groq", "openai/gpt-oss-120b"),
              "messages": messages, "tools": outils,
              "tool_choice": ({"type": "function", "function": {"name": outil_impose}}
                              if outil_impose else "auto"),
              # ⚠ gpt-oss RAISONNE avant d'écrire, et ce raisonnement compte dans
              #   max_tokens : à l'étroit, il rend une réponse vide ou invalide.
              #   Effort bas + marge (leçon du bot Fonenako, 03/09/2026).
              "reasoning_effort": "low",
              "max_tokens": 1500},
        timeout=60,
    )
    if not r.ok:
        print(f"[cerveau] Groq {r.status_code} : {r.text[:300]}")
        return None
    choix = r.json()["choices"][0]["message"]
    blocs: list[dict] = []
    if choix.get("content"):
        blocs.append({"type": "text", "text": choix["content"]})
    for appel in choix.get("tool_calls") or []:
        try:
            arguments = json.loads(appel["function"].get("arguments") or "{}")
        except json.JSONDecodeError:
            arguments = {}
        blocs.append({"type": "tool_use", "name": appel["function"]["name"],
                      "input": arguments, "id": appel.get("id", "")})
    return {"content": blocs}


# ── Les intentions explicites : le verbe décide, pas le modèle ───────────
# 🔴 LE MODÈLE SE TROMPE D'OUTIL SUR LES ORDRES. Mesuré le 20/09/2026 avec
#    llama-3.3-70b (le repli, faute de clé Claude sur ce PC) : « programme une
#    publication demain 18 h qui dit … » a déclenché la LECTURE de la file au
#    lieu de la programmation. Sur un ordre d'action, on ne laisse plus le
#    modèle choisir : on lui IMPOSE l'outil et il ne remplit que les arguments.
#    Le reste de la conversation continue de passer par son choix libre.
INTENTIONS: list[tuple[str, str]] = [
    (r"\b(programme|programmer|planifie|planifier)\b", "programmer_page"),
    (r"\b(publie|publier|poste|poster)\b(?!.{0,20}\b(fiche|lot)\b)", "publier_page"),
    (r"\b(r[ée]ponds?|r[ée]pondre)\b.{0,40}\bcommentaire", "repondre_commentaire"),
    (r"\b(r[ée]ponds?|r[ée]pondre)\b.{0,40}\b(message|messenger|conversation)", "repondre_message"),
    (r"\b(annule|annuler|supprime|supprimer)\b.{0,30}\b(programm|publication)", "annuler_programmee"),
    (r"\b(d[ée]ploie|d[ée]ployer|mets? en ligne|mise en ligne)\b", "deployer_site"),
    (r"\b(r[ée]dige|r[ée]diger|[ée]cris|[ée]crire)\b.{0,30}\b(publication|post|texte|l[ée]gende)", "rediger_publication"),
    (r"\b(affiche|visuel|image)\b.{0,20}\b(fabrique|fais|cr[ée]e|g[ée]n[èe]re)|\b(fabrique|fais|cr[ée]e)\b.{0,20}\b(affiche|visuel)", "fabriquer_affiche"),
    (r"\b(pr[ée]pare|pr[ée]parer)\b.{0,30}\b(publication|post)", "preparer_publication"),
]


def _intention(texte: str) -> str | None:
    """L'outil imposé par un verbe d'action, s'il y en a un de déclaré."""
    bas = texte.lower()
    for motif, nom in INTENTIONS:
        if nom in competences.REGISTRE and re.search(motif, bas):
            return nom
    return None

# 🔴 UN REPLI DOIT DIRE QU'IL EST UN REPLI. Le 20/09/2026, la clé Groq a rendu
#    404 (modèle retiré sans préavis) : le bot a répondu la FILE des publications
#    à un ordre de programmation, sans un mot sur la panne. Une réponse plausible
#    au mauvais endroit est pire qu'une erreur — on ne la cherche pas.
AVERTISSEMENT_REPLI = "⚠ Modèle indisponible, je marche aux mots-clés.\n\n"

# ── Le repli sans modèle : des mots-clés, et rien d'inventé ───────────────
MOTS = [
    (r"\b(etat|état|ça va|resume|résumé)\b.*\b(site|web)\b", "etat_site"),
    (r"\b(etat|état)\b.*\b(page|facebook)\b", "etat_page"),
    (r"\b(programm|file|calendrier)\w*\b", "file_programmee"),
    (r"\b(commentaire)s?\b", "commentaires_recents"),
    (r"\b(message|messenger)s?\b", "messages_recents"),
    (r"\b(chiffre|compteur|combien)\w*\b", "chiffres_site"),
    (r"\b(collecte|trouvaille)s?\b", "etat_collecte"),
    (r"\b(deploie|déploie|deploy)\w*\b", "deployer_site"),
]


def _sans_modele(texte: str) -> Reponse:
    """Aucun modèle : on suit l'ordre donné, sinon les mots-clés.

    🔴 SANS CE PREMIER TEST, UN ORDRE DEVENAIT UNE LECTURE. « programme une
       publication… » tombait sur le mot-clé « programm » et le bot répondait la
       FILE des publications programmées — une réponse plausible à côté de la
       demande. Mesuré le 20/09/2026, quand la clé Groq a rendu 404 et que le
       repli s'est mis à répondre seul.
    """
    ordre = _intention(texte)
    if ordre:
        # La compétence dira elle-même ce qui lui manque (« Il me manque : quand »).
        reponse = _lancer(ordre, {})
        reponse.texte = AVERTISSEMENT_REPLI + reponse.texte
        return reponse
    bas = texte.lower()
    for motif, nom in MOTS:
        if re.search(motif, bas) and nom in competences.REGISTRE:
            reponse = _lancer(nom, {})
            reponse.texte = AVERTISSEMENT_REPLI + reponse.texte
            return reponse
    return Reponse(
        texte=("Je n'ai pas de modèle disponible en ce moment, donc je ne comprends que "
               "des demandes simples.\n\n" + _aide())
    )


# ── Exécution d'une compétence, avec validation si elle sort en public ────
def _lancer(nom: str, arguments: dict[str, Any]) -> Reponse:
    comp = competences.REGISTRE.get(nom)
    if comp is None:
        return Reponse(texte=f"Je ne connais pas l'action « {nom} ».")

    if competences.demande_validation(nom):
        resume = _resumer(comp, arguments)
        cle = validation.deposer(nom, arguments, resume)
        return Reponse(
            texte=f"À confirmer : {resume}\n\nRien ne part tant que tu n'as pas cliqué.",
            boutons=[[{"texte": "✅ Confirmer", "action": f"ok:{cle}"},
                      {"texte": "✖ Annuler", "action": f"non:{cle}"}]],
        )

    resultat = competences.executer(nom, arguments)
    return _en_reponse(resultat)


def _resumer(comp: competences.Competence, arguments: dict[str, Any]) -> str:
    """Un résumé lisible de ce qui va partir — c'est ce qu'Andry relit."""
    morceaux = []
    for cle, valeur in (arguments or {}).items():
        if cle not in comp.parametres or valeur in (None, ""):
            continue
        texte = str(valeur)
        morceaux.append(f"{cle} : {texte[:120]}" + ("…" if len(texte) > 120 else ""))
    return comp.titre + (" — " + " · ".join(morceaux) if morceaux else "")


def _en_reponse(resultat: Resultat) -> Reponse:
    boutons = []
    if resultat.suites:
        boutons = [[{"texte": s["texte"], "action": s["action"]} for s in resultat.suites[:3]]]
    return Reponse(texte=resultat.texte, boutons=boutons, images=list(resultat.images))


# ── Point d'entrée ────────────────────────────────────────────────────────
def traiter(chat_id: str, texte: str, rappel: str | None = None) -> Reponse:
    """Traite un message (ou un clic) et rend ce qu'il faut envoyer."""
    if rappel:
        return _traiter_clic(rappel)

    texte = (texte or "").strip()
    if not texte:
        return Reponse(texte="Dis-moi ce que tu veux, ou tape /aide.")

    commande = texte.split()[0].lower()
    if commande in COMMANDES:
        if commande == "/oublier":
            oublier(chat_id)
        return COMMANDES[commande]()

    fil = _fil(chat_id) + [{"role": "user", "content": texte}]
    impose = _intention(texte)
    # ⚠ UN SEUL ÉCHEC NE VAUT PAS UNE PANNE. Groq refuse par vagues (429, 5xx,
    #   réponse vide) : mesuré le 20/09/2026, la même demande passait à la
    #   seconde tentative. On réessaie UNE fois avant de tomber au repli, qui
    #   comprend nettement moins bien.
    reponse_modele = _appeler_claude(fil, impose) or _appeler_groq(fil, impose)
    if reponse_modele is None:
        time.sleep(1.5)
        reponse_modele = _appeler_groq(fil, impose)
    if reponse_modele is None:
        return _sans_modele(texte)

    blocs = reponse_modele.get("content", [])
    appels = [b for b in blocs if b.get("type") == "tool_use"]
    dits = " ".join(b.get("text", "") for b in blocs if b.get("type") == "text").strip()

    if appels:
        appel = appels[0]  # une action à la fois : Andry doit pouvoir suivre
        _noter_fil(chat_id, fil + [{"role": "assistant", "content": dits or f"[{appel['name']}]"}])
        reponse = _lancer(appel["name"], appel.get("input") or {})
        if dits and not reponse.texte.startswith(dits[:20]):
            reponse.texte = (dits + "\n\n" + reponse.texte).strip()
        return reponse

    _noter_fil(chat_id, fil + [{"role": "assistant", "content": dits}])
    return Reponse(texte=dits or "Je n'ai pas compris. /aide pour la liste.")


def _traiter_clic(rappel: str) -> Reponse:
    if rappel.startswith("ok:"):
        resultat = validation.confirmer(rappel[3:])
        return _en_reponse(resultat)
    if rappel.startswith("non:"):
        return _en_reponse(validation.annuler(rappel[4:]))
    if rappel.startswith("faire:"):      # bouton proposé par une compétence
        nom, _, brut = rappel[6:].partition("|")
        try:
            arguments = json.loads(brut) if brut else {}
        except json.JSONDecodeError:
            arguments = {}
        return _lancer(nom, arguments)
    return Reponse(texte="Bouton inconnu (il date peut-être d'une version précédente).")
