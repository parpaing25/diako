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
    <div className="dk-carte border-b border-border bg-card px-4 py-3 md:rounded-2xl md:border md:px-5 lg:flex lg:items-center lg:gap-4 lg:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-4">
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
          {/* ⚠ La question de la maquette, mot pour mot. « Racontez votre
              dernier voyage » demande un effort d'ecriture ; « combien ca a
              coute » demande un CHIFFRE, et c'est ce chiffre qui fait la
              valeur du site. La question porte la promesse. */}
          {prenom
            ? `${prenom}, où êtes-vous allé, et combien ça a coûté ?`
            : "Où êtes-vous allé, et combien ça a coûté ?"}
        </button>
      </div>

      {/* Sur grand ecran, tout tient sur une ligne : le composeur ne doit pas
          occuper deux fois la hauteur d'une carte du fil pour poser une seule
          question. */}
      <div className="mt-3 flex items-center justify-between gap-1 border-t border-border pt-2 lg:mt-0 lg:border-0 lg:pt-0">
        {/* 🔴 LES QUATRE BOUTONS FAISAIENT EXACTEMENT LA MEME CHOSE. Quatre
            icones, quatre couleurs, quatre libelles — et le meme
            `navigate("/publier")` sans aucune intention transmise. Qui appuyait
            sur « Photo » attendait le selecteur d'images ; qui appuyait sur
            « Plat » attendait le type presenti. Les deux obtenaient le
            formulaire vierge, a re-choisir depuis le debut.
            ⚠ Quatre libelles pour une seule action apprennent au visiteur que
              les libelles de ce site ne veulent rien dire. L'intention passe
              desormais dans l'URL, et `/publier` la lit au montage. */}
        {[
          { icon: Image, label: "Photo", classe: "text-emerald-600", vers: "/publier?photo=1" },
          { icon: MapPin, label: "Lieu", classe: "text-primary", vers: "/publier?champ=lieu" },
          { icon: UtensilsCrossed, label: "Plat", classe: "text-accent", vers: "/publier?champ=plat" },
          { icon: Sparkles, label: "Bon plan", classe: "text-amber-500", vers: "/publier?type=bon_plan" },
        ].map(({ icon: Icon, label, classe, vers }) => (
          <button
            key={label}
            onClick={() => navigate(user ? vers : "/auth")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted sm:text-[13px]"
          >
            <Icon className={`h-4 w-4 ${classe}`} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        {/* Le bouton d'action, visible seulement quand il y a la place. */}
        <button
          onClick={() => navigate(user ? "/publier" : "/auth")}
          className="ml-1 hidden min-h-10 shrink-0 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground lg:inline-flex"
        >
          Publier
        </button>
      </div>
    </div>
  );
}
