import { Link } from "react-router-dom";
import { MapPin, Search, Utensils } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";

/**
 * Accueil du socle (Lot 0).
 * Le FIL INFINI arrive au Lot 4 : on n'affiche donc pas un faux fil.
 * Ce que cet écran doit prouver aujourd'hui : la coquille tient, la session
 * est lue, la géométrie correspond au squelette statique de index.html.
 */
export default function Index() {
  const { user } = useAuth();
  const { profile } = useUserData();

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <section className="rounded-2xl bg-secondary p-5">
        <h1 className="text-2xl font-semibold">
          {profile?.display_name ? `Bonjour ${profile.display_name} 👋` : "Bienvenue sur Diako"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Où dormir, où manger et avec qui partir à Madagascar.
        </p>
        {!user && (
          <Link
            to="/auth"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Créer mon compte
          </Link>
        )}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: MapPin, titre: "Destinations", texte: "Ampefy, Nosy Be, Andasibe…" },
          { icon: Utensils, titre: "Restaurants", texte: "Trouvez un plat, pas une adresse" },
          { icon: Search, titre: "Recherche", texte: "« un hôtel à Ampefy »" },
        ].map(({ icon: Icon, titre, texte }) => (
          <div key={titre} className="rounded-xl border border-border p-4">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="mt-2 font-medium">{titre}</h2>
            <p className="text-sm text-muted-foreground">{texte}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">Socle en place (Lot 0).</strong> Le fil infini
          arrive au Lot 4, les pages hôtels / restaurants / agences au Lot 2 et la recherche au
          Lot 3. Feuille de route complète dans <code>docs/TDR-DIAKO.md</code>.
        </p>
      </section>
    </div>
  );
}
