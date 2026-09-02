"""Configuration du bot de collecte Diako.

Tout ce qui est réglable vit dans data/config.json (créé au premier lancement à
partir des valeurs ci-dessous). Les secrets, eux, ne sont JAMAIS ici : ils sont
lus à l'exécution dans ~/.diako-secrets/, comme le reste du projet.

⚠ LE DÉPÔT parpaing25/diako EST PUBLIC. Aucune clé, aucun jeton, aucun mot de
  passe ne doit entrer dans cet arbre — pas même en exemple commenté.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER_DONNEES = RACINE / "data"
DOSSIER_TROUVAILLES = DOSSIER_DONNEES / "trouvailles"
PROFIL_NAVIGATEUR = DOSSIER_DONNEES / "profil-fb"
BASE = DOSSIER_DONNEES / "bot.db"
FICHIER_CONFIG = DOSSIER_DONNEES / "config.json"

SECRETS = Path.home() / ".diako-secrets"
SECRETS_FONENAKO = Path.home() / ".fonenako-secrets"

# La clé d'envoi des photos vit dans un fichier .env, pas dans un .txt : c'est
# le même fichier que lit public/api/env.php côté serveur.
ENV_DIAKO = SECRETS / "env_diako.txt"

# ⚠ LE JETON SUPABASE EST CELUI DU COMPTE, PAS DU PROJET. Un jeton d'accès
#   personnel de l'API Management ouvre TOUS les projets du compte : celui déjà
#   posé pour Fonenako fonctionne donc sur Diako (vérifié le 23/08/2026, HTTP
#   201 sur `select 1`). On préfère quand même un fichier propre à Diako s'il
#   existe, pour qu'une révocation reste possible côté Fonenako sans casser ici.
JETON_SUPABASE = SECRETS / "supabase_token.txt"
JETON_SUPABASE_REPLI = SECRETS_FONENAKO / "supabase_token.txt"

CLE_ANTHROPIC = SECRETS / "anthropic_key.txt"
CLE_ANTHROPIC_REPLI = SECRETS_FONENAKO / "anthropic_key.txt"

PROJET_SUPABASE = "eifrwecaszzqrdwjjjbu"
API_SUPABASE = f"https://api.supabase.com/v1/projects/{PROJET_SUPABASE}/database/query"

# ⚠ L'HÔTE DE DIAKO, PAS CELUI DE FONENAKO. Les deux sites tournent chez le même
#   hébergeur et exposent le même script d'envoi ; leurs clés sont distinctes.
#   Se tromper rend « Unauthorized », un message qui laisse croire à un problème
#   d'en-tête alors que la requête est parfaite.
API_UPLOAD = "https://diako.fonenako.mg/api/o2upload.php"
SITE = "https://diako.fonenako.mg"

# Le compte « Diako » : auteur des récits publiés depuis le bot.
AUTEUR_DIAKO = "284aa922-edf6-4773-bcee-c4f7cc074d67"

DEFAUTS = {
    # ── Cadence — volontairement lente : on imite une lecture humaine ────────
    "posts_max_par_source": 40,
    "scrolls_max_par_source": 25,
    "pause_entre_scrolls": [2.5, 5.0],      # secondes, tirage aléatoire
    "pause_entre_sources": [25, 60],
    "navigateur_visible": True,             # headless = beaucoup plus repérable
    # Fils qui traitent photos + relecture EN DEHORS du navigateur. Les monter
    # n'ajoute aucune requête à facebook.com : ça n'accélère que notre côté.
    "travailleurs": 6,
    "photos_max_par_trouvaille": 12,
    "largeur_photo_min": 500,               # px — sous ce seuil c'est un avatar
    "jours_max": 45,                        # ignore les publications plus vieilles
    # ⭐ ANNÉE MINIMALE D'UNE PUBLICATION. Diako vit d'informations FRAÎCHES :
    #   un tarif de 2019, un hôtel fermé depuis, un festival passé six fois ne
    #   valent rien pour quelqu'un qui prépare un voyage. Toute publication
    #   d'une année antérieure est écartée, journalisée et comptée.
    #
    # ⚠⚠ CE FILTRE N'ÉCARTE QUE CE QU'ON SAIT ANCIEN. Quand la date est
    #    illisible — c'est le cas de 2 215 des 2 217 trouvailles déjà en base —
    #    on GARDE : refuser l'inconnu supprimerait 99 % de la collecte. Voir
    #    `collecteur.annee_de_publication`.
    "annee_minimum": 2026,
    # ── Le web ouvert ───────────────────────────────────────────────────────
    # Un site d'hôtel malgache tient en quelques pages ; au-delà on ramasse des
    # archives de blog, pas des tarifs.
    "pages_max_par_site": 8,
    # ⭐ COMBIEN DE SITES PAR PASSAGE. 167 sites à lire d'affilée feraient
    #   plusieurs heures et bloqueraient la collecte Facebook derrière eux. On
    #   en prend une poignée par tour, en commençant par les fiches les plus
    #   vides ; le reste passe au tour suivant. 0 = tous.
    "sites_max_par_collecte": 25,
    "moisson_osm": True,                    # chercher aussi les sites dans OpenStreetMap
    # 🔴 EN DESSOUS DE CE SEUIL, ON NE LANCE PAS CHROMIUM. Le 23/08/2026, la
    #   machine est descendue à 189 Mo de mémoire engageable et Windows a tué
    #   les trois bots. Sauter la partie Facebook en le disant vaut mieux que se
    #   faire tuer au milieu.
    "memoire_mini_mo": 900,
    # ── Ce qu'on garde ──────────────────────────────────────────────────────
    # Un genre décoché n'est pas collecté du tout : inutile de faire trier des
    # publications qu'on ne publiera jamais.
    "genres_actifs": ["etablissement", "carte", "evenement", "recit"],
    "garder_les_incompletes": True,
    # ── Rapprochement avec l'annuaire existant ──────────────────────────────
    # 3 356 fiches sont DÉJÀ en base, vides. Le travail du bot est de les
    # remplir, pas d'en créer une 3 357ᵉ à côté.
    "seuil_rapprochement": 0.48,            # en dessous : aucun candidat proposé
    "seuil_rattachement_auto": 0.78,        # au-dessus ET même lieu : rattaché seul
    "referentiel_heures": 12,               # âge maxi du cache avant rechargement
    # ── Relecture par un modèle (optionnelle) ───────────────────────────────
    # Le bot marche sans. Elle sert là où les règles ne peuvent pas juger :
    # reconnaître un menu d'une simple photo de plat, séparer un événement d'un
    # souvenir, écrire un résumé lisible.
    "llm_actif": True,
    "llm_transport": "passerelle",          # 'passerelle' (LiteLLM local) | 'anthropic'
    "llm_passerelle": "http://127.0.0.1:4000",
    "llm_modele": "",                       # vide = claude-abo / claude-sonnet-5
    # ⭐ MODÈLE DE SECOURS SUR LA MÊME PASSERELLE. `claude-abo` tombe par vagues
    #   (16 × HTTP 500 et 15 × HTTP 429 relevés le 23/08/2026) : plutôt que de
    #   perdre la relecture, on rejoue UNE fois l'appel sur ce modèle-ci.
    #   Vide = ne jamais basculer. ⚠ gemini-flash rend parfois `content: null`
    #   quand il dépasse — ce cas est traité comme un échec propre, pas un bug.
    "llm_modele_secours": "gemini-flash",
    "llm_repli_anthropic": False,
    "llm_delai": 120,
    "llm_confiance_min": 55,
    # ⚠ LA LECTURE DES CARTES PHOTOGRAPHIÉES PASSE PAR LÀ. À Madagascar une
    #   carte de restaurant est publiée en photo, presque jamais tapée : sans
    #   vision, le bot ne comblera jamais les 1 862 restaurants sans carte.
    "llm_vision": True,
    # ── Collectes automatiques ──────────────────────────────────────────────
    # Prospection de sources : le bot cherche lui-même de nouveaux groupes et
    # pages. Les requêtes décrivent le métier — c'est ce qui l'adapte.
    "prospection_requetes": [],
    "prospection_mots_metier": [],
    "prospection_repoussoirs": [],
    "prospection_note_min": 60,
    "prospection_auto_jours": 0,        # 0 = jamais tout seul ; 7 = une fois par semaine
    # (`prospection_auto_adopter` et `prospection_auto_seuil` ont été retirés le
    #  02/09/2026 : jamais lus, ils laissaient croire à une adoption automatique.)
    "collecte_auto": True,
    "heures_collecte": ["11:00", "18:00"],
    "objectif_par_jour": 40,
    # ⭐ LE FIL D'ACTUALITÉ MÉRITE D'ÊTRE DÉROULÉ PLUS LOIN QUE LE RESTE.
    #   Un groupe finit par se répéter au bout de vingt défilements ; le fil,
    #   lui, est trié par l'algorithme de Facebook et continue de servir des
    #   choses neuves — c'est la source la moins coûteuse en pages chargées par
    #   trouvaille.
    "scrolls_max_fil": 45,
    "posts_max_fil": 80,

    # ── Ce qui se fait tout seul ────────────────────────────────────────────
    # Chaque option est éteinte par défaut : rien ne part en ligne sans qu'on
    # l'ait décidé une fois, explicitement.
    "auto_valider": False,
    "auto_valider_score": 80,
    "auto_valider_sans_manque": True,     # jamais une trouvaille incomplète
    "auto_rejeter": False,
    "auto_rejeter_score": 20,
    "auto_publier": False,                # ⚠ écrit en ligne sans relecture
    "auto_publier_max_par_jour": 10,
    "auto_purger_jours": 30,              # 0 = ne rien purger
    "moisson_auto_jours": 7,              # 0 = jamais
    # ⭐ EFFACER LES PHOTOS LOCALES DES TROUVAILLES PUBLIÉES au bout de ce
    #   délai : elles sont chez o2switch, leur URL est en base, et 978
    #   dossiers publiés pesaient 813 Mo sur les 2 Go de data/trouvailles
    #   (02/09/2026). 0 = garder. L'interface montre alors la copie en ligne.
    "purger_photos_publiees_jours": 7,
    # ── Publication ─────────────────────────────────────────────────────────
    "pause_entre_envois_photos": 3.0,       # o2switch part en 500 si on enchaîne
    "publier_directement": True,            # False = fiches et événements en attente
    "cote_photo_max": 1600,                 # au-delà, aucun écran visé ne voit la différence
    "cote_photo_min": 1000,                 # sous ce seuil, la variante 960 flouterait
    "qualite_photo": 86,
    # ⭐ TAUX DE CONVERSION DES DEVISES. Beaucoup de lodges affichent en euros
    #   et n'écrivent jamais un ariary ; `room_types.base_price_ar` étant NOT
    #   NULL, leurs chambres ne partent alors JAMAIS. Le taux est relevé à la
    #   main et le prix publié porte la mention du montant d'origine, pour
    #   qu'on puisse toujours vérifier. {} = ne rien convertir.
    "taux_ariary": {"EUR": 5046, "USD": 4286},
}


# ⭐ CLÉS QUI DOIVENT SE VOIR DANS LE FICHIER. `charger()` comble les clés
#   manquantes en mémoire, donc le bot marche sans elles — mais un réglage
#   absent de config.json est un réglage qu'on ne sait pas qu'on peut changer.
#   Le seuil mémoire (celui qui a sauvé les bots le 23/08), la moisson
#   automatique et le plafond de sites par tour méritent d'être sous les yeux.
#   On n'écrit QUE celles-ci : recopier tout DEFAUTS dans le fichier figerait
#   des valeurs par défaut qui doivent pouvoir évoluer avec le code.
CLES_A_EXPOSER = ("memoire_mini_mo", "moisson_auto_jours",
                  "sites_max_par_collecte", "taux_ariary", "annee_minimum")


def charger() -> dict:
    """Lit data/config.json, en le créant au besoin, et comble les clés manquantes."""
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    config = dict(DEFAUTS)
    if FICHIER_CONFIG.exists():
        posees = json.loads(FICHIER_CONFIG.read_text(encoding="utf-8"))
        # Les clés importantes absentes du fichier y sont écrites avec leur
        # valeur par défaut — une seule fois, pour qu'elles soient modifiables.
        manquantes = [c for c in CLES_A_EXPOSER if c not in posees]
        if manquantes:
            for cle in manquantes:
                posees[cle] = DEFAUTS[cle]
            FICHIER_CONFIG.write_text(
                json.dumps(posees, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        config.update(posees)
    else:
        FICHIER_CONFIG.write_text(
            json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return config


def enregistrer(config: dict) -> None:
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    FICHIER_CONFIG.write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def lire_secret(*chemins: Path) -> str:
    """Lit le premier secret trouvé. Ne jamais logguer la valeur renvoyée.

    `utf-8-sig` et non `utf-8` : ces fichiers sont souvent créés au Bloc-notes
    ou par PowerShell, qui y collent un BOM. `.strip()` ne retire PAS U+FEFF,
    et le jeton part alors dans un en-tête HTTP qui refuse tout ce qui n'est
    pas latin-1 — la requête échoue avant même de partir.
    """
    for chemin in chemins:
        if chemin.exists():
            valeur = chemin.read_text(encoding="utf-8-sig").strip().strip("﻿").strip()
            if valeur:
                return valeur
    liste = " ni ".join(str(c) for c in chemins)
    raise FileNotFoundError(f"Secret absent : {liste}. Voir LISEZ-MOI.md, § Secrets.")


def cle_upload() -> str:
    """La clé d'envoi des photos, extraite du .env de Diako."""
    if not ENV_DIAKO.exists():
        raise FileNotFoundError(
            f"Secret absent : {ENV_DIAKO}. Voir LISEZ-MOI.md, § Secrets."
        )
    for ligne in ENV_DIAKO.read_text(encoding="utf-8-sig").splitlines():
        trouve = re.match(r"\s*O2SWITCH_UPLOAD_API_KEY\s*=\s*(.+)", ligne)
        if trouve:
            return trouve.group(1).strip().strip('"').strip("'")
    raise KeyError(f"O2SWITCH_UPLOAD_API_KEY introuvable dans {ENV_DIAKO}.")
