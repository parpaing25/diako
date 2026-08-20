# -*- coding: utf-8 -*-
"""
LE CLIENT DEMANDE-T-IL À LA BASE DES CHOSES QUI EXISTENT ?

🔴 CE CONTRÔLE EXISTE PARCE QU'IL A TROUVÉ UN VRAI DÉFAUT. L'atlas des plats
   annonçait « 0 orthographe » au lieu de 254 : `statsAtlas()` comptait avec
   `from("dish_aliases").select("id")`, or cette table n'a pas de colonne `id` —
   sa clé est le couple (dish_id, alias). PostgREST refuse alors la requête
   ENTIÈRE, le `count` revient nul, et le compteur affiche zéro.

   Aucune erreur à l'écran. C'est toute la difficulté : une requête refusée par
   la base ne réveille personne, elle laisse juste un chiffre faux ou une liste
   vide. Le typage TypeScript ne l'attrape pas non plus, puisque `types.ts` est
   écrit à la main sur ce projet.

⚠ CE QUE CE SCRIPT VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS. Il extrait du code
  client tous les couples (table, colonne) et (fonction, argument), et produit
  DEUX requêtes SQL à passer sur la base. Il ne se connecte pas lui-même :
  l'accès à la base passe par le connecteur, et un script qui parle à la prod
  n'est pas la règle ici.

  Il ne vérifie PAS les types, ni les droits par colonne (piège 0082/0103), ni
  la sémantique. Il répond à une seule question — « ce nom existe-t-il ? » — et
  c'est déjà la question qui a coûté un compteur faux en production.

⚠ LES FAUX POSITIFS SONT ATTENDUS ET INOFFENSIFS. Les colonnes d'une jointure
  imbriquée (`profiles!posts_author_id_fkey(display_name, avatar_url)`) sont
  parfois rattachées à la mauvaise table par l'extracteur. Trois sont remontées
  au dernier passage, toutes de cette famille. Mieux vaut trois noms à écarter à
  la main qu'une colonne manquante qui passe.

USAGE :
    python scripts/verifier_contrat_client_base.py
puis passer les deux requêtes affichées sur la base, et lire les lignes rendues :
chacune est un appel client que la base refusera.
"""
import glob, io, os, re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fichiers():
    for motif in ("src/**/*.ts", "src/**/*.tsx"):
        yield from sorted(glob.glob(os.path.join(RACINE, motif), recursive=True))


def constantes():
    """Les listes de colonnes rangées dans une constante, à résoudre."""
    out = {}
    for chemin, nom in (("src/lib/decouverte.ts", "COLONNES_PLAT"),
                        ("src/lib/decouverte.ts", "COLONNES_SITE"),
                        ("src/contexts/UserDataContext.tsx", "PROFILE_COLUMNS")):
        p = os.path.join(RACINE, chemin)
        if not os.path.exists(p):
            continue
        t = io.open(p, encoding="utf-8").read()
        m = re.search(nom + r'\s*=\s*\n?\s*"([^"]*)"', t)
        if m:
            out[nom] = m.group(1)
    return out


def colonnes():
    """Les couples (table, colonne) demandés par un `.select()`."""
    const = constantes()
    paires = set()
    for f in fichiers():
        t = io.open(f, encoding="utf-8", errors="replace").read()
        for m in re.finditer(
                r'\.from\("([a-z_]+)"\)((?:[^;]|\n){0,400}?)'
                r'\.select\(\s*(?:"([^"]*)"|`([^`]*)`|([A-Z_][A-Za-z_]*))', t):
            table = m.group(1)
            cols = m.group(3) or m.group(4) or const.get(m.group(5) or "", "")
            # ⚠ On retire les jointures imbriquées : leurs colonnes appartiennent
            #   à une AUTRE table, et les rattacher ici fabriquerait de faux
            #   manques. L'extraction reste imparfaite — voir l'en-tête.
            cols = re.sub(r'[a-z_]+:[a-z_]+!?[a-z_]*\([^)]*\)', '', cols)
            for c in cols.split(","):
                c = c.strip()
                if re.fullmatch(r'[a-z_0-9]+', c):
                    paires.add((table, c))
    return sorted(paires)


def arguments():
    """Les couples (fonction, argument nommé) passés à un `.rpc()`."""
    paires = set()
    for f in fichiers():
        t = io.open(f, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r'\.rpc\(\s*"([a-z_0-9]+)"\s*(?:,\s*\{([^}]*)\})?', t, re.S):
            for a in re.findall(r'(?:^|[\s,{])\s*(p_[a-z_0-9]+)\s*:', m.group(2) or ""):
                paires.add((m.group(1), a))
    return sorted(paires)


def requete(paires, titre, corps):
    v = "values " + ", ".join("('%s','%s')" % p for p in paires)
    return f"-- {titre} ({len(paires)} couples)\nwith demande(a, b) as (\n  {v}\n)\n{corps}"


if __name__ == "__main__":
    c, a = colonnes(), arguments()
    print(requete(c, "COLONNES DEMANDÉES PAR LE CLIENT",
                  "select d.a as table_demandee, d.b as colonne_absente\n"
                  "  from demande d\n"
                  " where not exists (select 1 from information_schema.columns i\n"
                  "        where i.table_schema='public' and i.table_name=d.a\n"
                  "          and i.column_name=d.b)\n order by 1, 2;"))
    print()
    print(requete(a, "ARGUMENTS DE RPC PASSÉS PAR LE CLIENT",
                  "select d.a as fonction, d.b as argument_inconnu\n"
                  "  from demande d\n"
                  " where not exists (\n"
                  "   select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace\n"
                  "    where n.nspname='public' and p.proname=d.a\n"
                  "      and d.b = any(coalesce(p.proargnames, '{}')))\n order by 1, 2;"))
