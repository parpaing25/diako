import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, MessageCircle, Minus, Phone, Plus } from "lucide-react";
import { Prix } from "@/components/Prix";
import { ariary, unite, type Fiche } from "@/lib/etablissements";
import { afficherNumero, lienAppel, lienWhatsApp, peutRecevoirWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * LE PANNEAU DE DEMANDE COLLANT — écran W3 de la maquette, à partir de `xl`.
 *
 * ⚠ POURQUOI IL EXISTE. Sur téléphone, les boutons de contact sont en haut de
 *   la fiche et on les retrouve en remontant d'un geste. Sur un écran de
 *   1280 px, la fiche fait plusieurs hauteurs : arrivé aux avis, le visiteur a
 *   perdu de vue le prix ET le bouton. Ce panneau reste à côté de lui pendant
 *   toute la lecture — c'est la différence entre lire une fiche et demander
 *   une chambre.
 *
 * ⚠ L'ESTIMATION NE CONTIENT QUE DES CHIFFRES QUI EXISTENT EN BASE. La
 *   maquette montrait une ligne « taxe de séjour » : cette donnée n'est nulle
 *   part dans le schéma, aucun établissement ne l'a déclarée. L'inventer, même
 *   avec un montant plausible, ferait arriver le voyageur avec un total faux.
 *   La ligne apparaîtra le jour où la colonne existera et sera remplie.
 *
 * ⚠ POURQUOI `xl` ET NON `lg`. À 1024 px, la barre de navigation de gauche
 *   prend 224 px et ce panneau 340 : il reste 380 px à la fiche, moins que sur
 *   un téléphone. Le panneau mangeait l'écran qu'il devait servir.
 *
 * ⚠ CE N'EST PAS UNE RÉSERVATION, ET LE PANNEAU LE DIT. Diako met en relation
 *   et n'encaisse rien (TDR §1.2). Un panneau qui ressemble à un moteur de
 *   réservation sans en être un est la meilleure façon de décevoir au premier
 *   contact.
 */
export function PanneauDemande({
  fiche,
  onEcrire,
}: {
  fiche: Fiche;
  /** Ouvre la conversation avec l'établissement — même action qu'« Écrire ». */
  onEcrire: () => void;
}) {
  const [nuits, setNuits] = useState(1);

  // La chambre la moins chère porte le tarif d'appel : c'est elle qui doit
  // détailler l'estimation, pour que le total corresponde au « à partir de ».
  const chambre = useMemo(() => {
    const dispo = fiche.rooms.filter((c) => c.status === "active" && c.base_price_ar > 0);
    return dispo.length
      ? dispo.reduce((a, b) => (b.base_price_ar < a.base_price_ar ? b : a))
      : null;
  }, [fiche.rooms]);

  const hebergement = fiche.categories.includes("hotel") && chambre != null;
  const restaurant = fiche.categories.includes("restaurant");
  const tel = fiche.phone ?? fiche.whatsapp;
  const total = chambre ? chambre.base_price_ar * nuits : null;

  return (
    <aside className="dk-reveal sticky top-20 hidden h-fit w-[340px] shrink-0 space-y-3 xl:block">
      <div className="rounded-2xl border-2 border-primary/25 bg-card p-5 shadow-lg">
        <Prix
          montant={fiche.price_min_ar}
          base={unite(fiche.price_min_unit)}
          aPartirDe
          confirmeLe={fiche.rates_checked_at}
          taille="grande"
        />

        {/* ── L'estimation, ligne par ligne ─────────────────────────── */}
        {hebergement && chambre && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Nombre de nuits</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-input">
                <button
                  onClick={() => setNuits((n) => Math.max(1, n - 1))}
                  disabled={nuits <= 1}
                  aria-label="Une nuit de moins"
                  className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{nuits}</span>
                <button
                  onClick={() => setNuits((n) => Math.min(30, n + 1))}
                  disabled={nuits >= 30}
                  aria-label="Une nuit de plus"
                  className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </div>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="min-w-0 truncate text-muted-foreground">
                  {chambre.name} × {nuits}
                </dt>
                <dd className="shrink-0 font-medium tabular-nums">{ariary(total!)}</dd>
              </div>

              {/* Le supplément par personne existe en base sur certaines
                  chambres ; il est annoncé, pas ajouté au total : on ne sait
                  pas encore combien de personnes viennent. */}
              {chambre.extra_person_ar != null && chambre.extra_person_ar > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Personne en plus</dt>
                  <dd className="shrink-0 tabular-nums text-muted-foreground">
                    + {ariary(chambre.extra_person_ar)}
                  </dd>
                </div>
              )}

              {/* Les tarifs de saison sont saisis par le gérant. S'il y en a,
                  le total ci-dessus ne vaut pas pour toutes les dates — et le
                  taire serait pire que de l'écrire. */}
              {chambre.rates.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Selon la saison</dt>
                  <dd className="shrink-0 text-muted-foreground">
                    {chambre.rates.length} tarif{chambre.rates.length > 1 ? "s" : ""}
                  </dd>
                </div>
              )}

              <div className="flex justify-between gap-3 border-t border-border pt-2 text-[15px]">
                <dt className="font-semibold">Estimation</dt>
                <dd className="font-bold tabular-nums text-primary">{ariary(total!)}</dd>
              </div>
            </dl>
          </div>
        )}

        <button
          onClick={onEcrire}
          className="dk-onde mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-strong text-[15px] font-semibold text-accent-foreground"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {restaurant && !hebergement ? "Réserver une table" : "Demander la disponibilité"}
        </button>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {tel && (
            <a
              href={lienAppel(tel)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold"
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
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-xl border border-input text-sm font-semibold",
                !tel && "col-span-2"
              )}
            >
              WhatsApp
            </a>
          )}
        </div>

        {tel && (
          <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground">
            {afficherNumero(tel)}
          </p>
        )}

        {/* La promesse du produit, répétée là où l'on hésite. */}
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          Diako ne prend aucun paiement et ne bloque aucune date.
          {hebergement && " L'estimation reprend les tarifs publiés ; "}
          {hebergement ? "l'établissement confirme le total." : " L'établissement vous répond directement."}
        </p>
      </div>

      {(fiche.place || fiche.landmark) && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="dk-etiquette">Où c'est</p>
          {fiche.place && <p className="mt-1 text-sm font-semibold">{fiche.place.name}</p>}
          {fiche.landmark && (
            <p className="dk-secondaire mt-1 leading-relaxed">{fiche.landmark}</p>
          )}
          {fiche.lat != null && fiche.lng != null && (
            <Link
              to={`/carte?fiche=${fiche.slug}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Voir sur la carte
            </Link>
          )}
        </div>
      )}

      {/* Sur une fiche sans gérant, c'est le seul moteur de reprise en main —
          et 45 fiches sur 54 sont dans ce cas. */}
      {!fiche.owner_id && (
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="text-sm font-semibold">Vous gérez cet établissement ?</p>
          <p className="dk-secondaire mt-1 leading-relaxed">
            Réclamez la page pour corriger vos tarifs et répondre aux demandes.
          </p>
        </div>
      )}
    </aside>
  );
}
