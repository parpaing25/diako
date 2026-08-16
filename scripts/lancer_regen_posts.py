# -*- coding: utf-8 -*-
"""Régénère les trois tailles des photos du FIL (uploads/posts/…).

🔴 CES PHOTOS DATENT D'AVANT LES TROIS TAILLES : leur `.w960.webp` répond du
   HTML. Le srcset du fil promet cette variante, le navigateur la casse, et il
   ne reste que la vignette floue — c'est le « ça charge très longtemps » vu
   sur le fil. Même recette que pour les couvertures : on relit l'original et
   on le re-POSTe sous le même chemin, o2upload.php refait les variantes.
"""
import io, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from regenerer_variantes import traiter

A = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ"
r = urllib.request.Request(
    "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1/posts?select=media&status=eq.published&limit=200",
    headers={"apikey": A, "Authorization": "Bearer " + A})
posts = json.loads(urllib.request.urlopen(r, timeout=120).read().decode())
urls = []
for p in posts:
    for m in (p.get("media") or []):
        u = m.get("url") if isinstance(m, dict) else None
        if u and "/uploads/" in u:
            urls.append(u)
urls = sorted(set(urls))
print(f"{len(urls)} photos de fil a verifier", flush=True)
f, i, e = traiter(urls)
print(f"\nTERMINE : {f} regenerees, {i} deja completes, {e} en echec", flush=True)
