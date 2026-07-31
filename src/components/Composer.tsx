import { useNavigate } from "react-router-dom";
import { Image, MapPin, Sparkles, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";

/**
 * Zone « Partagez votre voyage », en tête du fil.
 *
 * ⚠ Chaque élément mène quelque part. Sur la version précédente de Diako, ce
 * bloc existait déjà — mais son bouton « Publier » n'avait AUCUN onClick, et
 * les boutons Photo / Lieu / Amis / Humeur non plus. C'était du décor pur.
 * Ici, tout ouvre l'écran de publication.
 */
export function Composer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserData();

  const prenom = profile?.display_name?.split(" ")[0];
  const initiale = (profile?.display_name || "D").slice(0, 1).toUpperCase();

  return (
    <div className="border-b border-border bg-card px-4 py-3.5 md:rounded-2xl md:border md:px-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" width={40} height={40} className="h-10 w-10 object-cover" />
          ) : (
            initiale
          )}
        </div>
        <button
          onClick={() => navigate(user ? "/publier" : "/auth")}
          className="flex-1 rounded-full bg-muted px-4 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-muted/70"
        >
          {prenom
            ? `${prenom}, racontez votre dernier voyage…`
            : "Racontez un voyage, une adresse, un bon plan…"}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-1 border-t border-border pt-2">
        {[
          { icon: Image, label: "Photo", classe: "text-emerald-600" },
          { icon: MapPin, label: "Lieu", classe: "text-primary" },
          { icon: UtensilsCrossed, label: "Plat", classe: "text-accent" },
          { icon: Sparkles, label: "Bon plan", classe: "text-amber-500" },
        ].map(({ icon: Icon, label, classe }) => (
          <button
            key={label}
            onClick={() => navigate(user ? "/publier" : "/auth")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted"
          >
            <Icon className={`h-4 w-4 ${classe}`} aria-hidden="true" />
            <span className="hidden xs:inline sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
