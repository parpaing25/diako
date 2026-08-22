"""Publication d'une trouvaille vers Diako.

Chaîne : redimension 1600 px q86 -> envoi o2switch (pacing 3 s) -> écriture SQL
via l'API Management. Les photos ne vont JAMAIS sur Supabase Storage : c'est ce
seul point qui fait la différence entre ~70 Ko et ~1,2 Mo d'egress par visite.

QUATRE DESTINATIONS, selon le genre de la trouvaille :

  · établissement rattaché  -> UPDATE public.pages **sans jamais écraser**
  · établissement nouveau   -> INSERT public.pages (+ équipements, + carte)
  · carte                   -> INSERT public.menu_sections / menu_items / menu_photos
  · événement               -> INSERT public.events
  · récit                   -> INSERT public.posts (compte Diako) + post_mentions

🔴 LA RÈGLE QUI GOUVERNE TOUT : ON N'ÉCRASE PAS. Les 3 356 fiches viennent
   d'imports (OSM, office du tourisme, Wikivoyage) ; certaines portent déjà un
   téléphone ou une description soignée. Une écriture de bot qui remplace une
   donnée humaine est une perte silencieuse. Toutes les colonnes passent donc
   par `coalesce(existant, nouveau)` — le bot ne remplit que les trous.
"""
from __future__ import annotations

import io
import json
import re
import subprocess
import tempfile
import time
import unicodedata
import uuid
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

from . import base as bdd
from . import diako, redaction
from .config import (
    API_UPLOAD,
    AUTEUR_DIAKO,
    DOSSIER_TROUVAILLES,
    SITE,
    charger,
    cle_upload,
)

BOCAL = Path(tempfile.gettempdir()) / "o2s-diako-bot.jar"


class ErreurPublication(Exception):
    pass


# ── Photos ──────────────────────────────────────────────────────────────────
def _preparer(chemin: Path, cfg: dict) -> tuple[bytes, tuple[int, int]]:
    """Redimensionne et compresse. Le serveur fabrique ensuite 480/960/1600."""
    with Image.open(chemin) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        cote_max = int(cfg.get("cote_photo_max", 1600))
        if max(img.size) > cote_max:
            img.thumbnail((cote_max, cote_max), Image.LANCZOS)
        tampon = io.BytesIO()
        img.save(tampon, "JPEG", quality=int(cfg.get("qualite_photo", 86)),
                 optimize=True, progressive=True)
        return tampon.getvalue(), img.size


def _envoyer(octets: bytes, dossier_distant: str, nom_distant: str, cle: str) -> dict:
    """Envoi multipart. Le serveur rend l'URL publique et ses variantes.

    🔴 POURQUOI CURL ET PAS `requests`. o2switch place « Tiger Protect » devant
       le site : le premier POST reçoit un 307 assorti d'un cookie `o2s-chl`, et
       seule la requête qui rejoue ce cookie atteint PHP. Sans bocal à cookies,
       on obtient un 406 ou une réponse vide — jamais une erreur qui nomme la
       cause. (Leçon de scripts/photos_archives.py.)

    ⚠ PAS DE `--post307` : cette option n'existe pas, curl la refuse et rend une
      sortie VIDE — un échec muet difficile à distinguer d'un serveur muet.
    """
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as fichier:
        fichier.write(octets)
        temporaire = fichier.name
    try:
        processus = subprocess.run(
            ["curl", "-s", "-S", "-L", "--post301", "--post302", "--post303",
             "-c", str(BOCAL), "-b", str(BOCAL), "--max-time", "180",
             "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
             "-H", "X-API-Key: " + cle,
             "-F", "folder=" + dossier_distant,
             "-F", "filename=" + nom_distant,
             "-F", "file=@" + temporaire.replace("\\", "/") + ";type=image/jpeg",
             API_UPLOAD],
            capture_output=True, timeout=300,
        )
        sortie = processus.stdout.decode("utf-8", "replace").strip()
        if not sortie.startswith("{"):
            raise ErreurPublication(
                f"Envoi refusé ({nom_distant}) — curl {processus.returncode} : "
                f"{processus.stderr.decode('utf-8', 'replace').strip()[:200]} | {sortie[:200]}"
            )
        reponse = json.loads(sortie)
        if not reponse.get("success") or not reponse.get("url"):
            raise ErreurPublication(
                f"Envoi refusé ({nom_distant}) : {reponse.get('error', 'échec inconnu')}"
            )
        return reponse
    finally:
        try:
            Path(temporaire).unlink()
        except OSError:
            pass


def _slug(texte: str, longueur: int = 60) -> str:
    """Identifiant d'URL. Le serveur d'envoi refuse tout hors [A-Za-z0-9._/-]."""
    sans = "".join(
        c for c in unicodedata.normalize("NFD", texte or "")
        if unicodedata.category(c) != "Mn"
    )
    propre = re.sub(r"[^a-zA-Z0-9]+", "-", sans).strip("-").lower()
    return (propre or "sans-nom")[:longueur].strip("-")


def envoyer_photos(t: dict, dossier_distant: str, prefixe: str,
                   rappel=None, seulement_la_carte: bool = False) -> list[dict]:
    """Envoie les photos gardées et rend [{url, w, h}].

    ⚠ LE JOURNAL EST RÉÉCRIT APRÈS CHAQUE PHOTO. Une coupure au milieu d'un lot
      ne doit pas tout faire recommencer — ni, surtout, créer des doublons de
      fichiers sur le serveur.
    """
    cfg = charger()
    cle = cle_upload()
    dossier = DOSSIER_TROUVAILLES.parent / t["dossier"]
    journal = dossier / "_photos_envoyees.json"
    deja: dict = json.loads(journal.read_text(encoding="utf-8")) if journal.exists() else {}

    photos = bdd.photos_a_publier(t["id"])
    # ⚠ PAS DE REPLI SUR « toutes les photos » quand aucune n'est libre. Une
    #   fiche dont la seule image est la photo d'une carte papier ne doit PAS
    #   prendre cette carte en couverture : mieux vaut une fiche sans photo
    #   qu'une fiche illustrée par un menu illisible en vignette.
    if seulement_la_carte:
        photos = [p for p in photos if p.get("est_la_carte")]
    else:
        photos = [p for p in photos if not p.get("est_la_carte")]
    if not photos:
        return []

    envoyees: list[dict] = []
    for rang, photo in enumerate(photos, start=1):
        nom_distant = f"{prefixe}/{rang:02d}.jpg"
        if nom_distant in deja:
            envoyees.append(deja[nom_distant])
            continue
        source = dossier / photo["fichier"]
        if not source.exists():
            bdd.logguer(f"Photo introuvable sur le disque : {source.name}", "avert")
            continue
        octets, taille = _preparer(source, cfg)
        reponse = _envoyer(octets, dossier_distant, nom_distant, cle)
        media = {"url": reponse["url"], "w": taille[0], "h": taille[1]}
        envoyees.append(media)
        deja[nom_distant] = media
        journal.write_text(json.dumps(deja, ensure_ascii=False, indent=2), encoding="utf-8")
        bdd.modifier_photo(photo["id"], url_o2=reponse["url"])
        if rappel:
            rappel(rang, len(photos))
        time.sleep(float(cfg["pause_entre_envois_photos"]))
    return envoyees


# ── Écriture SQL ────────────────────────────────────────────────────────────
def _txt(valeur) -> str:
    if valeur is None or valeur == "":
        return "NULL"
    return "'" + str(valeur).replace("'", "''") + "'"


def _num(valeur) -> str:
    if valeur in (None, ""):
        return "NULL"
    return str(int(valeur))


def _bool(valeur) -> str:
    return "true" if valeur else "false"


def _tableau(valeurs: list[str], type_sql: str = "text") -> str:
    if not valeurs:
        return f"'{{}}'::{type_sql}[]"
    dedans = ", ".join("'" + str(v).replace("'", "''") + "'" for v in valeurs)
    return f"ARRAY[{dedans}]::{type_sql}[]"


def _jsonb(valeur) -> str:
    return "'" + json.dumps(valeur, ensure_ascii=False).replace("'", "''") + "'::jsonb"


# 🔴 LES TROIS TABLES N'ACCEPTENT PAS LES MÊMES UNITÉS, et la contrainte ne
#    pardonne pas : `posts.price_unit` refuse « plat » (il veut « portion »),
#    `menu_items.price_unit` refuse « personne ». Découvert en jouant les
#    INSERT dans une transaction annulée avant la première publication — c'est
#    exactement à ça que sert cet essai à blanc.
UNITES_POST = {
    "nuit": "nuit", "plat": "portion", "portion": "portion", "personne": "personne",
    "jour": "jour", "chambre": "chambre", "circuit": "personne", "entree": "entree",
    "groupe": "groupe", "vehicule": "vehicule", "trajet": "trajet",
}
UNITES_CARTE = {"portion", "2_personnes", "kg", "part", "verre"}


def _unite_post(unite: str | None) -> str | None:
    return UNITES_POST.get((unite or "").strip().lower())


def _unite_carte(unite: str | None) -> str:
    propre = (unite or "").strip().lower()
    return propre if propre in UNITES_CARTE else "portion"


def _slug_libre(table: str, propose: str) -> str:
    """Un slug qui n'existe pas encore. Deux « Chez Mariette » sont fréquents."""
    propose = propose or "fiche"
    lignes = diako.executer_sql(
        f"SELECT slug FROM public.{table} WHERE slug = {_txt(propose)} "
        f"OR slug LIKE {_txt(propose + '-%')}"
    )
    pris = {l["slug"] for l in lignes}
    if propose not in pris:
        return propose
    for suffixe in range(2, 60):
        candidat = f"{propose}-{suffixe}"
        if candidat not in pris:
            return candidat
    return f"{propose}-{uuid.uuid4().hex[:6]}"


# ── Fiche d'établissement ───────────────────────────────────────────────────
def _sql_creer_page(t: dict, page_id: str, slug: str, medias: list[dict]) -> str:
    couverture = medias[0]["url"] if medias else None
    galerie = [m["url"] for m in medias[1:]]
    colonnes = {
        "id": f"{_txt(page_id)}::uuid",
        "slug": _txt(slug),
        "name": _txt(t.get("nom_etab")),
        "categories": _tableau(t.get("categories") or []),
        "short_desc": _txt((t.get("resume") or "")[:280]),
        "long_desc": _txt(t.get("presentation")),
        "place_id": f"{_txt(t.get('lieu_id'))}::uuid" if t.get("lieu_id") else "NULL",
        "address": _txt(t.get("adresse")),
        "landmark": _txt(t.get("repere")),
        "phone": _txt(t.get("telephone")),
        "whatsapp": _txt(t.get("whatsapp")),
        "email": _txt(t.get("email")),
        "website": _txt(t.get("site_web")),
        "facebook": _txt(t.get("page_facebook")),
        "cover_url": _txt(couverture),
        "gallery": _jsonb(galerie),
        "source": _txt(redaction.source_pour_base(t)),
        "is_published": _bool(charger().get("publier_directement", True)),
    }
    return (
        f"INSERT INTO public.pages ({', '.join(colonnes)}) "
        f"VALUES ({', '.join(colonnes.values())});"
    )


def _sql_completer_page(t: dict, page_id: str, medias: list[dict]) -> str:
    """UPDATE qui ne remplit QUE les trous.

    ⚠ Chaque colonne passe par `coalesce` ou par une condition explicite. Sans
      ça, une fiche renseignée par l'office du tourisme d'Ampefy serait écrasée
      par une lecture de publication Facebook.
    """
    couverture = medias[0]["url"] if medias else None
    galerie = [m["url"] for m in medias[1:]] if medias else []
    source = redaction.source_pour_base(t)

    # 🔴 UNE COLONNE DONT ON N'A RIEN À DIRE N'ENTRE PAS DANS LE `SET`.
    #    `coalesce(phone, NULL)` est inoffensif, mais
    #    `short_desc = CASE WHEN length(short_desc) < 20 THEN NULL ELSE … END`
    #    EFFACERAIT une description de quinze caractères posée à la main. Le
    #    « on n'écrase pas » se joue ici, pas dans le commentaire.
    morceaux = []
    for colonne, valeur in (
        ("phone", t.get("telephone")),
        ("whatsapp", t.get("whatsapp")),
        ("email", t.get("email")),
        ("website", t.get("site_web")),
        ("facebook", t.get("page_facebook")),
        ("address", t.get("adresse")),
        ("landmark", t.get("repere")),
    ):
        if valeur:
            morceaux.append(f"{colonne} = coalesce({colonne}, {_txt(valeur)})")

    if t.get("lieu_id"):
        morceaux.append(f"place_id = coalesce(place_id, {_txt(t['lieu_id'])}::uuid)")

    # Une description de moins de 20 caractères ne compte pas comme remplie
    # (c'est le seuil du barème de complétude, migration 0040).
    if (t.get("resume") or "").strip():
        morceaux.append(
            f"short_desc = CASE WHEN coalesce(length(short_desc), 0) < 20 "
            f"THEN {_txt(t['resume'][:280])} ELSE short_desc END"
        )
    if (t.get("presentation") or "").strip():
        morceaux.append(
            f"long_desc = CASE WHEN coalesce(length(long_desc), 0) < 80 "
            f"THEN {_txt(t['presentation'])} ELSE long_desc END"
        )

    # `source` s'ajoute, elle ne remplace pas : la provenance d'origine reste.
    morceaux.append(
        f"source = CASE WHEN source IS NULL THEN {_txt(source)} "
        f"WHEN position('Facebook' in source) > 0 THEN source "
        f"ELSE source || ' · ' || {_txt(source)} END"
    )
    if couverture:
        morceaux.append(f"cover_url = coalesce(cover_url, {_txt(couverture)})")
    if galerie:
        # La galerie s'allonge, sans jamais reprendre une URL déjà présente.
        morceaux.append(
            f"gallery = gallery || (SELECT coalesce(jsonb_agg(u), '[]'::jsonb) "
            f"FROM jsonb_array_elements({_jsonb(galerie)}) u "
            f"WHERE NOT (gallery @> jsonb_build_array(u)))"
        )
    if t.get("categories"):
        # Les catégories s'ajoutent : un hôtel qui se révèle aussi restaurant
        # doit apparaître dans les deux recherches.
        morceaux.append(
            f"categories = ARRAY(SELECT DISTINCT unnest(categories || "
            f"{_tableau(t['categories'])}))"
        )
    return f"UPDATE public.pages SET {', '.join(morceaux)} WHERE id = {_txt(page_id)}::uuid;"


def _sql_equipements(page_id: str, codes: list[str]) -> str:
    """Les équipements reconnus, filtrés par la table `amenities`.

    ⚠ Un code inventé serait refusé par la clé étrangère et ferait échouer TOUTE
      la transaction : on ne pose que ceux qui existent réellement.
    """
    if not codes:
        return ""
    return (
        f"INSERT INTO public.page_amenities (page_id, code) "
        f"SELECT {_txt(page_id)}::uuid, c FROM unnest({_tableau(codes)}) c "
        f"WHERE EXISTS (SELECT 1 FROM public.amenities a WHERE a.code = c) "
        f"ON CONFLICT DO NOTHING;"
    )


def _sql_carte(page_id: str, lignes: list[dict], releve_le: str) -> str:
    """Les lignes de carte, rangées sous leurs sections.

    ⚠ `releve_le` n'est pas décoratif : sur Diako, un prix sans date de relevé
      est un prix qui ment dès qu'il vieillit. La colonne existe pour ça.
    """
    if not lignes:
        return ""
    sections = []
    for ligne in lignes:
        nom = (ligne.get("section") or "").strip()
        if nom and nom not in sections:
            sections.append(nom)

    corps = [f"  v_page uuid := {_txt(page_id)}::uuid;", "  v_sec uuid;"]
    instructions = []
    for rang, section in enumerate(sections, start=1):
        instructions.append(
            f"  SELECT id INTO v_sec FROM public.menu_sections "
            f"WHERE page_id = v_page AND name = {_txt(section)} LIMIT 1;\n"
            f"  IF v_sec IS NULL THEN\n"
            f"    INSERT INTO public.menu_sections (page_id, name, sort_order) "
            f"VALUES (v_page, {_txt(section)}, {rang}) RETURNING id INTO v_sec;\n"
            f"  END IF;"
        )
        for ordre, ligne in enumerate(
            [l for l in lignes if (l.get("section") or "").strip() == section], start=1
        ):
            instructions.append(_insert_plat(ligne, "v_sec", ordre, releve_le))

    sans_section = [l for l in lignes if not (l.get("section") or "").strip()]
    for ordre, ligne in enumerate(sans_section, start=1):
        instructions.append(_insert_plat(ligne, "NULL", ordre, releve_le))

    return ("DO $$\nDECLARE\n" + "\n".join(corps) + "\nBEGIN\n"
            + "\n".join(instructions) + "\nEND $$;")


def _insert_plat(ligne: dict, section_sql: str, ordre: int, releve_le: str) -> str:
    return (
        f"  INSERT INTO public.menu_items (page_id, section_id, name, dish_id, "
        f"description, price_ar, price_unit, releve_le, sort_order) VALUES "
        f"(v_page, {section_sql}, {_txt(ligne['nom'])}, "
        f"{(_txt(ligne['plat_id']) + '::uuid') if ligne.get('plat_id') else 'NULL'}, "
        f"{_txt(ligne.get('description'))}, {_num(ligne.get('prix_ar'))}, "
        f"{_txt(_unite_carte(ligne.get('unite')))}, {_txt(releve_le)}::date, {ordre});"
    )


def _sql_photos_de_carte(page_id: str, medias: list[dict]) -> str:
    """La carte photographiée, gardée telle quelle.

    Mode dégradé indispensable et assumé par le schéma : photographier une carte
    prend trente secondes, la saisir prend une soirée. Les deux coexistent.
    """
    if not medias:
        return ""
    valeurs = ", ".join(
        f"({_txt(page_id)}::uuid, {_txt(m['url'])}, {rang})"
        for rang, m in enumerate(medias, start=1)
    )
    return f"INSERT INTO public.menu_photos (page_id, url, sort_order) VALUES {valeurs};"


# ── Événement ───────────────────────────────────────────────────────────────
def _sql_evenement(t: dict, evt_id: str, slug: str, medias: list[dict]) -> str:
    debut = t.get("evt_debut")
    mois = []
    if debut:
        try:
            mois = [int(debut[5:7])]
        except ValueError:
            mois = []
    colonnes = {
        "id": f"{_txt(evt_id)}::uuid",
        "slug": _txt(slug),
        "title": _txt(t.get("titre")),
        "kind": _txt(t.get("evt_genre") or "culturel"),
        "place_id": f"{_txt(t.get('lieu_id'))}::uuid" if t.get("lieu_id") else "NULL",
        "page_id": f"{_txt(t.get('page_id'))}::uuid" if t.get("page_id") else "NULL",
        "starts_on": f"{_txt(debut)}::date",
        "ends_on": f"{_txt(t.get('evt_fin'))}::date" if t.get("evt_fin") else "NULL",
        "yearly": _bool(t.get("evt_recurrent")),
        "recurrent": _bool(t.get("evt_recurrent")),
        "mois": _tableau([str(m) for m in mois], "smallint"),
        "summary": _txt(redaction.resume_evenement(t)),
        "description": _txt(redaction.nettoyer(t.get("texte") or "")[:3000]),
        "poster_url": _txt(medias[0]["url"] if medias else None),
        "poster_credit": _txt((t.get("auteur") or t.get("source_nom") or "")[:200]),
        "poster_licence": _txt("Publication Facebook — reprise avec attribution"),
        "poster_source": _txt(t.get("permalien")),
        "price_ar": _num(t.get("prix_ar")),
        "price_unit": _txt(t.get("prix_unite") or ("personne" if t.get("prix_ar") else None)),
        "organizer": _txt(t.get("organisateur")),
        "lieu_libre": _txt(t.get("lieu_texte")),
        "source": _txt(redaction.source_pour_base(t)),
        # ⚠ « incertaine » par défaut : une date lue sur Facebook n'a pas la
        #   valeur d'un calendrier officiel, et le site affiche cette nuance.
        "confiance": _txt("certaine" if t.get("evt_fin") or t.get("evt_debut")
                          else "incertaine"),
        "is_published": _bool(charger().get("publier_directement", True)),
    }
    return (
        f"INSERT INTO public.events ({', '.join(colonnes)}) "
        f"VALUES ({', '.join(colonnes.values())});"
    )


# ── Récit ───────────────────────────────────────────────────────────────────
def _sql_recit(t: dict, post_id: str, medias: list[dict]) -> str:
    # ⚠ LE PRIX NE VOYAGE JAMAIS SEUL, et la base l'impose (contrainte
    #   `posts_prix_complet`). Un montant dont on n'a pas su lire l'unité n'est
    #   pas publiable : on le laisse tomber plutôt que d'inventer « par
    #   personne ». Le montant reste visible dans le bot, pour reprise à la main.
    unite = _unite_post(t.get("prix_unite"))
    montant = t.get("prix_ar") if unite else None
    if t.get("prix_ar") and not unite:
        bdd.logguer(
            f"Prix de {t['prix_ar']} Ar non publié : unité inconnue. Le récit part "
            "sans prix — complétez l'unité et republiez si besoin.", "avert",
        )

    colonnes = {
        "id": f"{_txt(post_id)}::uuid",
        "author_id": f"{_txt(AUTEUR_DIAKO)}::uuid",
        "kind": _txt(t.get("post_genre") or "recit"),
        "body": _txt(t.get("corps")),
        "media": _jsonb([{"url": m["url"], "w": m["w"], "h": m["h"]} for m in medias]),
        # Les trois tags de Diako : lieu · établissement · plat.
        "place": _txt(t.get("lieu_nom") or t.get("lieu_texte")),
        "place_id": f"{_txt(t.get('lieu_id'))}::uuid" if t.get("lieu_id") else "NULL",
        "dish": _txt(t.get("plat_nom")),
        "dish_id": f"{_txt(t.get('plat_id'))}::uuid" if t.get("plat_id") else "NULL",
        "page_name": _txt(t.get("page_nom") or t.get("nom_etab")),
        # Le prix ne voyage jamais seul : montant + unité + date de relevé.
        "price_ar": _num(montant),
        "price_unit": _txt(unite),
        "price_on": f"{_txt(t.get('prix_vu_le'))}::date"
        if (t.get("prix_vu_le") and montant) else "NULL",
        "status": _txt("published"),
        "visibilite": _txt("public"),
    }
    sql = (
        f"INSERT INTO public.posts ({', '.join(colonnes)}) "
        f"VALUES ({', '.join(colonnes.values())});"
    )
    if t.get("page_id"):
        sql += (
            f"\nINSERT INTO public.post_mentions (post_id, page_id) VALUES "
            f"({_txt(post_id)}::uuid, {_txt(t['page_id'])}::uuid) ON CONFLICT DO NOTHING;"
        )
    return sql


# ── Orchestration ───────────────────────────────────────────────────────────
EXIGENCES = {
    "carte": (("page_id", "fiche d'établissement"),),
    "evenement": (("titre", "titre"), ("evt_debut", "date de début")),
    "recit": (("corps", "texte du récit"),),
}


def manque_pour_publier(t: dict) -> list[str]:
    """Ce qui bloque, exprimé comme l'interface l'affiche — avant le clic.

    ⚠ LES EXIGENCES DIFFÈRENT SELON QU'ON CRÉE OU QU'ON COMPLÈTE. Créer une
      fiche sans lieu la rend introuvable : c'est bloquant. Compléter une fiche
      existante avec une photo, alors que son lieu est déjà posé en base, ne
      l'est pas — l'exiger empêcherait le geste le plus utile du bot.
    """
    genre = t.get("genre") or "recit"
    manques = [
        libelle for champ, libelle in EXIGENCES.get(genre, ()) if not t.get(champ)
    ]
    if genre == "etablissement" and not t.get("page_id"):
        if not t.get("nom_etab"):
            manques.append("nom de l'établissement")
        if not t.get("lieu_id"):
            manques.append("lieu du référentiel")
    if genre == "carte" and not bdd.lignes_a_publier(t["id"]):
        manques.append("au moins un plat")
    if genre == "recit" and not bdd.photos_a_publier(t["id"]):
        manques.append("au moins une photo")
    return manques


def publier(tid: str, rappel=None) -> dict:
    """Publie une trouvaille de bout en bout. Renvoie {table, id, lien}."""
    cfg = charger()
    t = bdd.trouvaille(tid)
    if not t:
        raise ErreurPublication("Trouvaille introuvable.")
    if t.get("cible_id"):
        raise ErreurPublication(f"Déjà publiée : {t.get('lien_diako')}")

    manques = manque_pour_publier(t)
    if manques:
        raise ErreurPublication("À compléter avant publication : " + ", ".join(manques))

    genre = t["genre"]
    if genre in ("etablissement", "carte"):
        resultat = _publier_etablissement(t, cfg, rappel)
    elif genre == "evenement":
        resultat = _publier_evenement(t, rappel)
    elif genre == "recit":
        resultat = _publier_recit(t, rappel)
    else:
        raise ErreurPublication(f"Genre inconnu : {genre}")

    bdd.modifier(tid, {
        "statut": "publiee",
        "cible_table": resultat["table"],
        "cible_id": resultat["id"],
        "lien_diako": resultat["lien"],
        "publie_a": bdd.maintenant(),
    })
    diako.oublier_cache()
    bdd.logguer(f"Publiée sur Diako : {resultat['lien']}", "succes")
    return resultat


def _publier_etablissement(t: dict, cfg: dict, rappel) -> dict:
    nouvelle = not t.get("page_id")
    page_id = t.get("page_id") or str(uuid.uuid4())
    if nouvelle:
        propose = _slug(f"{t.get('nom_etab')} {t.get('lieu_nom') or ''}".strip())
        slug = _slug_libre("pages", propose)
    else:
        # Le slug de la fiche visée est déjà dans le cache du référentiel : il
        # sert à ranger les photos sous un chemin lisible plutôt que sous un
        # morceau d'uuid.
        connues = [f for f in bdd.referentiel("ref_pages") if f["id"] == page_id]
        slug = (connues[0].get("slug") if connues else None) or page_id[:8]
    prefixe = _slug(slug)

    bdd.logguer(f"Publication de « {t.get('nom_etab') or t.get('titre')} » — photos…", "info")
    medias = envoyer_photos(t, "pages", f"fiches/{prefixe}", rappel)
    photos_carte = envoyer_photos(t, "pages", f"cartes/{prefixe}", rappel,
                                  seulement_la_carte=True)

    lignes = bdd.lignes_a_publier(t["id"])
    if not nouvelle and lignes:
        # Une carte se complète, elle ne se duplique pas : ce qui est déjà saisi
        # sur la fiche est retiré du lot.
        deja = diako.carte_deja_la(page_id, [l["nom"] for l in lignes])
        if deja:
            bdd.logguer(
                f"{len(deja)} plat(s) déjà présent(s) sur la fiche — non réinsérés.", "info"
            )
        lignes = [l for l in lignes if l["nom"] not in deja]

    releve_le = t.get("prix_vu_le") or t.get("date_post") or date.today().isoformat()
    requetes = [
        _sql_creer_page(t, page_id, slug, medias) if nouvelle
        else _sql_completer_page(t, page_id, medias),
        _sql_equipements(page_id, t.get("equipements") or []),
        _sql_carte(page_id, lignes, releve_le),
        _sql_photos_de_carte(page_id, photos_carte),
    ]
    diako.executer_sql("\n".join(r for r in requetes if r))

    if nouvelle:
        lien = f"{SITE}/pro/{slug}"
    else:
        lignes_slug = diako.executer_sql(
            f"SELECT slug FROM public.pages WHERE id = {_txt(page_id)}::uuid"
        )
        slug = lignes_slug[0]["slug"] if lignes_slug else page_id
        lien = f"{SITE}/pro/{slug}"

    bdd.logguer(
        ("Fiche créée" if nouvelle else "Fiche complétée")
        + f" : {len(medias)} photo(s), {len(lignes)} plat(s).",
        "succes",
    )
    return {"table": "pages", "id": page_id, "lien": lien,
            "photos": len(medias), "plats": len(lignes)}


def _publier_evenement(t: dict, rappel) -> dict:
    evt_id = str(uuid.uuid4())
    slug = _slug_libre("events", _slug(f"{t.get('titre')} {t.get('evt_debut') or ''}"))
    medias = envoyer_photos(t, "pages", f"evenements/{_slug(slug)}", rappel)
    diako.executer_sql(_sql_evenement(t, evt_id, slug, medias))
    return {"table": "events", "id": evt_id, "lien": f"{SITE}/evenements",
            "photos": len(medias)}


def _publier_recit(t: dict, rappel) -> dict:
    post_id = str(uuid.uuid4())
    horodatage = int(time.time())
    medias = envoyer_photos(t, "posts", f"{AUTEUR_DIAKO}/{horodatage}", rappel)
    if not medias:
        raise ErreurPublication("Aucune photo n'a pu être envoyée — récit non publié.")
    diako.executer_sql(_sql_recit(t, post_id, medias))
    return {"table": "posts", "id": post_id, "lien": f"{SITE}/post/{post_id}",
            "photos": len(medias)}


# ── Vérification ────────────────────────────────────────────────────────────
def verifier(table: str, identifiant: str) -> dict:
    """Relit la ligne écrite. Une publication non vérifiée n'est pas une publication.

    ⚠ `redeploy.sh` a déjà menti sur ce projet : un script qui annonce « fait »
      sans relire n'apprend rien. Ici on relit, et on rend ce qu'on a vu.
    """
    if table == "pages":
        lignes = diako.executer_sql(
            f"SELECT is_published, cover_url IS NOT NULL AS a_photo, "
            f"jsonb_array_length(gallery) AS galerie, completeness, "
            f"(SELECT count(*) FROM public.menu_items m WHERE m.page_id = p.id) AS carte "
            f"FROM public.pages p WHERE id = {_txt(identifiant)}::uuid"
        )
    elif table == "events":
        lignes = diako.executer_sql(
            f"SELECT is_published, poster_url IS NOT NULL AS a_photo, starts_on::text "
            f"FROM public.events WHERE id = {_txt(identifiant)}::uuid"
        )
    else:
        lignes = diako.executer_sql(
            f"SELECT status, visibilite, jsonb_array_length(media) AS photos "
            f"FROM public.posts WHERE id = {_txt(identifiant)}::uuid"
        )
    if not lignes:
        return {"trouve": False}
    return {"trouve": True, **lignes[0]}
