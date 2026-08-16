import sys, io, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from regenerer_variantes import traiter
urls = json.loads(io.open("couvertures.json", encoding="utf-8").read())
f, i, r = traiter(urls)
print(f"\nTERMINE : {f} regenerees, {i} deja completes, {r} en echec", flush=True)
