import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Heart, MapPin, Star, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PostCard } from "@/components/PostCard";
import { ImageProgressive } from "@/components/ImageProgressive";
import { mesFavoris, type Post } from "@/lib/api";
import {
  ariary,
  mesEtablissementsGardes,
  mesPublicationsAimees,
  unite,
  type FicheGardee,
  type PublicationAimee,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";
import { useReveal } from "@/hooks/useReveal";

type Onglet = "adresses" | "enregistres" | "aimes";

/**
 * Mon carnet.
 *
 * ⚠ CE QUI MANQUAIT. La page ne montrait que les publications ENREGISTRÉES.
 *   Or en préparant un voyage, ce qu'on garde n'est pas un récit : c'est
 *   l'hôtel où on pense dormir. Et ce qu'on laisse le plus souvent derrière
 *   soi, ce n'est pas un enregistrement — c'est un cœur.
 *
 *   Trois onglets, et l'ordre n'est pas neutre : les ADRESSES d'abord, parce
 *   que c'est ce qui sert à décider.
 */
export default function Favoris() {
  useReveal();
  useDocumentTitle("Mon carnet");
  const { user, loading } = useAuth();
  const [onglet, setOnglet] = useState<Onglet>("adresses");

  const [adresses, setAdresses] = useState<FicheGardee[] | null>(null);
  const [enregistres, setEnregistres] = useState<Post[] | null>(null);
  const [aimes, setAimes] = useState<PublicationAimee[] | null>(null);

  // Chaque onglet charge à sa première ouverture, pas au montage : sur une 3G,
  // trois requêtes pour une seule liste regardée, c'est deux de trop.
  const charger = useCallback(
    (o: Onglet) => {
      if (!user) return;
      if (o === "adresses" && adresses === null)
        void mesEtablissementsGardes()
          .then(setAdresses)
          .catch(() => setAdresses([]));
      if (o === "enregistres" && enregistres === null)
        void mesFavoris()
          .then(setEnregistres)
          .catch(() => setEnregistres([]));
      if (o === "aimes" && aimes === null)
        void mesPublicationsAimees()
          .then(setAimes)
          .catch(() => setAimes([]));
    },
    [user, adresses, enregistres, aimes]
  );

  useEffect(() => {
    charger(onglet);
  }, [onglet, charger]);

  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Bookmark className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Mon carnet</h1>
        <p className="mt-2 text-muted-foreground">
          Connectez-vous pour garder les adresses et les récits qui vous
          serviront à préparer votre voyage.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const onglets: { cle: Onglet; label: string; n: number | null }[] = [
    { cle: "adresses", label: "Adresses", n: adresses?.length ?? null },
    { cle: "enregistres", label: "Enregistrés", n: enregistres?.length ?? null },
    { cle: "aimes", label: "Aimés", n: aimes?.length ?? null },
  ];

  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">Mon carnet</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Les adresses gardées, les récits mis de côté et ce que vous avez aimé.
      </p>

      <div role="tablist" className="mt-4 flex gap-1 border-b border-border">
        {onglets.map((o) => (
          <button
            key={o.cle}
            role="tab"
            aria-selected={onglet === o.cle}
            onClick={() => setOnglet(o.cle)}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition",
              onglet === o.cle
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
            {o.n !== null && o.n > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">{o.n}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {onglet === "adresses" &&
          (adresses === null ? (
            <Squelettes />
          ) : adresses.length === 0 ? (
            <Vide
              icone={Store}
              titre="Aucune adresse gardée"
              texte="Sur la fiche d'un hôtel ou d'un restaurant, appuyez sur le signet pour le retrouver ici."
              lien="/recherche"
              libelle="Chercher un établissement"
            />
          ) : (
            <ul className="dk-stagger grid gap-3 sm:grid-cols-2">
              {adresses.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/p/${a.slug}`}
                    className="dk-card flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3"
                  >
                    <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {a.cover_url ? (
                        <ImageProgressive src={a.cover_url} alt="" ajustement="cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center bg-gradient-to-br from-secondary to-secondary/40 text-xs font-medium text-primary">
                          {a.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.name}</span>
                      {a.place_name && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {a.place_name}
                        </span>
                      )}
                      {a.price_min_ar != null && (
                        <span className="mt-1 block text-sm">
                          <span className="font-semibold text-primary">
                            {ariary(a.price_min_ar)}
                          </span>{" "}
                          <span className="text-xs text-muted-foreground">
                            {unite(a.price_min_unit)}
                          </span>
                        </span>
                      )}
                      {a.rating_count > 0 && (
                        <span className="mt-0.5 flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Star
                            className="h-3 w-3 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          {a.rating_avg.toFixed(1)}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {onglet === "enregistres" &&
          (enregistres === null ? (
            <Squelettes />
          ) : enregistres.length === 0 ? (
            <Vide
              icone={Bookmark}
              titre="Aucun récit enregistré"
              texte="Le signet, sous une publication, la range ici pour plus tard."
              lien="/"
              libelle="Parcourir le fil"
            />
          ) : (
            <div className="space-y-4">
              {enregistres.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onSupprime={(id) => setEnregistres((l) => (l ?? []).filter((x) => x.id !== id))}
                />
              ))}
            </div>
          ))}

        {onglet === "aimes" &&
          (aimes === null ? (
            <Squelettes />
          ) : aimes.length === 0 ? (
            <Vide
              icone={Heart}
              titre="Rien d'aimé pour l'instant"
              texte="Le cœur, sous une publication, la retrouve ici."
              lien="/"
              libelle="Parcourir le fil"
            />
          ) : (
            <ul className="dk-stagger divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {aimes.map((a) => (
                <li key={a.id}>
                  <Link to={`/post/${a.id}`} className="flex gap-3 p-3 hover:bg-muted/40">
                    {a.media?.[0]?.url && (
                      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                        <ImageProgressive src={a.media[0].url} alt="" ajustement="cover" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm">{a.body || "Publication photo"}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {a.auteur?.nom && <span>{a.auteur.nom}</span>}
                        {a.place && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {a.place}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-0.5">
                          <Heart className="h-3 w-3 fill-accent text-accent" aria-hidden="true" />
                          {a.reactions_count}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function Squelettes() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="dk-skeleton h-24 rounded-2xl" />
      ))}
    </div>
  );
}

function Vide({
  icone: Icone,
  titre,
  texte,
  lien,
  libelle,
}: {
  icone: typeof Bookmark;
  titre: string;
  texte: string;
  lien: string;
  libelle: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
        <Icone className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-4 font-medium">{titre}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{texte}</p>
      <Link
        to={lien}
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
      >
        {libelle}
      </Link>
    </div>
  );
}
