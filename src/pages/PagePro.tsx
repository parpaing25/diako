import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Bookmark,
  Clock,
  Globe,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Star,
} from "lucide-react";
import { BadgeVerification } from "@/components/Badges";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import {
  construireCircuitJsonLd,
  construireFicheJsonLd,
  construireOffresChambres,
  filArianeFiche,
  poserJsonLd,
} from "@/lib/jsonld";
import { ImageProgressive } from "@/components/ImageProgressive";
import { Carrousel } from "@/components/Carrousel";
import { PanneauDemande } from "@/components/PanneauDemande";
import {
  ariary,
  avisDe,
  basculerFicheGardee,
  chargerFiche,
  ficheEstGardee,
  deposerAvis,
  ecrireALEtablissement,
  recitsMentionnant,
  revendiquer,
  unite,
  type Avis,
  type Fiche,
} from "@/lib/etablissements";
import { afficherNumero, lienAppel, lienWhatsApp, peutRecevoirWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const PENSION: Record<string, string> = {
  chambre_seule: "chambre seule",
  petit_dej: "petit déjeuner inclus",
  demi_pension: "demi-pension",
  pension_complete: "pension complète",
  all_in: "tout compris",
};

type Onglet = "chambres" | "carte" | "activites" | "circuits" | "avis" | "infos";

/**
 * La fiche publique d'un établissement.
 *
 * ⚠ CE QUI A CHANGÉ. Cet écran lisait `PLACES.find(...) ?? PLACES[0]` dans un
 *   fichier de données fictives : n'importe quelle URL /p/xxx affichait le
 *   bungalow d'Ampefy avec ses tarifs, au lieu d'une 404. Pire, les onglets
 *   étaient des constantes globales écrites pour un hôtel-restaurant — une
 *   page d'AGENCE ouvrait donc sur « Chambres » et proposait un menu de
 *   ravitoto. Les trois boutons de contact n'étaient que des toasts
 *   « bientôt disponible ».
 *
 *   Désormais : une seule requête (get_page_by_slug), une vraie 404 quand le
 *   slug n'existe pas, et des onglets déduits de ce que l'établissement a
 *   RÉELLEMENT publié. Un hôtel sans restaurant n'a pas d'onglet Carte.
 */
export default function PagePro() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  const [onglet, setOnglet] = useState<Onglet>("infos");
  const [avis, setAvis] = useState<Avis[]>([]);
  const [recits, setRecits] = useState<{ id: string; body: string | null }[]>([]);
  const [maNote, setMaNote] = useState(0);
  const [monAvis, setMonAvis] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [revendicationOuverte, setRevendicationOuverte] = useState(false);
  const [gardee, setGardee] = useState(false);

  // Titre, description, aperçu de partage et canonique — tirés de la fiche.
  // Partager un hôtel sur WhatsApp montrait jusqu'ici le titre et l'image de
  // l'accueil : sur ce marché, c'est le canal d'acquisition n°1.
  useSEO({
    titre: fiche ? `${fiche.name}${fiche.place ? ` — ${fiche.place.name}` : ""}` : "Établissement",
    description:
      fiche?.short_desc ??
      (fiche
        ? `${fiche.name}${fiche.place ? ` à ${fiche.place.name}` : ""}${
            fiche.price_min_ar ? `, à partir de ${ariary(fiche.price_min_ar)}` : ""
          }. Coordonnées, tarifs et avis sur Diako.`
        : undefined),
    image: fiche?.cover_url ?? undefined,
    url: slug ? `/p/${slug}` : undefined,
  });

  // Données structurées : c'est ce qui fait afficher la note, la fourchette de
  // prix et le fil d'Ariane dans les résultats Google plutôt qu'une ligne bleue.
  useEffect(() => {
    if (!fiche) return;
    poserJsonLd("dk-jsonld-fiche", construireFicheJsonLd(fiche));
    poserJsonLd("dk-jsonld-ariane", filArianeFiche(fiche));
    poserJsonLd(
      "dk-jsonld-chambres",
      construireOffresChambres(
        fiche.slug,
        fiche.rooms.map((r) => ({
          name: r.name,
          description: r.description,
          max_adults: r.max_adults,
          base_price_ar: r.base_price_ar,
          price_unit: r.price_unit,
        }))
      )
    );
    poserJsonLd(
      "dk-jsonld-circuit",
      fiche.tours.length ? construireCircuitJsonLd(fiche.slug, fiche.tours[0]) : null
    );
    return () => {
      for (const id of [
        "dk-jsonld-fiche",
        "dk-jsonld-ariane",
        "dk-jsonld-chambres",
        "dk-jsonld-circuit",
      ])
        poserJsonLd(id, null);
    };
  }, [fiche]);

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    try {
      const f = await chargerFiche(slug);
      if (!f) {
        setEtat("absente");
        return;
      }
      setFiche(f);
      setEtat("ok");
      // L'onglet ouvert par défaut suit ce que l'établissement propose, au
      // lieu d'être « Chambres » pour tout le monde y compris une agence.
      setOnglet(
        f.rooms.length
          ? "chambres"
          : f.menu_items.length || f.menu_photos.length
            ? "carte"
            : f.tours.length
              ? "circuits"
              : f.activities.length
                ? "activites"
                : "infos"
      );
      void avisDe(f.id).then(setAvis).catch(() => undefined);
      void ficheEstGardee(f.id).then(setGardee).catch(() => undefined);
      void recitsMentionnant(f.id).then(setRecits).catch(() => undefined);
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function ecrire() {
    if (!fiche) return;
    if (!user) {
      toast("Connexion requise", {
        description: "Créez un compte pour écrire à cet établissement.",
      });
      navigate("/auth");
      return;
    }
    try {
      const conv = await ecrireALEtablissement(fiche.id);
      navigate(`/messages?c=${conv}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'envoi n'a pas pu démarrer.");
    }
  }

  async function partager() {
    const url = `${window.location.origin}/p/${slug}`;
    try {
      if (navigator.share) await navigator.share({ title: fiche?.name ?? "Diako", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      /* annulé */
    }
  }

  async function noter() {
    if (!fiche || maNote < 1) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    setEnvoi(true);
    try {
      await deposerAvis(fiche.id, { note: maNote, body: monAvis });
      toast.success("Merci, votre avis est publié.");
      setMonAvis("");
      setAvis(await avisDe(fiche.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'avis n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  }

  if (etat === "chargement") {
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-40 w-full rounded-2xl md:h-56" />
        <div className="dk-skeleton h-7 w-2/3" />
        <div className="dk-skeleton h-4 w-1/3" />
        <div className="dk-skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  // Une vraie 404 : un lien périmé ne doit jamais présenter silencieusement
  // un AUTRE établissement avec ses tarifs.
  if (etat === "absente" || !fiche) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Cet établissement n'existe pas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le lien est peut-être périmé, ou la fiche a été retirée.
        </p>
        <Link
          to="/explorer"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Explorer les destinations
        </Link>
      </div>
    );
  }

  if (etat === "erreur") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">La fiche n'a pas pu être chargée</p>
        <button
          onClick={() => void charger()}
          className="mt-4 min-h-10 rounded-full border border-input px-5 text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const onglets: { cle: Onglet; label: string; visible: boolean }[] = [
    { cle: "chambres", label: "Chambres", visible: fiche.rooms.length > 0 },
    {
      cle: "carte",
      label: "Carte",
      visible: fiche.menu_items.length > 0 || fiche.menu_photos.length > 0,
    },
    { cle: "activites", label: "Activités", visible: fiche.activities.length > 0 },
    { cle: "circuits", label: "Circuits", visible: fiche.tours.length > 0 },
    {
      cle: "avis",
      label: `Avis${fiche.rating_count ? ` (${fiche.rating_count})` : ""}`,
      visible: true,
    },
    { cle: "infos", label: "Infos", visible: true },
  ];

  const aujourdhui = fiche.hours.find((h) => h.jour === new Date().getDay());

  return (
    <div className="pb-8">
      <div className="relative h-40 w-full overflow-hidden bg-muted md:h-64 md:rounded-2xl">
        {fiche.cover_url ? (
          <ImageProgressive src={fiche.cover_url} alt={fiche.name} prioritaire ajustement="cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary to-primary-soft">
            <span className="px-6 text-center text-xl font-semibold text-white">{fiche.name}</span>
          </div>
        )}
      </div>

      {/* ⚠ DEUX COLONNES À PARTIR DE `xl` (écran W3). La fiche garde sa largeur
          de lecture ; le panneau de demande prend le reste. En dessous, une
          seule colonne : les boutons de contact de l'entête suffisent, on les
          retrouve d'un geste. */}
      <div className="px-4 xl:flex xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1">
        <div className="mt-4 flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl font-semibold leading-tight">{fiche.name}</h1>
          {fiche.verification_status !== "none" && (
            <BadgeVerification niveau={fiche.verification_status} className="mt-1.5 shrink-0" />
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {fiche.place && (
            <Link
              to={`/recherche?q=${encodeURIComponent(fiche.place.name)}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {fiche.place.name}
            </Link>
          )}
          {/* ⚠ Plus de « ★ 4.8 (9 avis) » en entête face à « Aucun avis » dans
              l'onglet : les deux viennent maintenant du même compteur. */}
          {fiche.rating_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              {fiche.rating_avg.toFixed(1)}
              <span className="text-muted-foreground/80">({fiche.rating_count} avis)</span>
            </span>
          )}
          {/* Horaires du jour, lus en base. C'était « Ouvert · ferme à 22 h »
              affiché en dur pour tout le monde, agences comprises. */}
          {aujourdhui && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {aujourdhui.ferme_journee
                ? "Fermé aujourd'hui"
                : `Aujourd'hui ${aujourdhui.ouvre?.slice(0, 5) ?? "—"} – ${aujourdhui.ferme?.slice(0, 5) ?? "—"}`}
            </span>
          )}
        </div>

        {/* Le tarif d'appel passe dans le panneau à partir de `xl` : l'afficher
            deux fois à 30 cm d'écart donne l'impression de deux prix. */}
        {fiche.price_min_ar != null && (
          <p className="mt-2 text-sm xl:hidden">
            À partir de{" "}
            <span className="font-semibold text-primary">{ariary(fiche.price_min_ar)}</span>{" "}
            <span className="text-muted-foreground">{unite(fiche.price_min_unit)}</span>
          </p>
        )}

        {fiche.short_desc && <p className="mt-3 text-[15px]">{fiche.short_desc}</p>}

        {/* Contact : de vrais liens, plus des toasts « bientôt disponible ». */}
        <div className="mt-4 flex flex-wrap gap-2">
          {fiche.phone && (
            <a
              href={lienAppel(fiche.phone)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground xl:hidden"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Appeler
            </a>
          )}
          {fiche.whatsapp && peutRecevoirWhatsApp(fiche.whatsapp) && (
            <a
              href={lienWhatsApp(fiche.whatsapp, { etablissement: fiche.name })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-medium xl:hidden"
            >
              WhatsApp
            </a>
          )}
          <button
            onClick={() => void ecrire()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-medium xl:hidden"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Écrire
          </button>
          {/* Ce qu'on garde en preparant un voyage, ce n'est pas un recit :
              c'est l'hotel ou on pense dormir. */}
          <button
            onClick={async () => {
              if (!user) {
                toast("Connexion requise", {
                  description: "Créez un compte pour garder cette adresse.",
                });
                return navigate("/auth");
              }
              const avant = gardee;
              setGardee(!avant);
              try {
                setGardee(await basculerFicheGardee(fiche.id, avant));
                toast.success(avant ? "Retiré de votre carnet." : "Gardé dans votre carnet.");
              } catch {
                setGardee(avant);
                toast.error("L'enregistrement a échoué.");
              }
            }}
            aria-pressed={gardee}
            aria-label={gardee ? "Retirer de mon carnet" : "Garder dans mon carnet"}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              gardee ? "border-primary bg-secondary text-primary" : "border-input"
            )}
          >
            <Bookmark className={cn("h-4 w-4", gardee && "fill-current")} aria-hidden="true" />
            {gardee ? "Gardé" : "Garder"}
          </button>
          <button
            onClick={() => void partager()}
            aria-label="Partager"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-4 text-sm font-medium"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {fiche.gallery.length > 0 && (
          <div className="mt-5 aspect-[16/10] w-full overflow-hidden rounded-2xl">
            <Carrousel
              images={fiche.gallery.map((url) => ({ url }))}
              alt={fiche.name}
              ajustement="couvrir"
            />
          </div>
        )}

        <div
          role="tablist"
          aria-label="Sections de la fiche"
          /* ⚠ ACCROCHÉS SOUS L'ENTÊTE (écran W3). Une fiche complète fait
             plusieurs hauteurs d'écran : sans cela, passer des avis aux
             chambres oblige à remonter tout en haut. Le fond est opaque —
             translucide, le texte qui défile dessous les rendait illisibles. */
          className="sticky top-14 z-20 -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-border bg-background px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {onglets
            .filter((o) => o.visible)
            .map((o) => (
              <button
                key={o.cle}
                role="tab"
                aria-selected={onglet === o.cle}
                onClick={() => setOnglet(o.cle)}
                className={cn(
                  "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition",
                  onglet === o.cle
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
        </div>

        <div className="mt-4">
          {onglet === "chambres" && (
            <ul className="space-y-3">
              {fiche.rooms.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          c.max_adults && `${c.max_adults} adulte${c.max_adults > 1 ? "s" : ""}`,
                          c.max_children
                            ? `${c.max_children} enfant${c.max_children > 1 ? "s" : ""}`
                            : null,
                          c.view && `vue ${c.view}`,
                          c.hot_water ? "eau chaude" : null,
                          c.private_bath ? "salle d'eau privée" : "sanitaires partagés",
                          c.surface_m2 && `${c.surface_m2} m²`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 text-right">
                      <span className="font-semibold text-primary">{ariary(c.base_price_ar)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {unite(c.price_unit)}
                      </span>
                    </p>
                  </div>

                  {c.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                  )}

                  {/* Les tarifs par saison : un hôtel n'a pas UN prix. */}
                  {c.rates.length > 0 && (
                    <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
                      {c.rates.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{t.season_label}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[
                                t.from_date &&
                                  t.to_date &&
                                  `${new Date(t.from_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${new Date(t.to_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
                                t.board && PENSION[t.board],
                                t.min_nights > 1 && `${t.min_nights} nuits minimum`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold">{ariary(t.price_ar)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onglet === "carte" && (
            <div className="space-y-5">
              {fiche.menu_sections.map((s) => {
                const plats = fiche.menu_items.filter((p) => p.section_id === s.id);
                if (!plats.length) return null;
                return (
                  <section key={s.id}>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.name}
                    </h3>
                    <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                      {plats.map((p) => (
                        <PlatLigne key={p.id} plat={p} />
                      ))}
                    </ul>
                  </section>
                );
              })}

              {fiche.menu_items.some((p) => !p.section_id) && (
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Autres
                  </h3>
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                    {fiche.menu_items
                      .filter((p) => !p.section_id)
                      .map((p) => (
                        <PlatLigne key={p.id} plat={p} />
                      ))}
                  </ul>
                </section>
              )}

              {/* Mode dégradé : la carte papier photographiée. Sans cette
                  échappatoire, une gargote de 45 plats ne publie jamais rien. */}
              {fiche.menu_photos.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    La carte en photo
                  </h3>
                  <div className="mt-2 aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-border">
                    <Carrousel
                      images={fiche.menu_photos.map((m) => ({ url: m.url }))}
                      alt="Carte de l'établissement"
                      ajustement="contenir"
                    />
                  </div>
                </section>
              )}
            </div>
          )}

          {onglet === "activites" && (
            <ul className="space-y-3">
              {fiche.activities.map((a) => (
                <li key={a.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{a.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          a.duration_h && `${a.duration_h} h`,
                          a.min_people && `à partir de ${a.min_people} personnes`,
                          a.max_people && `${a.max_people} maximum`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {a.price_ar != null && (
                      <p className="shrink-0 text-right">
                        <span className="font-semibold text-primary">{ariary(a.price_ar)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {unite(a.price_unit)}
                        </span>
                      </p>
                    )}
                  </div>
                  {a.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
                  )}
                  {a.includes.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Comprend : {a.includes.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onglet === "circuits" && (
            <ul className="space-y-4">
              {fiche.tours.map((t) => (
                <li key={t.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{t.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          `${t.duration_days} jour${t.duration_days > 1 ? "s" : ""}`,
                          t.duration_nights != null && `${t.duration_nights} nuits`,
                          t.difficulty,
                          t.format,
                          t.parks_included ? "droits de parc inclus" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {t.prices.length > 0 && (
                      <p className="shrink-0 text-right">
                        <span className="font-semibold text-primary">
                          {ariary(Math.min(...t.prices.map((p) => p.price_ar)))}
                        </span>
                        <span className="block text-xs text-muted-foreground">par personne</span>
                      </p>
                    )}
                  </div>

                  {t.summary && <p className="mt-2 text-sm">{t.summary}</p>}

                  {/* Le prix dépend du nombre de participants : à deux on paie
                      le double par personne de ce qu'on paie à huit. */}
                  {t.prices.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {t.prices.map((p) => (
                        <span
                          key={p.base_pax}
                          className="rounded-full border border-border px-2.5 py-1 text-xs"
                        >
                          {p.base_pax} pers. · <strong>{ariary(p.price_ar)}</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {t.days.length > 0 && (
                    <ol className="mt-3 space-y-2 border-l-2 border-border pl-4">
                      {t.days.map((j) => (
                        <li key={j.jour}>
                          <p className="text-sm font-medium">
                            Jour {j.jour} — {j.titre}
                          </p>
                          {j.detail && <p className="text-sm text-muted-foreground">{j.detail}</p>}
                          {j.nuitee && (
                            <p className="text-xs text-muted-foreground">Nuit : {j.nuitee}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {t.inclusions.length > 0 && (
                    <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
                      {t.inclusions.map((i, k) => (
                        <p
                          key={k}
                          className={i.inclus ? "text-foreground" : "text-muted-foreground"}
                        >
                          {i.inclus ? "✓" : "✗"} {i.libelle}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onglet === "avis" && (
            <div className="space-y-4">
              {/* La RLS interdit déjà de se noter soi-même ; on ne propose
                  simplement pas le formulaire au propriétaire. */}
              {user && fiche.owner_id !== user.id && (
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-sm font-medium">Vous y êtes allé ?</p>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setMaNote(n)}
                        aria-label={`${n} sur 5`}
                        className="dk-tap p-0.5"
                      >
                        <Star
                          className={cn(
                            "h-6 w-6",
                            n <= maNote ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={monAvis}
                    onChange={(e) => setMonAvis(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ce qui vous a plu, ce qui vous a manqué…"
                    className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm"
                  />
                  <button
                    onClick={() => void noter()}
                    disabled={maNote < 1 || envoi}
                    className="mt-2 min-h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {envoi ? "Envoi…" : "Publier mon avis"}
                  </button>
                </div>
              )}

              {avis.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
                  <p className="font-medium">Aucun avis pour le moment</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Soyez le premier à raconter votre passage.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {avis.map((a) => (
                    <li key={a.id} className="rounded-2xl border border-border p-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5 text-sm font-semibold">
                          <Star
                            className="h-4 w-4 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          {a.note}
                        </span>
                        <Link to={`/user/${a.author.id}`} className="text-sm font-medium">
                          {a.author.name ?? "Membre Diako"}
                        </Link>
                        <time
                          dateTime={a.created_at}
                          className="ml-auto text-xs text-muted-foreground"
                        >
                          {new Date(a.created_at).toLocaleDateString("fr-FR")}
                        </time>
                      </div>
                      {a.body && <p className="mt-2 text-sm">{a.body}</p>}
                      {a.reponse && (
                        <div className="mt-3 rounded-xl bg-secondary/60 p-3">
                          <p className="text-xs font-semibold text-primary">
                            Réponse de l'établissement
                          </p>
                          <p className="mt-1 text-sm">{a.reponse.body}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {onglet === "infos" && (
            <div className="space-y-5">
              {fiche.long_desc && (
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{fiche.long_desc}</p>
              )}

              {/* Le repère en clair : l'adressage normalisé n'existe pas à
                  Madagascar, c'est lui qui permet de trouver l'endroit. */}
              {(fiche.landmark || fiche.address || fiche.place) && (
                <section>
                  <h3 className="text-sm font-semibold">Où c'est</h3>
                  {fiche.address && <p className="mt-1 text-sm">{fiche.address}</p>}
                  {fiche.landmark && (
                    <p className="mt-1 text-sm text-muted-foreground">{fiche.landmark}</p>
                  )}
                  <Link
                    to={`/carte?focus=${fiche.slug}`}
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium"
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Voir sur la carte
                  </Link>
                </section>
              )}

              {fiche.hours.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Horaires</h3>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {[...fiche.hours]
                      .sort((a, b) => ((a.jour + 6) % 7) - ((b.jour + 6) % 7))
                      .map((h) => (
                        <li key={h.jour} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{JOURS[h.jour]}</span>
                          <span>
                            {h.ferme_journee
                              ? "Fermé"
                              : `${h.ouvre?.slice(0, 5) ?? "—"} – ${h.ferme?.slice(0, 5) ?? "—"}`}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}

              {fiche.amenities.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Équipements et services</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fiche.amenities.map((a) => (
                      <span
                        key={a.code}
                        className="rounded-full border border-border px-2.5 py-1 text-xs"
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {fiche.payment_methods.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Paiement accepté</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fiche.payment_methods.join(" · ")}
                  </p>
                </section>
              )}

              {(fiche.website || fiche.facebook || fiche.email) && (
                <section>
                  <h3 className="text-sm font-semibold">Liens</h3>
                  <div className="mt-1 flex flex-col gap-1 text-sm">
                    {fiche.website && (
                      <a
                        href={fiche.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"
                      >
                        <Globe className="h-4 w-4" aria-hidden="true" />
                        Site web
                      </a>
                    )}
                    {fiche.facebook && (
                      <a
                        href={fiche.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-4"
                      >
                        Page Facebook
                      </a>
                    )}
                    {fiche.email && (
                      <a
                        href={`mailto:${fiche.email}`}
                        className="text-primary underline underline-offset-4"
                      >
                        {fiche.email}
                      </a>
                    )}
                  </div>
                </section>
              )}

              {/* La preuve sociale : les récits qui citent l'établissement. */}
              {recits.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Ils en parlent</h3>
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                    {recits.map((r) => (
                      <li key={r.id}>
                        <Link to={`/post/${r.id}`} className="block px-4 py-3 hover:bg-muted/50">
                          <p className="line-clamp-2 text-sm">{r.body ?? "Publication photo"}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* La fraîcheur des tarifs est le nerf de la guerre : un prix de
                  l'an dernier vaut moins que pas de prix du tout. */}
              {fiche.rates_checked_at && (
                <p className="text-xs text-muted-foreground">
                  Tarifs vérifiés le {new Date(fiche.rates_checked_at).toLocaleDateString("fr-FR")}.
                </p>
              )}

              {/* ⭐ FICHE ÉDITORIALE. Au lancement, c'est Diako qui saisit les
                  établissements : la fiche dit alors D'OÙ vient l'information
                  et propose au gérant de la reprendre. Afficher la source n'est
                  pas de la coquetterie — c'est ce qui distingue une donnée
                  relevée d'une donnée inventée, et ce projet a déjà payé pour
                  le savoir. */}
              {!fiche.owner_id && (
                <section className="rounded-2xl border border-border bg-secondary/40 p-4">
                  <p className="text-sm font-medium">Cette fiche est tenue par Diako</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nous l'avons créée pour que l'établissement soit trouvable.
                    Le gérant peut la reprendre à tout moment : il ajoutera alors
                    ses chambres, ses tarifs, ses photos, et recevra les messages
                    des voyageurs.
                  </p>
                  {fiche.source && (
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      Source : {fiche.source}
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (!user) {
                        toast("Connexion requise", {
                          description: "Créez un compte pour revendiquer votre établissement.",
                        });
                        navigate("/auth");
                        return;
                      }
                      setRevendicationOuverte(true);
                    }}
                    className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                  >
                    C'est mon établissement
                  </button>
                </section>
              )}
            </div>
          )}
        </div>
        </div>

        <PanneauDemande fiche={fiche} onEcrire={() => void ecrire()} />
      </div>

      {revendicationOuverte && (
        <Revendication
          fiche={fiche}
          onFerme={() => setRevendicationOuverte(false)}
        />
      )}
    </div>
  );
}

/**
 * « C'est mon établissement. »
 *
 * On demande un numéro de rappel plutôt que de valider automatiquement :
 * accepter une revendication donne accès aux messages des clients de
 * l'établissement. Un simple clic ne peut pas suffire — un coup de téléphone,
 * si.
 */
function Revendication({ fiche, onFerme }: { fiche: Fiche; onFerme: () => void }) {
  const [message, setMessage] = useState("");
  const [tel, setTel] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    setEnvoi(true);
    try {
      await revendiquer(fiche.id, message, tel);
      toast.success("Demande envoyée", {
        description: "Nous vous rappelons pour vérifier, puis la fiche vous est transférée.",
      });
      onFerme();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La demande n'a pas pu être envoyée.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <button
        aria-label="Fermer"
        onClick={onFerme}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative w-full max-w-md rounded-t-2xl bg-background p-5 sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Reprendre {fiche.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nous vérifions chaque demande par téléphone avant de transférer une
          fiche : elle donne accès aux messages de vos clients.
        </p>

        <label className="mt-4 block text-sm font-medium" htmlFor="tel-revendication">
          Votre numéro
        </label>
        <input
          id="tel-revendication"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          inputMode="tel"
          placeholder="034 00 000 00"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"
        />

        <label className="mt-3 block text-sm font-medium" htmlFor="msg-revendication">
          Un mot pour nous
        </label>
        <textarea
          id="msg-revendication"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Je suis le gérant, voici comment me joindre…"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"
        />

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void envoyer()}
            disabled={envoi}
            className="min-h-11 rounded-full bg-primary px-6 font-medium text-primary-foreground disabled:opacity-50"
          >
            {envoi ? "Envoi…" : "Envoyer ma demande"}
          </button>
          <button
            onClick={onFerme}
            className="min-h-11 rounded-full border border-input px-5 text-sm font-medium"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/** Une ligne de carte : le nom tel que le restaurateur l'écrit, et son prix. */
function PlatLigne({ plat }: { plat: Fiche["menu_items"][number] }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {plat.name}
          {plat.is_signature && (
            <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              spécialité
            </span>
          )}
          {!plat.in_stock && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              — indisponible
            </span>
          )}
        </p>
        {plat.description && <p className="text-xs text-muted-foreground">{plat.description}</p>}
        {plat.side_dish && (
          <p className="text-xs text-muted-foreground">Servi avec {plat.side_dish}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-primary">
        {plat.price_ar != null ? ariary(plat.price_ar) : "—"}
      </span>
    </li>
  );
}
