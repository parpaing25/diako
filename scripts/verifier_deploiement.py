# -*- coding: utf-8 -*-
"""
LE DÉPLOIEMENT A-T-IL VRAIMENT ABOUTI ?

🔴 CE SCRIPT EXISTE PARCE QUE `redeploy.sh` A DÉJÀ MENTI. Un envoi FTP a expiré
   en cours de route ; le script a affiché « TimeoutError: timed out » PUIS
   « [diako] termine. » — et la ligne de résumé annonçait tranquillement
   « 103 fichiers envoyés ». La production servait encore le build précédent.

   Ce n'est pas une panne visible : le site continuait de fonctionner, avec
   l'ancien `index.html` pointant vers l'ancien CSS. Tout était cohérent, et
   rien de ce qu'on venait de corriger n'était en ligne. On aurait pu passer la
   journée à se demander pourquoi un correctif « déployé » ne change rien.

⚠ ET LE PIÈGE DE L'HÉBERGEUR AGGRAVE TOUT : un fichier absent ne rend PAS 404
  sur o2switch. Le `.htaccess` renvoie `index.html` avec un « 200 OK ». Demander
  le nouveau CSS rendait donc 200 — succès apparent — avec 12 478 octets de HTML.
  On ne peut pas se fier au code de statut : il faut lire le TYPE.

⚠ LE CONTRÔLE QUI COMPTE N'EST PAS « LE FICHIER EXISTE » MAIS « LA PAGE LE
  DEMANDE ». Un ancien asset peut très bien survivre sur le serveur ; ce qui
  prouve le déploiement, c'est que l'`index.html` EN LIGNE référence les
  hachages du build LOCAL.

USAGE, juste après `redeploy.sh diako` :
    python scripts/verifier_deploiement.py
"""
import glob, io, os, re, sys, urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://diako.fonenako.mg"
AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def lire(url, tete=False):
    r = urllib.request.Request(url, headers={"User-Agent": AGENT},
                               method="HEAD" if tete else "GET")
    with urllib.request.urlopen(r, timeout=60) as f:
        return f.status, f.headers.get("Content-Type", ""), (b"" if tete else f.read())


def principal():
    locaux = sorted(os.path.basename(p) for p in
                    glob.glob(os.path.join(RACINE, "dist/assets/index-*.*"))
                    if p.endswith((".js", ".css")))
    if not locaux:
        print("dist/ est vide — lance `npm run build` d'abord.")
        return 1

    print("build local :", ", ".join(locaux))
    soucis = []

    # ① Chaque asset du build est EN LIGNE, et c'est bien un asset.
    for nom in locaux:
        try:
            st, ct, _ = lire(f"{SITE}/assets/{nom}", tete=True)
        except Exception as e:
            st, ct = 0, "ERREUR " + str(e)[:40]
        # ⚠ On teste le TYPE, pas le code : un fichier absent rend 200 + text/html.
        ok = ct.startswith(("application/javascript", "text/javascript", "text/css"))
        print(f"  {'OK ' if ok else '🔴 '} {nom:34} {st} {ct}")
        if not ok:
            soucis.append(f"{nom} n'est pas en ligne (repli HTML)")

    # ② LA PAGE EN LIGNE DEMANDE-T-ELLE CES FICHIERS-LÀ ? C'est le vrai contrôle.
    try:
        _, _, html = lire(SITE + "/")
        demandes = set(re.findall(r'assets/(index-[A-Za-z0-9_-]+\.(?:js|css))',
                                  html.decode("utf-8", "replace")))
    except Exception as e:
        print("  🔴 la page d'accueil n'a pas pu être lue :", str(e)[:60])
        return 1

    manquants = set(locaux) - demandes
    print("\n  la page en ligne charge :", ", ".join(sorted(demandes)) or "(rien)")
    if manquants:
        soucis.append("l'index.html en ligne ne référence pas : " + ", ".join(sorted(manquants)))

    print()
    if soucis:
        print("🔴 LE DÉPLOIEMENT N'A PAS ABOUTI :")
        for s in soucis:
            print("   -", s)
        print("   → relancer `bash ~/.deploy-sites/redeploy.sh diako`")
        return 1
    print("OK — la production sert bien le build local.")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
