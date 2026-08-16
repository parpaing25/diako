# -*- coding: utf-8 -*-
"""
LES PHOTOS DE L'ARCHIVE PERSONNELLE, POSÉES SUR LES FICHES.

Ce script lit `inventaire_photos.json` (99 dossiers relevés dans
« Desktop\\ASA\\SERA ORDI KELY\\Diako »), choisit UNE photo par fiche, la
redimensionne, l'envoie sur o2switch et écrit l'ordre SQL de mise à jour.

⚠ CE QUI A ÉTÉ ÉCARTÉ, ET POURQUOI.

  ① L'archive « 2809 » EN ENTIER. Ses images font 6 × 4 pixels pour 3 Ko : ce
    sont des icônes, pas des photos. Trois de ses dossiers contiennent bien du
    4288 × 3216 (Andasibe-Mantadia, Avenue des Baobabs, Isalo) — ils tombent
    avec le reste, sur demande explicite. Le garde-fou `MIN_COTE` les aurait de
    toute façon triés seul.

  ② Cinq dossiers TROP AMBIGUS pour être rattachés sans deviner : « Baie »,
    « Dunes », « CANYON », « Belo » (deux villes du même nom, Belo-Tsiribihina
    et Belo-sur-Mer), « Santa maria ». Poser une photo sur la mauvaise fiche
    est pire que ne pas en poser : personne ne vient la corriger.

🔴 LE RAPPROCHEMENT SE FAIT PAR ÉGALITÉ STRICTE DES MOTS, JAMAIS PAR SOUS-CHAÎNE.
   La première version acceptait qu'un nom court soit contenu dans un long, et
   elle a rangé Nosy Iranja, Nosy Komba, Nosy Mitsio, Nosy Sakatia, Nosy
   Tanikely et Nosy Boraha — six îles distinctes — sous « Nosy Be », parce que
   « nosy » leur est commun. Elle a aussi rattaché « Lemur's Park » à « Ilo
   Park & Fun » sur le seul mot « park ». Ce qui reste ambigu se tranche à la
   main, dans MANUEL ci-dessous, ou ne se tranche pas.

⚠ ET SURTOUT : LA BASE SE LIT EN ENTIER. PostgREST rend 1000 lignes en silence
  quelle que soit la limite demandée. Comparé aux 1000 premiers sites, le
  rapprochement annonçait « 52 lieux à créer » ; comparé aux 2476 sites et
  18345 lieux réels, il en reste deux. Un « aucun candidat » qui vient d'une
  requête tronquée est un mensonge coûteux : il fait créer des doublons.
"""
import io, json, os, re, sys, unicodedata, urllib.request, urllib.error, mimetypes
from PIL import Image, ImageOps

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOTE = "https://diako.fonenako.mg/api/o2upload.php"

# ⚠ LA CLÉ DE DIAKO, PAS CELLE DE FONENAKO. Les deux sites tournent chez le
#   même hébergeur et exposent le même script ; leurs clés sont distinctes
#   (55 caractères contre 64). Se tromper rend « Unauthorized », un message qui
#   laisse croire à un problème d'en-tête alors que la requête est parfaite.
CLE = next(l.split("=", 1)[1].strip().strip('"')
           for l in io.open(os.path.expanduser("~/.diako-secrets/env_diako.txt"),
                            encoding="utf-8")
           if l.startswith("O2SWITCH_UPLOAD_API_KEY="))

# Une photo plus petite que ça n'est pas une photo de couverture : c'est une
# vignette récupérée quelque part. 1000 px est le seuil sous lequel la variante
# 960 du serveur devrait AGRANDIR — donc flouter.
MIN_COTE = 1000
COTE_MAX = 1600          # au-delà, aucun écran visé ne fait la différence
QUALITE = 86

ARCHIVES_EXCLUES = {"2809"}
DOSSIERS_EXCLUS = {"travel 90 days package", "vita", "vaovao 2205"}

# ── LES TREIZE RATTACHEMENTS DÉCIDÉS À LA MAIN ─────────────────────────────
# Clé : « archive/dossier ». Valeur : (table, slug).
# Chacun a été vérifié contre la base complète, pas contre un extrait.
MANUEL = {
    "2026/Diego Suarez":        ("places", "antsiranana"),      # Diego-Suarez = Antsiranana
    "2026/Fort Dauphin":        ("places", "tolagnaro"),        # Fort-Dauphin = Tolagnaro
    "2026/Nosy boraha":         ("places", "nosy-boraha"),      # Nosy Boraha = Sainte-Marie
    "Diako/Anja":               ("attractions", "reserve-communautaire-d-anja"),
    "Diako/Bemaraha":           ("attractions", "parc-national-des-tsingy-de-bemaraha"),
    "Diako/CAP St marie":       ("attractions", "cap-sainte-marie"),   # l'extrême sud, PAS l'île
    "Diako/Komba":              ("attractions", "nosy-komba"),
    "Diako/Nattres":            ("attractions", "ile-aux-nattes"),
    "Diako/RADAMA":             ("attractions", "archipel-des-radama"),
    "Diako/St Marie":           ("attractions", "ile-sainte-marie"),   # l'île, PAS le cap
    "Vaovao Aout 2025/Andohahela": ("attractions", "parc-national-d-andohahela"),
    "Vaovao Aout 2025/Nosy Mitsio & “Les Quatre Frères” orgues basaltiques sur la mer":
                                ("attractions", "nosy-mitsio"),
    "Vaovao Aout 2025/Tsingy de Bemaraha passerelles dans le ciel":
                                ("attractions", "parc-national-des-tsingy-de-bemaraha"),
}

# Ambigus assumés : on ne pose rien plutôt que de poser à côté.
ECARTES = {"Diako/Baie", "Diako/Belo", "Diako/CANYON", "Diako/Dunes", "Diako/Santa maria"}

ART = {"de", "du", "des", "la", "le", "les", "d", "l", "i", "ny", "a", "et",
       "the", "of", "en", "au", "aux"}


def sans_accent(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def jeu(s):
    s = re.sub(r"[^a-z0-9 ]+", " ", sans_accent(s).lower()).strip()
    return frozenset(m for m in s.split() if m not in ART and len(m) > 1)


def rapprocher(inv, base):
    """Rend {(table, slug): [chemins de photos]} — plusieurs dossiers peuvent
    nourrir la même fiche (« Komba » et « Nosy Komba » sont le même endroit)."""
    index = {}
    for c in base:
        index.setdefault(c["j"], []).append(c)
    groupes, orphelins = {}, []
    for x in inv:
        # ⚠ SUR `lieu`, PAS SUR `dossier`. `dossier` porte encore le préfixe de
        #   numérotation et les légendes entre parenthèses du disque ; `lieu`
        #   est le nom nettoyé. Indexer la table manuelle sur `dossier` la rend
        #   silencieusement inopérante — aucune erreur, juste des rattachements
        #   qui n'ont jamais lieu.
        cle = f"{x['archive']}/{x['lieu']}"
        if cle in ECARTES:
            continue
        cible = MANUEL.get(cle)
        if cible is None:
            eq = index.get(jeu(x["lieu"]))
            if eq:
                # Un site prime sur un lieu : il est plus précis, et c'est lui
                # qui s'affiche dans les grilles.
                c = sorted(eq, key=lambda c: c["t"] != "site")[0]
                cible = ("attractions" if c["t"] == "site" else "places", c["s"])
        if cible is None:
            orphelins.append(x)
        else:
            groupes.setdefault(cible, []).extend(x["photos"])
    return groupes, orphelins


def meilleure(chemins, nom_fiche=""):
    """La plus grande photo PAYSAGE utilisable. Le portrait n'est pas exclu,
    il est seulement relégué : une couverture est un bandeau large, et un
    portrait recadré en bandeau perd son sujet.

    🔴 LE SEUIL PORTE SUR LE CÔTÉ LONG, PAS SUR LE CÔTÉ COURT. Testé sur
       `min(w, h)`, il rejetait Anakao en 1484 × 890 et Bekopaka en 1920 × 730
       — des panoramas parfaitement nets — parce que leur hauteur passait sous
       la barre. Onze fiches sur quarante-sept se sont ainsi retrouvées « sans
       aucune photo » alors qu'elles en avaient neuf. Le côté court garde un
       plancher, mais bas : il sert à écarter les bandeaux dégénérés, pas les
       formats larges.

    ⚠ LE NOM DE FICHIER DÉPARTAGE. Ces dossiers mêlent des prises de vue et des
      images ramassées sur le web : dans « Marojejy » cohabitent
      `Massif_Marojejy_01.jpg` et `Landscape-Mountains.jpg`, un fond d'écran
      générique. À taille comparable, celui qui NOMME le lieu gagne.
    """
    attendus = jeu(nom_fiche)
    notes = []
    for f in chemins:
        try:
            with Image.open(f) as im:
                w, h = ImageOps.exif_transpose(im).size
        except Exception:
            continue
        if max(w, h) < MIN_COTE or min(w, h) < 480:
            continue
        r = w / h
        nomme = 1 if (attendus and jeu(os.path.basename(f)) & attendus) else 0
        paysage = 1 if 1.2 <= r <= 2.6 else 0
        notes.append((paysage, nomme, w * h, f))
    if not notes:
        return None
    notes.sort(reverse=True)
    return notes[0][3]


def preparer(chemin):
    with Image.open(chemin) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if max(im.size) > COTE_MAX:
            im.thumbnail((COTE_MAX, COTE_MAX), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=QUALITE, optimize=True, progressive=True)
        return buf.getvalue(), im.size


import subprocess, tempfile

BOCAL = os.path.join(tempfile.gettempdir(), "o2s-diako.jar")


def envoyer(octets, nom):
    """Envoi multipart. Le serveur fabrique lui-même les variantes 480/960/1600
    et les rend dans `variants` — on ne devine JAMAIS les noms de fichiers.

    🔴 POURQUOI CURL ET PAS `urllib`. o2switch place « Tiger Protect » devant le
       site : le premier POST reçoit un 307 assorti d'un cookie `o2s-chl`, et
       seule la requête qui rejoue ce cookie atteint PHP. `urllib` ne conserve
       pas de cookie et, sur un 307, ne renvoie pas le corps — d'où un 406 ou
       une réponse vide, jamais une erreur qui nomme la cause. curl gère le
       bocal à cookies et le renvoi du corps (`--post307`) en une option.
    """
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as t:
        t.write(octets)
        tmp = t.name
    try:
        p = subprocess.run(
            # ⚠ PAS DE `--post307` : cette option n'existe pas. curl la refuse,
            #   sort en erreur, et rend une sortie VIDE — un échec muet qu'on
            #   met du temps à distinguer d'un serveur qui ne répond pas. Un
            #   307 conserve de toute façon méthode et corps sans rien demander.
            ["curl", "-s", "-S", "-L", "--post301", "--post302", "--post303",
             "-c", BOCAL, "-b", BOCAL, "--max-time", "180",
             "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
             "-H", "X-API-Key: " + CLE,
             "-F", "folder=pages", "-F", "filename=" + nom,
             "-F", "file=@" + tmp.replace("\\", "/") + ";type=image/jpeg", HOTE],
            capture_output=True, timeout=300)
        sortie = p.stdout.decode("utf-8", "replace").strip()
        if not sortie.startswith("{"):
            # `stderr` porte la vraie cause quand curl lui-même échoue ; sans
            # elle on ne lit qu'une chaîne vide.
            raise RuntimeError("curl %d : %s | %s" % (
                p.returncode, p.stderr.decode("utf-8", "replace").strip()[:200], sortie[:200]))
        rep = json.loads(sortie)
        if not rep.get("success"):
            raise RuntimeError(rep.get("error", "echec inconnu"))
        return rep
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
