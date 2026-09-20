"""Configuration du bot Telegram Di'ako.

Ce bot est le POSTE DE COMMANDE de Diako par Telegram : la page Facebook
Di'ako, le site diako.fonenako.mg, la base, la collecte, et la fabrication des
publications. Il ne refait pas ce qui existe — il l'appelle :

  · `marketing/atelier/` (même dépôt) fabrique et programme les publications ;
  · `bot-diako` (port 8757) collecte sur Facebook et le web ;
  · `~/.deploy-sites/redeploy.sh diako` construit et déploie le site ;
  · Supabase `eifrwecaszzqrdwjjjbu` porte le contenu du site.

⚠ LE DÉPÔT parpaing25/diako EST PUBLIC. Aucune clé, aucun jeton, aucun
  identifiant personnel ne doit entrer dans cet arbre — ils vivent tous dans
  `~/.diako-secrets/` et sont lus à l'exécution.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER_DONNEES = RACINE / "data"
DOSSIER_JOURNAUX = RACINE / "logs"
FICHIER_CONFIG = DOSSIER_DONNEES / "config.json"
BASE = DOSSIER_DONNEES / "bot.db"

SECRETS = Path.home() / ".diako-secrets"
SECRETS_FONENAKO = Path.home() / ".fonenako-secrets"

# ── Le port ───────────────────────────────────────────────────────────────
# Les adresses du PC sont attribuées une fois pour toutes : 8756 bot-annonces,
# 8757 bot-diako, 8758 AKORA, 8759 bot-page, 8760 poste de pilotage, 8761
# veille Hourdis, 8762 Tsena. Celui-ci prend la suivante.
PORT = 8763

# ── Ce que le bot pilote ─────────────────────────────────────────────────
# 🔴 DEUX PAGES SE RESSEMBLENT. « Di'ako » (DiakoMDG, 14 000 abonnés) est
#    108742855158464 ; « DiakoMada » est 104126917813219 et n'est PAS la nôtre.
#    La même mise en garde est écrite dans marketing/atelier/programmer.py.
PAGE_DIAKO = "108742855158464"
GRAPH = "https://graph.facebook.com/v21.0"
SITE = "https://diako.fonenako.mg"
PROJET_SUPABASE = "eifrwecaszzqrdwjjjbu"

DEPOT = RACINE.parent                      # ~/Desktop/Diako
ATELIER = DEPOT / "marketing" / "atelier"
BOT_COLLECTE = "http://127.0.0.1:8757"     # bot-diako
REDEPLOY = Path.home() / ".deploy-sites" / "redeploy.sh"

# ── Les secrets, lus à l'exécution ───────────────────────────────────────
JETON_TELEGRAM = SECRETS / "telegram_bot_diako.txt"   # à créer par Andry (BotFather)
JETON_PAGE = SECRETS / "fb_page_token_diako.txt"
ENV_DIAKO = SECRETS / "env_diako.txt"                 # clé d'envoi des images o2switch
JETON_SUPABASE = SECRETS / "supabase_token.txt"
JETON_SUPABASE_REPLI = SECRETS_FONENAKO / "supabase_token.txt"
CLE_ANTHROPIC = SECRETS / "anthropic_key.txt"
CLE_ANTHROPIC_REPLI = SECRETS_FONENAKO / "anthropic_key.txt"
CLE_GROQ = SECRETS_FONENAKO / "groq_api_key.txt"
CLE_GEMINI = SECRETS_FONENAKO / "gemini_api_key.txt"
# L'identifiant Telegram d'Andry sert de serrure : le bot ne répond qu'à lui.
# Il est déjà posé pour le pont ; on le relit là où il est, sans le recopier.
ID_ANDRY_FICHIERS = (SECRETS / "telegram_andry_id.txt", Path.home() / "hermes" / "bridge.env")

REGLAGES_PAR_DEFAUT: dict = {
    # 🔴 LA GARDE EST FERMÉE PAR DÉFAUT. Toute compétence déclarée `publique`
    #    (elle publie, répond, déploie, écrit en base) exige un clic d'Andry.
    #    Cette liste est la LEVÉE de garde, nommée une par une : une compétence
    #    oubliée reste protégée. L'inverse — une liste d'autorisations — laissait
    #    passer sans confirmation toute compétence ajoutée ensuite (défaut trouvé
    #    par les tests du socle le 20/09/2026).
    "validation_levee": [],
    # Le cerveau : « passerelle » (LiteLLM d'Hermes, gratuit, parfois absent),
    # « anthropic » (payant, stable), « regles » (aucun modèle).
    "cerveau": "anthropic",
    "modele_anthropic": "claude-sonnet-5",
    # ⚠ LE MODÈLE GROQ SE PÉRIME. `llama-3.3-70b-versatile` a rendu 404 « does not
    #   exist or you do not have access » le 20/09/2026 : Groq retire ses modèles
    #   sans prévenir. La liste vraie se lit sur https://api.groq.com/openai/v1/models
    #   — ne jamais en choisir un de mémoire.
    "modele_groq": "openai/gpt-oss-120b",
    "rythme_telegram_s": 1.0,      # une réponse par seconde au plus
    "journal_max_lignes": 5000,
    "rapport_quotidien": "07:30",  # vide = pas de rapport
}


def _lire(chemin: Path) -> str:
    """Le contenu d'un fichier de secret, sans BOM ni saut de ligne.

    ⚠ LE BOM EST UN VRAI PIÈGE : `supabase_token.txt` en porte un, et la CLI
      refuse alors un jeton parfaitement valide.
    """
    if not chemin.exists():
        return ""
    return chemin.read_text(encoding="utf-8-sig").strip()


def jeton_telegram() -> str:
    return _lire(JETON_TELEGRAM)


def jeton_page() -> str:
    return _lire(JETON_PAGE)


def cle_env_diako(nom: str = "O2SWITCH_UPLOAD_API_KEY") -> str:
    """Une valeur du fichier d'environnement du serveur (clé d'envoi d'images)."""
    for ligne in _lire(ENV_DIAKO).splitlines():
        if ligne.startswith(nom + "="):
            return ligne.split("=", 1)[1].strip().strip('"')
    return ""


def id_andry() -> str:
    """L'identifiant Telegram autorisé. Sans lui, le bot ne parle à personne."""
    for chemin in ID_ANDRY_FICHIERS:
        texte = _lire(chemin)
        if not texte:
            continue
        if chemin.suffix == ".env" or chemin.name.endswith(".env"):
            for ligne in texte.splitlines():
                if ligne.startswith("ANDRY_TELEGRAM_ID="):
                    return ligne.split("=", 1)[1].strip().strip('"')
        else:
            return texte.split()[0]
    return os.environ.get("ANDRY_TELEGRAM_ID", "")


def jeton_supabase() -> str:
    return _lire(JETON_SUPABASE) or _lire(JETON_SUPABASE_REPLI)


def cle_anthropic() -> str:
    return _lire(CLE_ANTHROPIC) or _lire(CLE_ANTHROPIC_REPLI)


def charger() -> dict:
    """Les réglages, complétés par les valeurs par défaut (nouvelles clés incluses)."""
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    reglages = dict(REGLAGES_PAR_DEFAUT)
    if FICHIER_CONFIG.exists():
        try:
            reglages.update(json.loads(FICHIER_CONFIG.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            pass  # un fichier abîmé ne doit pas empêcher le bot de démarrer
    return reglages


def enregistrer(reglages: dict) -> None:
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    FICHIER_CONFIG.write_text(
        json.dumps(reglages, ensure_ascii=False, indent=2), encoding="utf-8"
    )
