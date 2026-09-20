"""L'atelier : fabriquer les visuels et assembler les publications Di'ako.

Quatre compétences — `fabriquer_affiche`, `preparer_publication`,
`calendrier_publications`, `verifier_publication`. Aucune ne publie ni ne programme
quoi que ce soit : elles fabriquent, elles montrent, elles contrôlent. La publication
sort par une autre compétence, derrière un clic d'Andry.

⚠ ON N'ÉCRIT PAS DANS L'ATELIER DES SÉRIES. `marketing/atelier/sortie/`, `sortie2/`,
  `serie.json` et `serie2.json` appartiennent aux séries de 12 h et 18 h déjà
  programmées ; ce module les LIT (photos déjà utilisées, jours pris, gabarits) et
  écrit ses propres publications dans `bot-telegram/data/sorties/`.

Ce qu'il réutilise, au lieu de le réécrire :
  · `marketing/atelier/fabriquer.py` et `fabriquer2.py` — les gabarits HTML de la page
    (photo en pleine page avec son crédit), importés comme modules. Ils ne lisent pas
    sys.argv à l'import : on peut les importer sans danger ;
  · `marketing/atelier/verifier.py` — les contrôles avant publication. Lui, il LIT
    sys.argv À L'IMPORT (`--sortie`) : on ne l'importe jamais, on le lance en
    sous-processus avec `--sortie <chemin relatif à l'atelier>` ;
  · `marketing/atelier/etat_file.py` — ce que Facebook a vraiment en file. Même règle :
    sous-processus, et son tableau ne porte que le jour et le mois (l'année se déduit) ;
  · `marketing/atelier/choix/*.json` — l'auteur et la licence de chaque photo Commons
    déjà téléchargée. Un crédit deviné est un crédit faux : il se relit là.

⚠ `planche_rendu.py` NE REND RIEN : malgré son nom c'est une planche contact en PIL,
  qui lit `sortie/` relativement au dossier courant. Le rendu des images se fait par
  Playwright (`page.set_content` + `screenshot`), comme dans fabriquer2.py.

⚠ LA CHARTE. Papier #FBF7F1, teal #0E7C86, brique #D0471C, encre #10262B ; le corail
  #F4633A ne porte JAMAIS de texte (bandes et filets seulement) ; titres en serif
  système ; motif de lamba pour les fonds sans photo. `defauts_de_charte()` le vérifie
  sur le HTML produit, avant tout rendu.

⚠ TOUTE PHOTO VENUE DE WIKIMEDIA COMMONS PORTE SON AUTEUR ET SA LICENCE SUR L'IMAGE :
  CC BY et CC BY-SA l'exigent, et une photo repartagée sans sa légende perd son crédit
  en route. Sans auteur ni licence, la publication est refusée ici, pas plus loin.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from . import config, redaction
from . import photos as photos_libres
from .competences import Resultat, competence
from .redaction import _blocs, _entier, _texte, cle_de

# ── La charte ────────────────────────────────────────────────────────────
PAPIER = "#FBF7F1"
ENCRE = "#10262B"
TEAL = "#0E7C86"
TEAL_FORT = "#0A5F67"       # le teal qui peut porter du texte sur fond clair
BRIQUE = "#D0471C"          # 4,2:1 sur le papier : grandes tailles seulement
BRIQUE_FORT = "#BF4118"     # 4,8:1 : la teinte des petits textes
CORAIL = "#F4633A"          # décor uniquement — ne porte jamais de texte
SERIF = 'Georgia,"Times New Roman","Nimbus Roman",serif'

FORMATS = {"carre": (1080, 1080), "portrait": (1080, 1350)}
LOGO = config.DEPOT / "public" / "media" / "diako-marque-512.png"
SORTIES = config.DOSSIER_DONNEES / "sorties"
AFFICHES = config.DOSSIER_DONNEES / "affiches"
PHOTOS_ATELIER = config.ATELIER / "photos"
# Les heures déjà prises par les séries de la page : 12 h « Découvrir Diako »,
# 18 h « Lieux emblématiques », 20 h les reels. Une publication du bot vise ailleurs.
HEURES_SERIES = {"sortie": "18:00", "sortie2": "12:00"}
HEURE_PAR_DEFAUT = "16:00"
# %a rend « Mon » : la locale du PC n'est pas le français, et Andry lit le tableau.
JOURS_FR = ("lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim.")


# ─────────────────────────── emprunts à l'atelier ───────────────────────────

def _gabarits_atelier():
    """`fabriquer` et `fabriquer2` de l'atelier, ou (None, None) s'ils manquent."""
    if str(config.ATELIER) not in sys.path:
        sys.path.insert(0, str(config.ATELIER))
    try:
        import fabriquer as f1  # type: ignore
        import fabriquer2 as f2  # type: ignore
        return f1, f2
    except Exception as e:  # noqa: BLE001 — l'atelier peut manquer : on fabrique sans lui
        print(f"[atelier] gabarits de l'atelier indisponibles : {type(e).__name__} {e}")
        return None, None


def _b64(chemin: Path, largeur_max: int = 1600) -> str:
    """Une image en JPEG base64, réduite : un PNG de 1,4 Mo dans le HTML fait tomber
    le rendu, et la page n'a pas besoin de plus de 1600 px de large."""
    from PIL import Image
    im = Image.open(chemin).convert("RGB")
    im.thumbnail((largeur_max, largeur_max))
    tampon = io.BytesIO()
    im.save(tampon, "JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(tampon.getvalue()).decode()


def _b64_logo() -> str:
    if not LOGO.exists():
        return ""
    return "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()


def credit_connu(chemin: Path) -> dict:
    """L'auteur et la licence d'une photo, relus dans `marketing/atelier/choix/*.json`.

    C'est commons.py qui les y écrit, depuis les métadonnées du fichier Commons. On ne
    devine jamais un crédit : on le relit ou on refuse la photo."""
    dossier = config.ATELIER / "choix"
    if not dossier.exists():
        return {}
    for fiche in sorted(dossier.glob("*.json")):
        try:
            lu = json.loads(fiche.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for entree in lu.values() if isinstance(lu, dict) else []:
            if entree.get("fichier") == chemin.name:
                return {"auteur": entree.get("credit", ""), "licence": entree.get("licence", ""),
                        "source": entree.get("source", ""), "titre": entree.get("titre", "")}
    return {}


# ─────────────────────────── le gabarit d'affiche ───────────────────────────

def css_affiche(largeur: int, hauteur: int) -> str:
    """La charte, en CSS. Le corail n'apparaît que dans des fonds et des filets."""
    haut_photo = int(hauteur * 0.67)
    return f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:{largeur}px;height:{hauteur}px;overflow:hidden;background:{PAPIER};
  font-family:"Segoe UI",system-ui,Arial,sans-serif}}
.cadre{{position:relative;width:{largeur}px;height:{hauteur}px;overflow:hidden;
  display:flex;flex-direction:column}}
.fond{{position:relative;height:{haut_photo}px;background-size:cover;background-color:{ENCRE}}}
/* ── motif de lamba : bandes tissées, quand il n'y a pas de photo ── */
.lamba{{background:
  repeating-linear-gradient(90deg,rgba(251,247,241,.10) 0 3px,transparent 3px 26px),
  repeating-linear-gradient(180deg,{TEAL_FORT} 0 96px,{TEAL} 96px 150px,{ENCRE} 150px 172px)}}
.haut{{position:absolute;left:0;top:0;right:0;height:200px;padding:36px 44px;display:flex;
  justify-content:space-between;align-items:flex-start;
  background:linear-gradient(to bottom,rgba(0,0,0,.55),rgba(0,0,0,0))}}
.logo{{display:flex;align-items:center;gap:14px;color:#fff;font-weight:800;font-size:34px;
  text-shadow:0 2px 10px rgba(0,0,0,.45)}}
.logo img{{width:62px;height:62px;filter:invert(1) drop-shadow(0 2px 6px rgba(0,0,0,.4))}}
.pastille{{background:rgba(16,38,43,.62);color:#fff;border:1px solid rgba(255,255,255,.35);
  border-radius:999px;padding:10px 22px;font-size:24px;font-weight:600}}
/* filet corail : décor, aucun texte dessus */
.filet{{height:10px;background:{CORAIL}}}
.panneau{{flex:1;background:{PAPIER};padding:26px 56px 10px;border-top:10px solid {TEAL};
  display:flex;flex-direction:column;justify-content:center}}
.ou{{color:{TEAL_FORT};font-size:29px;font-weight:700;letter-spacing:.5px}}
.titre{{color:{ENCRE};font-family:{SERIF};font-weight:700;line-height:1.04;margin-top:12px;
  font-size:96px}}
.sous{{color:{BRIQUE};font-style:italic;font-weight:600;font-size:40px;margin-top:16px;
  line-height:1.16}}
.barre{{height:120px;background:{TEAL};color:#fff;padding:18px 56px}}
.cta{{font-size:38px;font-weight:800}}
.cta b{{text-decoration:underline;text-underline-offset:6px}}
.credit{{font-size:19px;opacity:.92;margin-top:6px;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}}
"""


def gabarit_affiche(*, titre: str, sous_titre: str = "", rubrique: str = "", ou: str = "",
                    photo: Path | None = None, credit: str = "", lien: str = "",
                    largeur: int = 1080, hauteur: int = 1350, focus: str = "50% 50%") -> str:
    """Le HTML d'une affiche, carrée ou portrait. Aucun navigateur ici : que du texte."""
    logo = _b64_logo()
    marque = (f'<div class="logo"><img src="{logo}" alt="">Di\'ako</div>' if logo
              else '<div class="logo">Di\'ako</div>')
    if photo is not None:
        fond = (f'<div class="fond" style="background-image:url(\'{_b64(photo)}\');'
                f'background-position:{focus}">')
    else:
        fond = '<div class="fond lamba">'
    adresse = "diako.fonenako.mg" + (lien if lien and lien != "/" else "")
    ligne_credit = credit or "Visuel Diako"
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>{_echappe(titre)}</title><style>{css_affiche(largeur, hauteur)}</style></head><body>
<div class="cadre">
  {fond}
    <div class="haut">{marque}{f'<div class="pastille">{_echappe(rubrique)}</div>' if rubrique else ''}</div>
  </div>
  <div class="filet"></div>
  <div class="panneau">
    {f'<div class="ou">{_echappe(ou)}</div>' if ou else ''}
    <div class="titre">{_echappe(titre)}</div>
    {f'<div class="sous">{_echappe(sous_titre)}</div>' if sous_titre else ''}
  </div>
  <div class="barre">
    <div class="cta">Sur Diako &rarr; <b>{adresse}</b></div>
    <div class="credit">{_echappe(ligne_credit)}</div>
  </div>
</div>
<script>
/* ⚠ bloc isolé : page.set_content garde les variables du rendu précédent, et un
   second « const » au niveau haut ferait sauter TOUT le script en silence
   (incident des 12 affiches Di'ako du 19/09/2026). */
(() => {{
  function tenir(sel, max, min, hmax) {{
    const e = document.querySelector(sel); if (!e) return;
    let t = max; e.style.fontSize = t + 'px';
    while (t > min && (e.scrollWidth > e.clientWidth + 1 ||
           e.getBoundingClientRect().height > hmax)) {{ t -= 2; e.style.fontSize = t + 'px'; }}
  }}
  tenir('.titre', 96, 46, {int(hauteur * 0.16)});
  tenir('.sous', 40, 26, 110);
  tenir('.cta', 38, 22, 52);
}})();
</script></body></html>"""


def _echappe(texte: str) -> str:
    """Le texte d'Andry peut porter < ou & : il entre dans du HTML, il s'échappe.
    L'apostrophe droite devient typographique sur l'image, jamais dans le texte collé."""
    return (_texte(texte).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("'", "’"))


def defauts_de_charte(html: str) -> list[str]:
    """Ce qui trahit la charte dans un HTML d'affiche, avant tout rendu."""
    defauts = []
    # ⚠ « background-color:#F4633A » contient « color:#F4633A » : la garde doit
    #   refuser la couleur de TEXTE seulement, sinon elle crie sur un fond légitime.
    if re.search(r"(?<![-\w])color\s*:\s*" + CORAIL, html, re.I):
        defauts.append(f"le corail {CORAIL} porte du texte : il est réservé au décor")
    for couleur, nom in ((PAPIER, "papier"), (TEAL, "teal"), (ENCRE, "encre")):
        if couleur.lower() not in html.lower():
            defauts.append(f"la couleur {nom} ({couleur}) n'apparaît pas")
    if "serif" not in html:
        defauts.append("le titre n'est pas en serif")
    return defauts


# ─────────────────────────── le rendu (Playwright) ───────────────────────────

def _rendre(pages: list[tuple[str, Path, int, int]]) -> tuple[list[Path], str]:
    """Rend les pages (html, destination, largeur, hauteur) en PNG, un navigateur pour
    toutes. Rend (fichiers écrits, message d'erreur). N'explose jamais : le bot doit
    répondre même sans navigateur."""
    if not pages:
        return [], ""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return [], "Playwright n'est pas installé : gabarits HTML écrits, images non rendues."
    faits: list[Path] = []
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch()
            try:
                for html, dest, largeur, hauteur in pages:
                    page = nav.new_page(viewport={"width": largeur, "height": hauteur},
                                        device_scale_factor=1)
                    page.set_content(html, wait_until="load")
                    page.wait_for_timeout(300)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(dest))
                    page.close()
                    faits.append(dest)
            finally:
                nav.close()
    except Exception as e:  # noqa: BLE001 — mémoire, navigateur absent, page cassée
        return faits, f"rendu interrompu : {type(e).__name__} {e}"
    return faits, ""


# ─────────────────────────── compétence : affiche ───────────────────────────

@competence(
    "fabriquer_affiche",
    "Fabriquer une affiche",
    "Fabrique l'image d'une publication Di'ako (carré 1080×1080 et/ou portrait "
    "1080×1350) à partir d'un titre, d'un sous-titre, d'une photo de fond et du logo. "
    "Sans photo, le fond prend le motif de lamba. Une photo de Wikimedia Commons porte "
    "son auteur et sa licence sur l'image, sinon elle est refusée.",
    parametres={
        "titre": "le titre de l'affiche",
        "sous_titre": "le sous-titre (souvent le malgache)",
        "rubrique": "la pastille en haut à droite, ex. « Lieux emblématiques »",
        "ou": "la ligne de situation, ex. « 📍 Près de Diego-Suarez · Diana »",
        "photo": "le chemin de la photo de fond (ou son nom dans marketing/atelier/photos)",
        "auteur": "l'auteur de la photo — obligatoire pour une photo Commons",
        "licence": "la licence de la photo — obligatoire pour une photo Commons",
        "source": "l'adresse de la photo sur Commons",
        "format": "carre, portrait, ou « les deux » (défaut)",
        "lien": "le chemin de la page du site montré dans la barre, ex. /lieu/ampefy",
        "focus": "le cadrage de la photo, ex. « 50% 30% »",
        "cle": "le nom du dossier de sortie ; déduit du titre sinon",
        "rendu": "« non » pour n'écrire que le HTML, sans lancer de navigateur",
    },
    obligatoires=("titre",),
    exemples=("fais l'affiche d'Ampefy avec la photo ampefy.jpg",
              "une affiche carrée « Diako, c'est quoi ? » sans photo"),
    famille="marketing",
)
def fabriquer_affiche(titre: str, sous_titre: str = "", rubrique: str = "", ou: str = "",
                      photo: str = "", auteur: str = "", licence: str = "", source: str = "",
                      format: str = "les deux", lien: str = "", focus: str = "",
                      cle: str = "", rendu: str = "") -> Resultat:
    titre = _texte(titre)
    cle = cle_de(_texte(cle) or titre)
    demande = _texte(format).lower() or "les deux"
    voulus = [f for f in ("carre", "portrait") if f in demande] or ["carre", "portrait"]

    chemin, defaut_photo, credit = None, "", ""
    if _texte(photo):
        chemin, defaut_photo = _trouver_photo(photo)
        if chemin is not None:
            fiche = {"auteur": _texte(auteur), "licence": _texte(licence),
                     "source": _texte(source)}
            connu = credit_connu(chemin)
            for champ in ("auteur", "licence", "source"):
                fiche[champ] = fiche[champ] or connu.get(champ, "")
            manque = _credit_manquant(chemin, fiche)
            if manque:
                return Resultat(texte=manque, ok=False)
            credit = _ligne_credit(fiche)
    if defaut_photo:
        return Resultat(texte=defaut_photo, ok=False)

    dossier = AFFICHES / cle
    dossier.mkdir(parents=True, exist_ok=True)
    pages, ecrits, defauts = [], [], []
    for nom in voulus:
        largeur, hauteur = FORMATS[nom]
        html = gabarit_affiche(titre=titre, sous_titre=_texte(sous_titre),
                               rubrique=_texte(rubrique), ou=_texte(ou), photo=chemin,
                               credit=credit, lien=_texte(lien), largeur=largeur,
                               hauteur=hauteur, focus=_texte(focus) or "50% 50%")
        defauts += defauts_de_charte(html)
        fichier_html = dossier / f"affiche-{nom}.html"
        fichier_html.write_text(html, encoding="utf-8")
        ecrits.append(fichier_html)
        pages.append((html, dossier / f"affiche-{nom}.png", largeur, hauteur))

    images, erreur = ([], "rendu non demandé") if _texte(rendu).lower().startswith("non") \
        else _rendre(pages)

    lignes = [f"Affiche « {titre} » — {', '.join(voulus)}"]
    lignes.append(f"Dossier : {dossier}")
    lignes.append("Fond : " + (f"photo {chemin.name}" if chemin else "motif de lamba"))
    if credit:
        lignes.append("Crédit porté sur l'image : " + credit)
    if images:
        lignes.append(f"{len(images)} image(s) rendue(s).")
    else:
        lignes.append(f"Aucune image rendue ({erreur}). Les gabarits HTML sont écrits : "
                      + ", ".join(f.name for f in ecrits))
    if defauts:
        lignes.append("Charte : " + " | ".join(sorted(set(defauts))))
    lignes.append("Regarde l'image avant qu'elle parte : une affiche se juge à l'œil.")

    return Resultat(
        texte="\n".join(lignes),
        ok=not defauts,
        images=images,
        donnees={"cle": cle, "dossier": str(dossier), "html": [str(f) for f in ecrits],
                 "images": [str(i) for i in images], "credit": credit, "defauts": defauts},
    )


def _trouver_photo(brut: str) -> tuple[Path | None, str]:
    """Le chemin réel d'une photo, cherché là où elles vivent. (chemin, défaut)."""
    nom = _texte(brut)
    essais = [Path(nom), PHOTOS_ATELIER / nom, config.ATELIER / nom, config.DEPOT / nom,
              config.DOSSIER_DONNEES / nom]
    for essai in essais:
        try:
            if essai.is_file():
                return essai, ""
        except OSError:
            continue
    return None, (f"Photo introuvable : {nom}. Cherchée dans "
                  f"{PHOTOS_ATELIER} et dans le dépôt.")


def _credit_manquant(chemin: Path, fiche: dict) -> str:
    """« » si la photo peut partir ; sinon pourquoi elle est refusée."""
    de_commons = ("commons" in (fiche.get("source") or "").lower()
                  or "wikimedia" in (fiche.get("source") or "").lower()
                  or PHOTOS_ATELIER in chemin.parents)
    if de_commons and not (fiche.get("auteur") and fiche.get("licence")):
        return (f"REFUS : {chemin.name} vient de Wikimedia Commons et n'a ni auteur ni "
                "licence lisibles. CC BY et CC BY-SA les exigent avec l'image, et un "
                "crédit deviné est un crédit faux. Donne-moi `auteur` et `licence`, ou "
                "prends la photo par commons.py qui les relit dans les métadonnées.")
    return ""


def _ligne_credit(fiche: dict) -> str:
    if not fiche.get("auteur"):
        return ""
    morceaux = [fiche["auteur"], fiche.get("licence", "")]
    if "commons" in (fiche.get("source") or "").lower():
        morceaux.append("Wikimedia Commons")
    return "Photo : " + " · ".join(m for m in morceaux if m)


# ─────────────────────────── compétence : préparer ───────────────────────────

@competence(
    "preparer_publication",
    "Préparer une publication",
    "Assemble une publication complète et prête à programmer : le texte, l'affiche, les "
    "photos créditées, le lien, les contrôles de verifier.py, le tout rangé dans un "
    "dossier daté. Ne publie rien et ne programme rien : elle montre le résultat.",
    parametres={
        "titre": "le titre de la publication",
        "sujet": "de quoi elle parle, si le texte reste à écrire",
        "texte": "le texte déjà écrit (sinon il est rédigé)",
        "sous_titre_mg": "le sous-titre malgache de la première ligne",
        "question": ("la question posée au public en fin de publication — REPRENDS "
                     "celle d'Andry telle qu'il l'a posée, ne la reformule pas"),
        "rubrique": "lieu, site, legende, evenement, culture, plat, musique, histoire, conseil",
        "lien": "le chemin de la page du site, ex. /lieu/ampefy",
        "photos": ("une photo par ligne : chemin | auteur | licence | source. "
                   "LAISSE VIDE si tu n'as pas de VRAI fichier sur ce disque : "
                   "je chercherai alors une photo libre et créditée moi-même. N'invente jamais un chemin, un auteur ni une licence."),
        "jour": "le jour visé (AAAA-MM-JJ) ; le premier créneau libre sinon",
        "heure": "l'heure visée (HH:MM) ; 16:00 par défaut, les autres heures sont prises",
        "chiffres": "les nombres déjà comptés, avec leur source",
        "faits": "les faits vérifiés à reprendre, un par ligne",
        "langue": "fr (défaut) ou mg",
        "cle": "la clé de la publication ; déduite du titre sinon",
        "rendu": "« non » pour n'écrire que les gabarits HTML, sans navigateur",
    },
    obligatoires=(),
    exemples=("prépare la publication sur Ampefy avec la photo ampefy.jpg",
              "prépare le post du lac Andraikiba pour le 25/09 à 16 h"),
    famille="marketing",
)
def preparer_publication(titre: str = "", sujet: str = "", texte: str = "", sous_titre_mg: str = "",
                         question: str = "", rubrique: str = "lieu", lien: str = "", photos: Any = "",
                         jour: str = "", heure: str = "", chiffres: Any = "", faits: Any = "",
                         langue: str = "fr", cle: str = "", rendu: str = "") -> Resultat:
    # ⚠ le paramètre s'appelle « jour » et non « date » : `date` est la classe importée
    #   en tête de module, et un paramètre du même nom la masquerait dans la fonction.
    # 🔴 LE TITRE N'EST PAS OBLIGATOIRE. « Il me manque : titre » n'est pas une
    #    réponse acceptable quand Andry écrit « fais une publication sur Nosy
    #    Be » (mesuré le 20/09/2026, deux fois). À défaut, il se déduit du sujet,
    #    par ses noms propres.
    titre = _texte(titre)
    if not titre:
        sujet_net = _texte(sujet) or _texte(texte)[:60]
        pistes = photos_libres._pistes(sujet_net)
        titre = (pistes[0] if pistes else sujet_net or "Publication Diako").strip()
    cle = cle_de(_texte(cle) or titre)
    jour = _texte(jour)
    heure = _texte(heure) or HEURE_PAR_DEFAUT
    lien = _texte(lien)
    if lien and not lien.startswith("/"):
        lien = "/" + lien
    occupes = _jours_occupes()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", jour):
        jour = _premier_creneau_libre(occupes, heure)
    elif heure in occupes.get(jour, {}):
        return Resultat(
            texte=(f"Le {jour} à {heure} est déjà pris : {occupes[jour][heure]}.\n"
                   "Deux publications au même moment se font de l'ombre. Demande-moi le "
                   "calendrier, je te donnerai les créneaux libres."),
            ok=False,
        )

    # ── les photos AVANT le texte : leurs auteurs entrent dans la ligne de crédits,
    #    et une photo sans crédit arrête tout avant qu'on ait écrit quoi que ce soit ──
    retenues, refus = _lire_photos(photos)
    # 🔴 ON NE DEMANDE PAS UN CHEMIN DE FICHIER À QUELQU'UN QUI ÉCRIT DEPUIS SON
    #    TÉLÉPHONE. Le 20/09/2026, à « fais une publication photo belle de Nosy
    #    Be », le bot a répondu « Quel(s) fichier(s) photo(s) veux-tu joindre ? ».
    #    Sans photo fournie, on en cherche une LIBRE et créditée (notre base
    #    d'abord, Wikimedia Commons ensuite) et on le dit dans le résultat.
    #    ⚠ LE MODÈLE INVENTE AUSSI DES PHOTOS. Mesuré le 20/09/2026 :
    #      « photos/nosy_be_beautiful.jpg | Jean Rakoto | CC-BY |
    #      https://example.com/… » — fichier, auteur et source fabriqués. Un
    #      chemin introuvable n'arrête donc plus la préparation : on cherche une
    #      vraie photo libre, et on DIT que celle du modèle n'existait pas.
    photo_trouvee, photo_inventee = None, []
    if not retenues:
        photo_inventee = refus
        photo_trouvee = photos_libres.photo_pour(_texte(sujet) or titre)
        if photo_trouvee:
            retenues, refus = _lire_photos(photos_libres.ligne_photo(photo_trouvee))
    if refus:
        return Resultat(texte="\n".join(refus), ok=False)

    # ⚠ LA PUBLICATION DOIT MENER QUELQUE PART. Quand la photo vient de notre
    #   base, on connaît la page du lieu ou du site : c'est un bien meilleur
    #   lien que l'accueil, et `rediger_publication` le vérifie ensuite.
    cta_auto = ""
    if not lien and photo_trouvee and photo_trouvee.get("slug"):
        route = {"lieu": "/lieu/", "site": "/site/"}.get(photo_trouvee.get("genre"), "")
        if route:
            lien = route + photo_trouvee["slug"]
            # L'appel nomme le LIEU, pas le titre de la publication : « la fiche
            # Bon dimanche depuis Nosy Be » ne veut rien dire.
            cta_auto = f"La fiche {photo_trouvee.get('nom', '')} sur Diako".strip()

    # ── le texte ──
    # 🔴 UN TEXTE FOURNI PASSE QUAND MÊME PAR LE GABARIT. Le modèle écrit une
    #    jolie phrase, mais sans l'icône de rubrique, sans le lien suivi, sans la
    #    ligne 🙋 ni les hashtags : `verifier.py` la REFUSE (mesuré le
    #    20/09/2026, deux préparations de suite). On lui donne donc son texte
    #    comme CORPS, et la maison met la forme autour.
    if _texte(texte):
        ecrit = redaction.rediger_publication(
            sujet=_texte(sujet) or titre, titre=titre, rubrique=rubrique, langue=langue,
            lien=lien, chiffres=chiffres, faits=faits, sous_titre_mg=sous_titre_mg, cle=cle,
            corps=_texte(texte), question=_texte(question), cta=cta_auto,
            auteurs_photos=[p["auteur"] for p in retenues])
        post = ecrit.donnees.get("texte", "")
        sous_titre_mg = sous_titre_mg or ecrit.donnees.get("sous_titre_mg", "")
        origine_texte = "texte d'Andry, mis en forme"
        defauts_texte = list(ecrit.donnees.get("defauts", []))
    else:
        ecrit = redaction.rediger_publication(
            sujet=_texte(sujet) or titre, titre=titre, rubrique=rubrique, langue=langue,
            lien=lien, chiffres=chiffres, faits=faits, sous_titre_mg=sous_titre_mg, cle=cle,
            # ⚠ LA QUESTION D'ANDRY EST DANS SA DEMANDE. Sans ce passage, le
            #   gabarit en inventait une autre et la sienne était perdue.
            question=_texte(question), cta=cta_auto,
            auteurs_photos=[p["auteur"] for p in retenues])
        post = ecrit.donnees.get("texte", "")
        sous_titre_mg = sous_titre_mg or ecrit.donnees.get("sous_titre_mg", "")
        origine_texte = ecrit.donnees.get("origine", "gabarit")
        defauts_texte = list(ecrit.donnees.get("defauts", []))
    if not defauts_texte:
        defauts_texte = redaction.controler_texte(
            post, cle=cle, lien=lien, chiffres=chiffres, noms_propres=[titre, sujet],
            lignes_malgaches=[sous_titre_mg])

    dossier = SORTIES / f"{jour}-{cle}"
    dossier.mkdir(parents=True, exist_ok=True)
    for ancienne in list(dossier.glob("fil-*.png")) + list(dossier.glob("affiche-*.png")):
        ancienne.unlink()

    # ── les images : l'affiche en 1080×1350 (verifier.py n'accepte que ce format),
    #    puis les photos, chacune avec son crédit ──
    rubrique_lisible = redaction.RUBRIQUES.get(rubrique, redaction.RUBRIQUES["lieu"])[1]
    pages: list[tuple[str, Path, int, int]] = []
    html_affiche = gabarit_affiche(
        titre=titre, sous_titre=sous_titre_mg, rubrique=rubrique_lisible, lien=lien,
        photo=retenues[0]["fichier"] if retenues else None,
        credit=_ligne_credit(retenues[0]) if retenues else "", largeur=1080, hauteur=1350)
    (dossier / "affiche-fil.html").write_text(html_affiche, encoding="utf-8")
    pages.append((html_affiche, dossier / "affiche-fil.png", 1080, 1350))
    defauts_charte = defauts_de_charte(html_affiche)

    _, f2 = _gabarits_atelier()
    total = min(5, max(1, len(retenues)))
    for rang, photo_dict in enumerate(retenues[1:5], 2):
        html = _gabarit_photo(f2, photo_dict, titre=titre, lien=lien, rang=rang, total=total,
                              rubrique=rubrique_lisible)
        (dossier / f"fil-{rang}.html").write_text(html, encoding="utf-8")
        pages.append((html, dossier / f"fil-{rang}.png", 1080, 1350))

    images, erreur_rendu = ([], "rendu non demandé") \
        if _texte(rendu).lower().startswith("non") else _rendre(pages)

    # ── brouillon.txt et fiche.json, dans la forme que verifier.py lit ──
    (dossier / "brouillon.txt").write_text(post + "\n", encoding="utf-8")
    (dossier / "fiche.json").write_text(json.dumps({
        "cle": cle, "serie": "bot Telegram", "date": jour, "heure": heure, "lien": lien,
        "page": f"Di'ako ({config.PAGE_DIAKO})", "titre": titre,
        "images": [i.name for i in images], "images_prevues": [p[1].name for p in pages],
        "origine_texte": origine_texte,
        "photos": [{"rang": p["rang"], "fichier": p["fichier"].name, "auteur": p["auteur"],
                    "licence": p["licence"], "source": p["source"]} for p in retenues],
        "chiffres": _texte(chiffres), "programme": False,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    verdicts = _verdicts_verifier(cle)

    lignes = [f"Publication « {titre} » préparée pour le {jour} à {heure}.",
              f"Dossier : {dossier}", "", post, "", "———",
              f"Texte : {origine_texte} · {len(post)} caractères",
              f"Images : {len(images)} rendue(s) sur {len(pages)} prévue(s)"
              + (f" — {erreur_rendu}" if erreur_rendu else ""),
              f"Photos créditées : {len(retenues)}"]
    for p in retenues:
        lignes.append(f"  · {p['fichier'].name} — {p['auteur']} · {p['licence']}")
    if photo_trouvee:
        origine = {"lieu": "notre base (lieu)", "site": "notre base (site)",
                   "commons": "Wikimedia Commons"}.get(photo_trouvee.get("genre"), "")
        lignes.append(f"Photo choisie par moi dans {origine} : {photo_trouvee.get('nom','')}"
                      f" ({photo_trouvee.get('licence','')}).")
    for manquante in photo_inventee:
        lignes.append(f"  ⚠ {manquante}")
    for d in defauts_texte:
        lignes.append(f"  ✗ texte : {d}")
    for d in defauts_charte:
        lignes.append(f"  ✗ charte : {d}")
    lignes += verdicts
    lignes.append("Rien n'est programmé : tu regardes, puis tu décides.")

    bloquant = bool(defauts_charte) or any("REFUS" in v for v in verdicts) \
        or any("texte long" not in d for d in defauts_texte)
    return Resultat(
        texte="\n".join(lignes),
        ok=not bloquant,
        images=images[:5],
        donnees={"cle": cle, "dossier": str(dossier), "date": jour, "heure": heure,
                 "texte": post, "defauts": defauts_texte + defauts_charte,
                 "verdicts": verdicts},
        suites=[{"texte": "Vérifier à fond",
                 "action": "faire:verifier_publication|" + json.dumps({"cle": cle})},
                # Andry juge une photo à l'œil : il doit pouvoir en voir d'autres
                # sans retaper sa demande.
                {"texte": "Autres photos",
                 "action": "faire:chercher_photo|" + json.dumps(
                     {"sujet": _texte(sujet) or titre, "combien": "3"}, ensure_ascii=False)},
                {"texte": "Voir le calendrier", "action": "faire:calendrier_publications|"}],
    )


def _gabarit_photo(f2, photo: dict, *, titre: str, lien: str, rang: int, total: int,
                   rubrique: str) -> str:
    """La page d'une photo, avec son crédit SUR l'image.

    On emprunte le gabarit de la série 2 quand il est là : c'est celui qui est en
    production sur la page. Sinon on retombe sur une affiche sans titre, qui porte le
    même crédit — jamais sur une image nue."""
    if f2 is not None:
        try:
            p = {"rubrique": rubrique, "icone": "📍", "ou": "", "titre": titre, "mg": "",
                 "emoji": "📷", "lien": lien or "/", "legendes_photos": {}}
            return f2.html_photo_suite(p, {**photo, "rang": rang}, rang, total, _b64_logo())
        except Exception as e:  # noqa: BLE001 — un gabarit cassé ne bloque pas la fabrication
            print(f"[atelier] gabarit photo de l'atelier inutilisable : {type(e).__name__} {e}")
    return gabarit_affiche(titre=titre, sous_titre="", rubrique=f"{rang}/{total}",
                           photo=photo["fichier"], credit=_ligne_credit(photo), lien=lien,
                           largeur=1080, hauteur=1350)


def _lire_photos(brut: Any) -> tuple[list[dict], list[str]]:
    """Les photos d'une publication : chemin, auteur, licence, source. (retenues, refus)."""
    retenues, refus = [], []
    for rang, ligne in enumerate(_blocs(brut), 1):
        morceaux = [m.strip() for m in _texte(ligne).split("|")]
        chemin, defaut = _trouver_photo(morceaux[0])
        if chemin is None:
            refus.append(defaut)
            continue
        fiche = {"auteur": morceaux[1] if len(morceaux) > 1 else "",
                 "licence": morceaux[2] if len(morceaux) > 2 else "",
                 "source": morceaux[3] if len(morceaux) > 3 else ""}
        connu = credit_connu(chemin)
        for champ in ("auteur", "licence", "source"):
            fiche[champ] = fiche[champ] or connu.get(champ, "")
        manque = _credit_manquant(chemin, fiche)
        if manque:
            refus.append(manque)
            continue
        retenues.append({"rang": rang, "fichier": chemin, **fiche})
    return retenues, refus


# ─────────────────────────── compétence : calendrier ───────────────────────────

def _jours_occupes(lire_facebook: bool = False) -> dict[str, dict[str, str]]:
    """Ce qui est déjà pris, jour par jour et heure par heure.

    Trois sources : les séries de l'atelier (12 h et 18 h), les publications préparées
    ici, et — si on le demande — ce que Facebook a vraiment en file."""
    pris: dict[str, dict[str, str]] = {}
    dossiers = [(config.ATELIER / "sortie", "série 18 h"),
                (config.ATELIER / "sortie2", "série 12 h"),
                (SORTIES, "bot Telegram")]
    for dossier, etiquette in dossiers:
        if not dossier.exists():
            continue
        for d in sorted(dossier.iterdir()):
            if not (d.is_dir() and re.match(r"\d{4}-\d{2}-\d{2}-", d.name)):
                continue
            heure = HEURES_SERIES.get(dossier.name, HEURE_PAR_DEFAUT)
            fiche = d / "fiche.json"
            if fiche.exists():
                try:
                    heure = json.loads(fiche.read_text(encoding="utf-8")).get("heure", heure)
                except (json.JSONDecodeError, OSError):
                    pass
            pris.setdefault(d.name[:10], {})[heure] = f"{etiquette} · {d.name[11:]}"
    if lire_facebook:
        for jour, creneaux in _file_facebook().items():
            for h, quoi in creneaux.items():
                pris.setdefault(jour, {}).setdefault(h, "Facebook · " + quoi)
    return pris


def annee_probable(jour: int, mois: int, aujourdhui: date) -> date:
    """L'année d'un « 19/09 » lu dans un tableau qui ne la porte pas : la plus proche.

    ⚠ La file de Facebook ne va pas au-delà de 29 jours : une date sans année y est
      donc toujours à quelques semaines d'aujourd'hui, jamais à un an.
    ⚠ Le 29 février n'existe pas toutes les années : chercher sur trois ans seulement
      rendait une liste VIDE et le calendrier tombait sur un min() sans candidat."""
    for portee in (2, 5):
        candidats = []
        for ecart in range(-portee, portee + 1):
            try:
                candidats.append(date(aujourdhui.year + ecart, mois, jour))
            except ValueError:
                continue
        if candidats:
            return min(candidats, key=lambda d: abs((d - aujourdhui).days))
    return aujourdhui


def _file_facebook() -> dict[str, dict[str, str]]:
    """Ce que Facebook a en file, par etat_file.py. Vide si le jeton ou le réseau manque.

    ⚠ etat_file.py lit son jeton et appelle l'API à l'exécution : jamais importé, lancé
      en sous-processus, et son tableau ne donne que « 19/09 » — l'année se déduit."""
    script = config.ATELIER / "etat_file.py"
    if not script.exists():
        return {}
    try:
        r = subprocess.run([sys.executable, str(script)], cwd=str(config.ATELIER),
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=180,
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    except (subprocess.SubprocessError, OSError) as e:
        print(f"[atelier] file Facebook illisible : {type(e).__name__} {e}")
        return {}
    if r.returncode != 0:
        print(f"[atelier] etat_file.py a échoué : {(r.stderr or r.stdout)[:200]}")
        return {}
    colonnes = ["12:00", "18:00", "20:00"]
    sortie: dict[str, dict[str, str]] = {}
    for ligne in r.stdout.splitlines():
        cases = [c.strip() for c in ligne.strip().strip("|").split("|")]
        if len(cases) != 4 or not re.fullmatch(r"\d{2}/\d{2}", cases[0]):
            continue
        j, m = (int(x) for x in cases[0].split("/"))
        jour = annee_probable(j, m, date.today()).isoformat()
        for heure, contenu in zip(colonnes, cases[1:]):
            if contenu and contenu not in ("—", "-"):
                sortie.setdefault(jour, {})[heure] = contenu[:40]
    return sortie


def _premier_creneau_libre(occupes: dict[str, dict[str, str]], heure: str,
                           depuis: date | None = None) -> str:
    jour = (depuis or date.today()) + timedelta(days=1)
    for _ in range(120):
        if heure not in occupes.get(jour.isoformat(), {}):
            return jour.isoformat()
        jour += timedelta(days=1)
    return jour.isoformat()


@competence(
    "calendrier_publications",
    "Calendrier des publications",
    "Propose un calendrier sur N jours : ce qui est déjà pris (séries de 12 h et 18 h, "
    "reels de 20 h, publications préparées ici, file réelle de Facebook) et ce qui reste "
    "libre. Ne programme rien.",
    parametres={
        "jours": "sur combien de jours (14 par défaut)",
        "heure": "l'heure visée pour les créneaux libres (16:00 par défaut)",
        "depuis": "le jour de départ (AAAA-MM-JJ) ; demain par défaut",
        "facebook": "« oui » pour lire aussi la file réelle de la page (plus lent)",
    },
    exemples=("le calendrier des publications", "quels créneaux sont libres en octobre ?"),
    famille="marketing",
)
def calendrier_publications(jours: Any = "", heure: str = "", depuis: str = "",
                            facebook: str = "") -> Resultat:
    combien = max(1, min(60, _entier(jours, 14)))
    heure = _texte(heure) or HEURE_PAR_DEFAUT
    lire_fb = _texte(facebook).lower().startswith(("o", "y", "1"))
    debut = date.today() + timedelta(days=1)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", _texte(depuis)):
        debut = date.fromisoformat(_texte(depuis))

    occupes = _jours_occupes(lire_facebook=lire_fb)
    lignes = [f"Calendrier du {debut:%d/%m} sur {combien} jours — créneau visé : {heure}", ""]
    libres = []
    for k in range(combien):
        jour = debut + timedelta(days=k)
        cle_jour = jour.isoformat()
        pris = occupes.get(cle_jour, {})
        detail = " · ".join(f"{h} {q}" for h, q in sorted(pris.items())) or "rien de prévu"
        libre = heure not in pris
        if libre:
            libres.append(cle_jour)
        lignes.append(f"{'○' if libre else '●'} {JOURS_FR[jour.weekday()]} {jour:%d/%m} — {detail}")
    lignes += ["", f"{len(libres)} créneau(x) libres à {heure} : "
                   + (", ".join(libres[:10]) or "aucun")]
    if not lire_fb:
        lignes.append("File Facebook non relue (dis « oui » à `facebook` pour l'interroger) : "
                      "ce tableau ne montre que les dossiers locaux.")
    else:
        lignes.append("File Facebook relue par etat_file.py — c'est la seule vérité de ce "
                      "qui est programmé.")
    lignes.append("12 h et 18 h sont les séries en cours, 20 h les reels : on ne s'y pose pas.")

    return Resultat(texte="\n".join(lignes), ok=True,
                    donnees={"libres": libres, "occupes": occupes, "heure": heure})


# ─────────────────────────── compétence : vérifier ───────────────────────────

def _lancer_verifier() -> tuple[int, list[str]]:
    """verifier.py sur NOS publications. (code de sortie, lignes).

    ⚠ verifier.py lit `--sortie` DANS sys.argv À L'IMPORT et le résout relativement à
      son propre dossier : il se lance en sous-processus, avec un chemin relatif à
      `marketing/atelier`, jamais en import.
    ⚠ Console cp1252 : sans PYTHONIOENCODING, un emoji de son rapport tue le script."""
    script = config.ATELIER / "verifier.py"
    if not script.exists():
        return -1, [f"verifier.py introuvable ({script})"]
    SORTIES.mkdir(parents=True, exist_ok=True)
    try:
        relatif = os.path.relpath(SORTIES, config.ATELIER).replace("\\", "/")
    except ValueError:
        relatif = str(SORTIES)
    try:
        r = subprocess.run([sys.executable, str(script), "--sortie", relatif],
                           cwd=str(config.ATELIER), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=300,
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    except (subprocess.SubprocessError, OSError) as e:
        return -1, [f"verifier.py n'a pas pu tourner : {type(e).__name__} {e}"]
    lignes = [l.rstrip() for l in (r.stdout or "").splitlines() if l.strip()]
    if r.returncode != 0 and not lignes:
        lignes = [(r.stderr or "").strip()[:300] or "verifier.py n'a rien dit"]
    return r.returncode, lignes


def _verdicts_verifier(cle: str) -> list[str]:
    """Les lignes de verifier.py qui parlent de cette publication."""
    _, lignes = _lancer_verifier()
    return [f"  {l}" for l in lignes if cle and cle in l]


@competence(
    "verifier_publication",
    "Vérifier une publication",
    "Passe une publication préparée au crible de verifier.py : photos déjà utilisées par "
    "une autre série, crédits manquants, format des images, lien et utm, texte trop long, "
    "question malgache sans « ve ». Rend la liste des défauts.",
    parametres={
        "cle": "la clé de la publication à vérifier ; toutes si rien n'est donné",
    },
    exemples=("vérifie la publication ampefy", "contrôle ce qui est préparé"),
    famille="marketing",
)
def verifier_publication(cle: str = "") -> Resultat:
    cle = cle_de(_texte(cle)) if _texte(cle) else ""
    dossiers = [d for d in sorted(SORTIES.glob("*"))
                if d.is_dir() and re.match(r"\d{4}-\d{2}-\d{2}-", d.name)]         if SORTIES.exists() else []
    if cle:
        dossiers = [d for d in dossiers if d.name[11:] == cle]
        if not dossiers:
            return Resultat(texte=f"Aucune publication préparée sous la clé « {cle} » "
                                  f"dans {SORTIES}.", ok=False)
    if not dossiers:
        return Resultat(texte=f"Rien à vérifier : {SORTIES} ne contient aucune publication.",
                        ok=False)

    code, lignes = _lancer_verifier()
    gardees = [l for l in lignes if not cle or cle in l or l.startswith(("REFUS", "ALERTE"))]
    refus = [l for l in gardees if l.startswith("REFUS")]
    alertes = [l for l in gardees if l.startswith("ALERTE")]

    detail: list[str] = []
    for d in dossiers:
        fiche = d / "fiche.json"
        lu = {}
        if fiche.exists():
            try:
                lu = json.loads(fiche.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                detail.append(f"✗ {d.name} : fiche.json illisible")
        lien = lu.get("lien") or ""
        if not lien:
            detail.append(f"✗ {d.name} : aucun lien vers le site")
        elif not (config.ATELIER / "candidats.json").exists():
            pass
        else:
            detail.append(f"· {d.name} : lien {lien} — seul un vrai navigateur prouve que la "
                          "page existe (verifier_liens.py) : le site répond 200 à tout.")
        for p in lu.get("photos", []):
            if not p.get("auteur") or not p.get("licence"):
                detail.append(f"✗ {d.name} : photo #{p.get('rang')} sans auteur ni licence")

    lignes_sortie = [f"Contrôle de {len(dossiers)} publication(s) dans {SORTIES.name}/",
                     f"verifier.py : {len(refus)} refus, {len(alertes)} alerte(s) "
                     f"(code de sortie {code})", ""]
    lignes_sortie += gardees[:40] + [""] + detail
    lignes_sortie.append("Les photos déjà employées par les séries de 12 h et 18 h sont "
                         "comparées : une photo, une publication.")
    return Resultat(texte="\n".join(l for l in lignes_sortie if l is not None),
                    ok=not refus and code == 0,
                    donnees={"refus": refus, "alertes": alertes, "code": code})
