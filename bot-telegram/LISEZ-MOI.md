# Bot Di'ako — le poste de commande Telegram

Un seul bot Telegram pour tenir Diako : la **page Facebook Di'ako**, le **site
diako.fonenako.mg**, la **base**, la **collecte** et la **fabrication des
publications**. Tu lui écris comme à quelqu'un ; il fait, ou il prépare et
attend ton clic.

    Toi (Telegram) → bot Di'ako (ce dossier, port 8763)
                      ├─ page Facebook  : API Graph, jeton de page
                      ├─ site et base   : Supabase, o2switch, redeploy.sh
                      ├─ publications   : marketing/atelier/ (déjà écrit)
                      └─ collecte       : bot-diako (port 8757)

## Ce qu'il ne fait jamais sans toi

Tout ce qui **sort en public** — publier, programmer, répondre à un commentaire
ou à un message, déployer le site, écrire en base — est **préparé puis mis en
attente** avec deux boutons : ✅ Confirmer, ✖ Annuler. Rien ne part avant le
clic, et une demande non confirmée **expire au bout d'une heure** (les chiffres
et l'heure visée ont bougé : il faut la refaire).

La garde est **fermée par défaut** : une compétence nouvelle est protégée tant
que tu ne l'as pas nommée dans `validation_levee` (`data/config.json`).

## Le mettre en route

1. **Créer le bot chez BotFather** (dans Telegram, une fois) :
   `/newbot` → nom : `Diako` → identifiant : `Diako_gestion_bot` (ou libre).
   BotFather répond avec un jeton de la forme `1234567890:AA…`.
2. **Poser le jeton** — une seule ligne, hors du dépôt :

       ~/.diako-secrets/telegram_bot_diako.txt

3. **Démarrer** : double-clic sur `DEMARRER.bat`, ou

       cd ~/Desktop/Diako/bot-telegram
       python demarrer.py

4. Dans Telegram, écris `/start` au bot. Il ne répond **qu'à toi** : ton
   identifiant est relu dans `~/hermes/bridge.env` (`ANDRY_TELEGRAM_ID`).

Sans jeton, le bot démarre quand même en **simulation** : l'interface
`http://127.0.0.1:8763` a un banc d'essai qui suit exactement le même chemin
qu'un message Telegram. C'est ainsi qu'il a été éprouvé avant d'exister.

## Ce qu'on lui demande (exemples)

    l'état de la page
    qu'est-ce qui est programmé cette semaine ?
    les commentaires d'hier
    prépare une publication sur Nosy Tanikely pour samedi 18 h
    combien de fiches ont une photo ?
    le site est à jour ?
    lance une collecte
    note : penser aux baleines en juillet

`/aide` donne la liste complète, `/file` ce qui attend ton clic.

## Les règles qu'il porte

- **Aucun chiffre inventé.** Tout nombre affiché est recompté à la source
  (base, API Graph) au moment où il est dit.
- **Malgache** : une question fermée prend la particule **ve** ; aucun mot hors
  de l'alphabet malgache ; toute narration malgache se fait relire par toi.
- **Une seule porte vers Meta** : le jeton de page de `~/.diako-secrets`. Le bot
  ne crée pas de deuxième chemin de publication.
- **Un seul lecteur Telegram par jeton** : un verrou empêche deux instances
  (sinon Telegram rend 409 et tout tombe).
- **Photos** : l'envoi passe en JSON base64 — o2switch refuse le multipart sur
  ce domaine depuis début septembre (voir `docs/A-APPLIQUER.md`).

## Le dossier

    bot/config.py       chemins, jetons, réglages
    bot/telegram.py     lire et écrire dans Telegram (+ mode simulation)
    bot/competences.py  le registre : ce que le bot sait faire
    bot/validation.py   la file « à confirmer »
    bot/cerveau.py      commandes, clics, et le modèle qui choisit l'outil
    bot/meta.py         la page Facebook
    bot/site.py         le site et la base
    bot/atelier.py      fabrication des publications et des affiches
    bot/redaction.py    les textes (français et malgache)
    bot/collecte.py     pilotage du bot de collecte (8757)
    bot/general.py      état des bots, notes, file d'attente
    bot/serveur.py      API locale + interface web
    tests/              tout est éprouvé hors ligne

## Tests

    cd ~/Desktop/Diako/bot-telegram
    python -m pytest tests -q
