import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Bed,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Star,
  UtensilsCrossed,
  Wifi,
  Zap,
} from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { BandeauApercu } from "@/components/BandeauApercu";
import { PLACES } from "@/data/apercu";

const CHAMBRES = [
  { nom: "Bungalow vue lac", capacite: "2 pers.", prix: "85 000 Ar", unite: "la nuit, par chambre", equip: ["Eau chaude", "Moustiquaire", "Terrasse"] },
  { nom: "Chambre standard", capacite: "2 pers.", prix: "55 000 Ar", unite: "la nuit, par chambre", equip: ["Ventilateur", "Moustiquaire"] },
  { nom: "Familiale", capacite: "4 pers.", prix: "130 000 Ar", unite: "la nuit, par chambre", equip: ["Eau chaude", "Climatisation", "Vue lac"] },
];

const MENU = [
  {
    section: "Laoka",
    plats: [
      { nom: "Ravitoto sy henakisoa", prix: "12 000 Ar", note: "portion" },
      { nom: "Romazava", prix: "10 000 Ar", note: "portion" },
      { nom: "Henakisoa sy amalona", prix: "15 000 Ar", note: "portion" },
    ],
  },
  {
    section: "Grillades",
    plats: [
      { nom: "Masikita (brochettes de zébu)", prix: "8 000 Ar", note: "la brochette" },
      { nom: "Poisson grillé du lac", prix: "18 000 Ar", note: "portion" },
    ],
  },
];

const EQUIPEMENTS = [
  { icon: Zap, label: "Groupe électrogène" },
  { icon: Wifi, label: "Wifi correct" },
  { icon: Bed, label: "Moustiquaire" },
  { icon: UtensilsCrossed, label: "Restaurant sur place" },
];

type Onglet = "chambres" | "menu" | "avis" | "infos";

/**
 * Page d'établissement — l'objet central du produit.
 *
 * Structure reprise de la vitrine pro de Fonenako (get_pro_page_by_slug :
 * toute la page en un seul appel), enrichie de ce que le voyage exige et que
 * l'immobilier ignore : les chambres avec leurs tarifs, le menu structuré, et
 * surtout l'UNITÉ de chaque prix.
 */
export default function PagePro() {
  const { slug } = useParams();
  const place = PLACES.find((p) => p.slug === slug) ?? PLACES[0];
  const [onglet, setOnglet] = useState<Onglet>("chambres");
  useDocumentTitle(place.nom);

  const bientot = (quoi: string) =>
    toast("Bientôt disponible", { description: `${quoi} sera actif quand les établissements pourront créer leur page.` });

  const onglets: { cle: Onglet; label: string }[] = [
    { cle: "chambres", label: "Chambres" },
    { cle: "menu", label: "Carte" },
    { cle: "avis", label: "Avis" },
    { cle: "infos", label: "Infos" },
  ];

  return (
    <div className="pb-6">
      {/* Couverture + identité */}
      <div className={`flex h-40 items-center justify-center bg-gradient-to-br ${place.couleur} md:h-56 md:rounded-2xl`}>
        <span className="text-7xl" aria-hidden="true">{place.emoji}</span>
      </div>

      <div className="px-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{place.nom}</h1>
              {place.verifie && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  ✓ Établissement vérifié
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="capitalize">{place.categorie}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {place.lieu}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                {place.note.toFixed(1)} ({place.avis} avis)
              </span>
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs">
              <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Ouvert · ferme à 22 h
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button onClick={() => bientot("L'appel direct")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              <Phone className="h-4 w-4" aria-hidden="true" /> Appeler
            </button>
            <button onClick={() => bientot("La demande de disponibilité")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Demander
            </button>
            <button onClick={() => bientot("Le partage")} aria-label="Partager" className="grid h-10 w-10 place-items-center rounded-full border border-border">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-5">
          <BandeauApercu quoi="Voici la structure d'une page d'établissement : chambres, carte, avis et contact." />
        </div>

        {/* Onglets */}
        <div role="tablist" aria-label="Sections de la page" className="flex gap-1 border-b border-border">
          {onglets.map((o) => (
            <button
              key={o.cle}
              role="tab"
              aria-selected={onglet === o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
                onglet === o.cle
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {onglet === "chambres" && (
            <ul className="space-y-3">
              {CHAMBRES.map((c) => (
                <li key={c.nom} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.nom}</p>
                      <p className="text-sm text-muted-foreground">{c.capacite}</p>
                    </div>
                    <p className="text-right">
                      <span className="text-lg font-bold text-primary">{c.prix}</span>
                      {/* ⚠ L'unité est OBLIGATOIRE : sans elle, comparer deux
                          établissements n'a aucun sens (§5.11 du TDR). */}
                      <span className="block text-[11px] text-muted-foreground">{c.unite}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.equip.map((e) => (
                      <span key={e} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{e}</span>
                    ))}
                  </div>
                </li>
              ))}
              <li className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Tarifs de <strong>haute saison</strong>. Petit-déjeuner et taxe de
                séjour non compris — ils seront toujours affichés à part.
              </li>
            </ul>
          )}

          {onglet === "menu" && (
            <div className="space-y-5">
              {MENU.map((s) => (
                <section key={s.section}>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.section}
                  </h2>
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                    {s.plats.map((p) => (
                      <li key={p.nom} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0 text-sm font-medium">{p.nom}</span>
                        <span className="shrink-0 text-right">
                          <span className="font-semibold text-primary">{p.prix}</span>
                          <span className="block text-[11px] text-muted-foreground">{p.note}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Chaque plat sera rattaché au référentiel des plats malgaches —
                c'est ce qui permettra de chercher « où manger du ravitoto » et
                d'obtenir le prix chez chacun.
              </p>
            </div>
          )}

          {onglet === "avis" && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <Star className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 font-medium">Aucun avis pour le moment</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Les avis seront notés par critère — propreté, eau chaude, accueil,
                rapport qualité-prix — et l'établissement pourra répondre
                publiquement.
              </p>
            </div>
          )}

          {onglet === "infos" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Équipements</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {EQUIPEMENTS.map(({ icon: Icon, label }) => (
                    <span key={label} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Repère</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  « En face de la station Jovenna, après le pont » — à Madagascar,
                  le repère en clair vaut mieux qu'une adresse normalisée.
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Paiement accepté</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Espèces · Mvola · Orange Money · Airtel Money
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-2xl bg-secondary p-4">
          <p className="font-medium">C'est votre établissement ?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez votre compte : vous pourrez réclamer cette page, tenir vos
            tarifs à jour et recevoir les demandes des voyageurs.
          </p>
          <Link
            to="/auth"
            className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Créer mon compte professionnel
          </Link>
        </div>
      </div>
    </div>
  );
}
