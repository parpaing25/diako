import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BarChart3, Bed, CalendarCheck, Eye, ImagePlus, MessageSquare, Star, UtensilsCrossed } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { BandeauApercu } from "@/components/BandeauApercu";

const KPI = [
  { icon: Eye, label: "Vues de la page", valeur: "—", detail: "30 derniers jours" },
  { icon: MessageSquare, label: "Demandes reçues", valeur: "—", detail: "30 derniers jours" },
  { icon: Star, label: "Note moyenne", valeur: "—", detail: "aucun avis" },
  { icon: CalendarCheck, label: "Délai de réponse", valeur: "—", detail: "à mesurer" },
];

const OUTILS = [
  { icon: ImagePlus, titre: "Ma page", detail: "Photos, présentation, horaires, contact" },
  { icon: Bed, titre: "Mes chambres", detail: "Types, capacités, tarifs par saison" },
  { icon: UtensilsCrossed, titre: "Ma carte", detail: "Sections, plats, prix — ou photo de la carte" },
  { icon: MessageSquare, titre: "Mes demandes", detail: "Répondre aux voyageurs, envoyer un devis" },
  { icon: Star, titre: "Mes avis", detail: "Lire et répondre publiquement" },
  { icon: BarChart3, titre: "Mes statistiques", detail: "Vues, demandes, provenance" },
];

/**
 * Espace professionnel — le cockpit d'un hôtel, d'un restaurant ou d'une agence.
 *
 * Les indicateurs affichent « — » et non des chiffres inventés : un tableau de
 * bord qui ment est pire qu'un tableau de bord vide, surtout pour le compte qui
 * paiera l'abonnement.
 */
export default function EspacePro() {
  useDocumentTitle("Espace professionnel");
  const { user } = useAuth();

  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">Espace professionnel</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Hôtel, restaurant, agence de voyage ou guide : votre page, votre
        catalogue, vos demandes.
      </p>

      <div className="mt-5">
        <BandeauApercu quoi="Voici l'organisation de l'espace professionnel." />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI.map(({ icon: Icon, label, valeur, detail }) => (
          <div key={label} className="rounded-2xl border border-border p-4">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold">{valeur}</p>
            <p className="text-xs font-medium">{label}</p>
            <p className="text-[11px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-7 text-lg font-semibold">Gérer mon établissement</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {OUTILS.map(({ icon: Icon, titre, detail }) => (
          <button
            key={titre}
            onClick={() =>
              toast("Bientôt disponible", {
                description: `« ${titre} » ouvrira quand les pages professionnelles seront livrées.`,
              })
            }
            className="flex items-start gap-3 rounded-2xl border border-border p-4 text-left transition hover:bg-muted"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{titre}</span>
              <span className="block text-sm text-muted-foreground">{detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-7 rounded-2xl bg-secondary p-4">
        <p className="font-medium">Gratuit au lancement</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Créer votre page, publier votre catalogue et recevoir des demandes
          restera gratuit. Nous ne facturerons rien tant que nous ne vous aurons
          pas apporté de clients.
        </p>
        {!user && (
          <Link
            to="/auth"
            className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Créer mon compte professionnel
          </Link>
        )}
      </div>
    </div>
  );
}
