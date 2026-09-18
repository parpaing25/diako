import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, MapPin, Utensils } from "lucide-react";
import { ImageProgressive } from "@/components/ImageProgressive";
import { autourDeMoi, type EtablissementProche } from "@/lib/geo";
import { CATEGORIES } from "@/lib/etablissements";
import { distanceArrondie, lienCarte } from "@/lib/arrivee";
import { cn } from "@/lib/utils";

/**
 * « LES ADRESSES LES PLUS PROCHES » — pour les pages /lieu et /site.
 *
 * 🔴 CE QUE ÇA CORRIGE. La fiche d'un lieu ne comptait que les adresses
 *    RATTACHÉES à ce lieu. Sur les 20 lieux de la série Facebook du 19/09, 15
 *    affichaient « Où dormir (0) » alors que des hôtels existent à 1-10 km,
 *    rattachés au village voisin. Le visiteur lisait « rien ici » et partait.
 *
 * ⚠ LE CALCUL EST CELUI DU SERVEUR (`autour_de_moi`, migration 0016) : distance
 *   entre le point de la fiche et le GPS de l'adresse, ou à défaut le centre du
 *   lieu auquel elle est rattachée. C'est une distance À VOL D'OISEAU, et
 *   l'écran le dit — sur une piste, 10 km peuvent faire une heure.
 *
 * ⚠ UNE ADRESSE HÔTEL ET RESTAURANT n'apparaît qu'une fois, dans « Où dormir » :
 *   la montrer deux fois ferait croire à deux adresses.
 */

const RAYON_KM = 30;
const PAR_FAMILLE = 3;

function libelleCategories(categories: string[] | null | undefined): string {
  const libelles = (categories ?? [])
    .map((c) => CATEGORIES.find((x) => x.code === c)?.label)
    .filter((l): l is string => Boolean(l));
  return libelles.slice(0, 2).join(" · ");
}

export function AdressesProches({
  lat,
  lng,
  nom,
  className,
}: {
  lat: number;
  lng: number;
  /** Le nom du lieu ou du site, pour dire DEPUIS où se comptent les distances. */
  nom: string;
  className?: string;
}) {
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const [hotels, setHotels] = useState<EtablissementProche[]>([]);
  const [tables, setTables] = useState<EtablissementProche[]>([]);

  useEffect(() => {
    let vivant = true;
    setEtat("chargement");
    const p = { lat, lng, quand: Date.now() };
    // ⚠ On demande un peu plus que trois : les adresses « hôtel ET restaurant »
    //   sont retirées de la seconde liste, qui doit quand même en garder trois.
    Promise.all([
      autourDeMoi(p, { rayonKm: RAYON_KM, categorie: "hotel", limite: PAR_FAMILLE + 3 }),
      autourDeMoi(p, { rayonKm: RAYON_KM, categorie: "restaurant", limite: PAR_FAMILLE + 3 }),
    ])
      .then(([h, r]) => {
        if (!vivant) return;
        const dormir = h.slice(0, PAR_FAMILLE);
        const deja = new Set(dormir.map((x) => x.id));
        setHotels(dormir);
        setTables(r.filter((x) => !deja.has(x.id)).slice(0, PAR_FAMILLE));
        setEtat("ok");
      })
      .catch(() => {
        if (vivant) setEtat("erreur");
      });
    return () => {
      vivant = false;
    };
  }, [lat, lng]);

  return (
    <section className={cn("mt-6", className)} aria-labelledby="adresses-proches-titre">
      <h2 id="adresses-proches-titre" className="dk-etiquette">
        Les adresses les plus proches
      </h2>
      <p className="dk-secondaire mt-1">
        Distances à vol d'oiseau depuis {nom}, jusqu'à {RAYON_KM} km.
      </p>

      {etat === "chargement" ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="dk-skeleton h-14 rounded-xl" />
          <div className="dk-skeleton h-14 rounded-xl" />
        </div>
      ) : etat === "erreur" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Les adresses proches n'ont pas pu être chargées.{" "}
          <Link
            to={lienCarte(lat, lng, ["dormir", "manger"])}
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
          >
            Les chercher sur la carte
          </Link>
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <Groupe
            titre="Où dormir"
            Icone={BedDouble}
            adresses={hotels}
            vide={`Aucun hébergement référencé à moins de ${RAYON_KM} km pour l'instant.`}
          />
          <Groupe
            titre="Où manger"
            Icone={Utensils}
            adresses={tables}
            vide={`Aucune table référencée à moins de ${RAYON_KM} km pour l'instant.`}
          />
          <Link
            to={lienCarte(lat, lng, ["dormir", "manger"])}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold hover:border-primary hover:text-primary"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Toutes les adresses autour, sur la carte
          </Link>
        </div>
      )}
    </section>
  );
}

function Groupe({
  titre,
  Icone,
  adresses,
  vide,
}: {
  titre: string;
  Icone: typeof BedDouble;
  adresses: EtablissementProche[];
  vide: string;
}) {
  return (
    <div>
      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Icone className="h-4 w-4 text-primary" aria-hidden="true" />
        {titre}
      </h3>
      {adresses.length === 0 ? (
        <p className="dk-secondaire mt-1">{vide}</p>
      ) : (
        <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {adresses.map((a) => {
            const distance = distanceArrondie(a.distance_km);
            const type = libelleCategories(a.categories);
            return (
              <li key={a.id}>
                <Link
                  to={`/p/${a.slug}`}
                  className="flex min-h-16 items-center gap-3 p-2.5 hover:bg-muted"
                >
                  {a.cover_url ? (
                    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {/* ⚠ Sans `w`/`h` : ils désignent la taille de l'ORIGINAL,
                          que la fiche ne donne pas — les deviner fausserait le srcset. */}
                      <ImageProgressive src={a.cover_url} alt="" ajustement="cover" largeurAffichee="48px" />
                    </span>
                  ) : (
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary"
                      aria-hidden="true"
                    >
                      <Icone className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="dk-secondaire block truncate">
                      {[type, a.place_name].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {distance && (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{distance}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
