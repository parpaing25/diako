# -*- coding: utf-8 -*-
"""
REGÉNÉRER LES TROIS TAILLES DES PHOTOS POSÉES AVANT LE CHANGEMENT.

Les 187 couvertures importées depuis Wikimedia l'ont été quand `o2upload.php`
ne fabriquait qu'UNE vignette, à 480 px. Depuis, il en fabrique trois — mais
seulement à l'envoi : rien ne repasse sur l'existant.

🔴 ET UNE VARIANTE ABSENTE NE REND PAS 404. Le `.htaccess` du site renvoie
   toute URL inconnue vers `index.html` : `pic-boby.w960.webp` répond donc
   « 200 OK, text/html, 13 287 octets ». Un `srcset` qui annonce `960w` fait
   alors télécharger la page d'accueil À LA PLACE DE LA PHOTO, et le navigateur
   affiche une image cassée — sur les grands écrans uniquement, puisque ce sont
   eux qui choisissent la grande taille. Un 404 franc aurait au moins fait
   retomber le navigateur sur `src`.

⚠ LA MÉTHODE : AUCUN CODE SERVEUR. On relit l'original, on le renvoie sous le
  MÊME chemin, et `o2upload.php` refait les trois variantes de lui-même. Pas de
  script à téléverser, pas de droit d'exécution à accorder, rien à nettoyer.

⚠ AU PASSAGE, LES ORIGINAUX MAIGRISSENT. Certains pèsent plus d'un mégaoctet
  pour une largeur que plus aucun écran visé n'exploite. On les réencode à
  1600 px — la limite déjà retenue par le serveur pour sa plus grande variante.
"""
import io, json, os, subprocess, sys, tempfile, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photos_archives import CLE, HOTE, BOCAL, COTE_MAX, QUALITE
from PIL import Image, ImageOps

AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def lire(url):
    r = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(r, timeout=120) as f:
        return f.read(), f.headers.get("Content-Type", "")


def variante_manquante(url):
    """Vrai quand la 960 n'est pas une image. On teste le CONTENU, pas le code :
    ici le code est 200 même quand le fichier n'existe pas."""
    v = url.rsplit(".", 1)[0] + ".w960.webp"
    try:
        _, ct = lire(v)
        return not ct.startswith("image/")
    except Exception:
        return True


def renvoyer(octets, chemin_relatif):
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as t:
        t.write(octets)
        tmp = t.name
    try:
        p = subprocess.run(
            ["curl", "-s", "-S", "-L", "--post301", "--post302", "--post303",
             "-c", BOCAL, "-b", BOCAL, "--max-time", "180", "-A", AGENT,
             "-H", "X-API-Key: " + CLE, "-F", "folder=pages",
             "-F", "filename=" + chemin_relatif,
             "-F", "file=@" + tmp.replace("\\", "/") + ";type=image/jpeg", HOTE],
            capture_output=True, timeout=300)
        s = p.stdout.decode("utf-8", "replace").strip()
        if not s.startswith("{"):
            raise RuntimeError("curl %d : %s" % (p.returncode, s[:150]))
        r = json.loads(s)
        if not r.get("success"):
            raise RuntimeError(r.get("error", "?"))
        return r
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def traiter(urls):
    faits = ignores = rates = 0
    for i, url in enumerate(urls, 1):
        rel = url.split("/uploads/pages/", 1)[1]
        try:
            if not variante_manquante(url):
                ignores += 1
                continue
            brut, _ = lire(url)
            with Image.open(io.BytesIO(brut)) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                avant = im.size
                if max(im.size) > COTE_MAX:
                    im.thumbnail((COTE_MAX, COTE_MAX), Image.LANCZOS)
                buf = io.BytesIO()
                im.save(buf, "JPEG", quality=QUALITE, optimize=True, progressive=True)
            renvoyer(buf.getvalue(), rel)
            faits += 1
            print(f"  {i:3}/{len(urls)} {rel[:52]:54} {avant[0]}x{avant[1]} "
                  f"{len(brut)//1024} Ko -> {buf.tell()//1024} Ko", flush=True)
        except Exception as e:
            rates += 1
            print(f"  {i:3}/{len(urls)} ECHEC {rel[:44]} : {str(e)[:90]}", flush=True)
    return faits, ignores, rates
