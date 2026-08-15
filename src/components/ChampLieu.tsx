import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin, PenLine, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * CHOISIR UN LIEU PARMI 22 705 — ET POUVOIR EN ÉCRIRE UN QUI N'Y EST PAS.
 *
 * 🔴 CE QUE ÇA REMPLACE. Une liste déroulante native chargée de 200 entrées sur
 *    22 705. Elle était inutilisable pour deux raisons distinctes :
 *
 *    ① Les toponymes malgaches se répètent massivement — 102 villages
 *      s'appellent « Ambodimanga » rien qu'en Vatovavy. La liste affichait
 *      trois fois « Ambalavao — Haute Matsiatra » sans rien pour les
 *      distinguer : choisir revenait à tirer au sort.
 *    ② Ce qui n'était pas dans les 200 premières entrées n'existait pas. Un
 *      voyageur revenant d'un hameau ne pouvait tout simplement pas le nommer.
 *
 * ⚠ LA SAISIE LIBRE EST UN CHEMIN DE PREMIÈRE CLASSE, pas un repli honteux.
 *   Un référentiel de lieux n'est jamais complet, et un formulaire qui refuse
 *   un nom que la personne CONNAÎT la fait renoncer à publier. Le texte libre
 *   est enregistré dans `place` ; `place_id` reste nul, et la publication
 *   remonte quand même dans la recherche par son nom.
 *
 * ⚠ ON DIT CE QUE ÇA COÛTE. Un lieu du référentiel rattache la publication à sa
 *   page de destination ; un lieu écrit à la main ne le peut pas. La différence
 *   est annoncée à l'écran plutôt que subie après coup.
 *
 * ⚠ LE CLAVIER SEUL SUFFIT. Flèches pour parcourir, Entrée pour choisir,
 *   Échap pour fermer — c'est le contrat d'une liste de suggestions, et sans
 *   lui le champ est inutilisable au clavier comme au lecteur d'écran.
 */

export interface LieuChoisi {
  /** Nul quand le nom a été saisi à la main. */
  id: string | null;
  nom: string;
  region?: string | null;
}

interface Suggestion {
  id: string;
  slug: string;
  nom: string;
  region: string | null;
  district: string | null;
  kind: string;
  nb_pages: number;
  touristique: boolean;
  via_alias: string | null;
}

export function ChampLieu({
  valeur,
  onChange,
  id,
  autoFocus,
}: {
  valeur: LieuChoisi | null;
  onChange: (l: LieuChoisi | null) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  const auto = useId();
  const champId = id ?? auto;
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [liste, setListe] = useState<Suggestion[]>([]);
  const [actif, setActif] = useState(0);
  const boite = useRef<HTMLDivElement>(null);
  // ⚠ On ne garde que la dernière recherche : la frappe est plus rapide que le
  //   réseau, et une réponse en retard écrasait la liste du terme suivant.
  const version = useRef(0);

  useEffect(() => {
    const terme = q.trim();
    if (terme.length < 2) {
      setListe([]);
      setChargement(false);
      return;
    }
    setChargement(true);
    // On attend que la frappe se calme — une requête par lettre saturerait
    // l'API et ferait clignoter la liste.
    const t = setTimeout(async () => {
      const mien = ++version.current;
      const { data } = await supabase.rpc("chercher_lieux", {
        p_q: terme,
        p_limite: 12,
      });
      if (mien !== version.current) return;
      setListe((data as unknown as Suggestion[]) ?? []);
      setActif(0);
      setChargement(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  // Fermer au clic dehors — sans cela la liste reste ouverte par-dessus le reste
  // du formulaire et masque le bouton « Publier ».
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", surClic);
    return () => document.removeEventListener("mousedown", surClic);
  }, [ouvert]);

  function choisir(s: Suggestion) {
    onChange({ id: s.id, nom: s.nom, region: s.region });
    setQ("");
    setOuvert(false);
  }

  function saisirLibre() {
    const nom = q.trim();
    if (nom.length < 2) return;
    onChange({ id: null, nom });
    setQ("");
    setOuvert(false);
  }

  // ── Déjà choisi : on montre le choix, pas le champ ────────────────────────
  if (valeur) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium",
            valeur.id
              ? "border-primary/40 bg-secondary"
              : "border-dashed border-input bg-background"
          )}
        >
          {valeur.id ? (
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          ) : (
            <PenLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          {valeur.nom}
          {valeur.region && (
            <span className="font-normal text-muted-foreground">· {valeur.region}</span>
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Retirer le lieu ${valeur.nom}`}
            className="ml-0.5 grid h-6 w-6 place-items-center rounded-full hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
        {/* ⚠ On DIT ce que la saisie libre coûte, au moment où elle est visible —
            pas dans une aide générale que personne ne lit. */}
        {!valeur.id && (
          <span className="text-xs text-muted-foreground">
            Nom écrit à la main&nbsp;: la publication ne sera pas rattachée à une
            page de destination.
          </span>
        )}
      </div>
    );
  }

  const peutSaisirLibre = q.trim().length >= 2;

  return (
    <div ref={boite} className="relative">
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={champId}
          type="text"
          role="combobox"
          aria-expanded={ouvert && (liste.length > 0 || peutSaisirLibre)}
          aria-controls={`${champId}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={
            ouvert && liste[actif] ? `${champId}-opt-${liste[actif].id}` : undefined
          }
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActif((i) => Math.min(i + 1, liste.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActif((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (liste[actif]) choisir(liste[actif]);
              else saisirLibre();
            } else if (e.key === "Escape") {
              setOuvert(false);
            }
          }}
          placeholder="Antananarivo, Nosy Be, un village…"
          className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {chargement && (
          <Loader2
            className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {ouvert && (liste.length > 0 || peutSaisirLibre) && (
        <ul
          id={`${champId}-liste`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {liste.map((s, i) => (
            <li key={s.id} id={`${champId}-opt-${s.id}`} role="option" aria-selected={i === actif}>
              <button
                type="button"
                onMouseEnter={() => setActif(i)}
                onClick={() => choisir(s)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left",
                  i === actif && "bg-muted"
                )}
              >
                <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {s.nom}
                    {s.touristique && (
                      <span className="ml-1.5 text-xs font-normal text-primary">
                        destination
                      </span>
                    )}
                  </span>
                  {/* ⚠ TROIS REPÈRES POUR TRANCHER ENTRE HOMONYMES : la région,
                      le district, et le nombre d'adresses. Avec le seul nom,
                      trois « Ambalavao » sont indiscernables. */}
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      s.region,
                      s.district && s.district !== s.region ? s.district : null,
                      s.nb_pages > 0
                        ? `${s.nb_pages} adresse${s.nb_pages > 1 ? "s" : ""}`
                        : null,
                      s.via_alias ? `aussi appelé « ${s.via_alias} »` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}

          {peutSaisirLibre && (
            <li className={cn("border-border", liste.length > 0 && "mt-1 border-t pt-1")}>
              <button
                type="button"
                onClick={saisirLibre}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-muted"
              >
                <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    Utiliser «&nbsp;<strong>{q.trim()}</strong>&nbsp;» tel quel
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {liste.length > 0
                      ? "Si aucune proposition ne correspond"
                      : "Ce lieu n'est pas encore au référentiel — écrivez-le"}
                  </span>
                </span>
              </button>
            </li>
          )}

          {!chargement && liste.length === 0 && q.trim().length >= 2 && (
            <li className="px-3.5 py-2 text-xs text-muted-foreground">
              <Check className="mr-1 inline h-3 w-3" aria-hidden="true" />
              Aucun lieu connu sous ce nom — vous pouvez l'écrire vous-même.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
