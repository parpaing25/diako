import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  CircleAlert,
  MoonStar,
  Route,
  Ruler,
  ScanEye,
  Sunset,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dateEnFrancais,
  dureeFr,
  excursionsDepuis,
  heureFr,
  heureLimiteDeDepart,
  type Etape,
  type Graphe,
  type Plan,
} from "@/lib/trajet";
import ArretsEtape, { type ArretsDuLieu } from "./ArretsEtape";

/**
 * LE RÉSULTAT DU PLANIFICATEUR.
 *
 * ⚠ DEUX LECTURES DU MÊME TRAJET, DANS CET ORDRE : ce que donne l'addition
 *   brute (« d'une traite »), puis ce qu'on conseille (« en coupant la route »).
 *   Ne montrer que la seconde reviendrait à décider à la place du visiteur ;
 *   ne montrer que la première, à le laisser arriver à 1 h 30 du matin. Les
 *   deux chiffres viennent des mêmes durées relevées — rien n'est ajouté entre
 *   les deux.
 *
 * ⚠ LA MARGE AVANT LA NUIT EST LA VRAIE INFORMATION DE CETTE PAGE. « Arrivée
 *   16 h 00, coucher du soleil 17 h 38 » ne se lit pas d'un coup d'œil ;
 *   « 1 h 38 de marge » si.
 *
 * ⚠ AUCUNE CARTE. Les 43 lieux ont des coordonnées, mais tracer un segment
 *   droit d'Antananarivo à Antsirabe donnerait à voir une route qui n'existe
 *   pas — la RN7 fait 170 km pour 105 km à vol d'oiseau. Le projet ne dessine
 *   pas ce qu'il n'a pas mesuré.
 */

const minuteDuJour = (abs: number) => ((abs % 1440) + 1440) % 1440;
const jourDe = (abs: number) => Math.floor(abs / 1440);

function Etiquette({
  ton,
  icone: Icone,
  children,
}: {
  ton: "nuit" | "jour" | "neutre" | "saison";
  icone?: typeof MoonStar;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold leading-none",
        ton === "nuit" && "bg-accent/15 text-accent-strong",
        ton === "jour" && "bg-ok text-ok-foreground",
        ton === "saison" && "bg-warn-soft text-warn",
        ton === "neutre" && "bg-secondary text-muted-foreground"
      )}
    >
      {Icone && <Icone className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Une ligne du tableau d'une journée. */
function LigneEtape({ e }: { e: Etape }) {
  const lendemain = jourDe(e.arriveeAbs) - jourDe(e.departAbs);
  return (
    <tr className="bg-card align-top">
      <th scope="row" className="px-3 py-2.5 text-left font-medium">
        <Link to={`/lieu/${e.troncon.vers.slug}`} className="hover:text-primary">
          {e.troncon.de.nom} → {e.troncon.vers.nom}
        </Link>
        <span className="dk-secondaire mt-0.5 block">
          {e.troncon.etat ?? e.troncon.mode}
        </span>
        {e.troncon.sensInverse && (
          <span className="mt-1 inline-block">
            <Etiquette ton="neutre" icone={ArrowLeftRight}>
              relevé dans l'autre sens
            </Etiquette>
          </span>
        )}
        {!e.troncon.touteAnnee && (
          <span className="mt-1 inline-block">
            <Etiquette ton="saison" icone={CircleAlert}>
              pas toute l'année
            </Etiquette>
          </span>
        )}
      </th>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {e.troncon.km != null ? `${e.troncon.km} km` : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
        {dureeFr(e.troncon.heures * 60)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {heureFr(e.departAbs)} → {heureFr(e.arriveeAbs)}
        {lendemain > 0 && (
          <span className="dk-secondaire"> (+{lendemain} j)</span>
        )}
        {(e.arriveeDeNuit || e.traverseLaNuit) && (
          <span className="mt-1 block">
            <Etiquette ton="nuit" icone={MoonStar}>
              {e.arriveeDeNuit ? "arrivée de nuit" : "roule après le coucher"}
            </Etiquette>
          </span>
        )}
      </td>
    </tr>
  );
}

export default function ResultatTrajet({
  plan,
  graphe,
  arrets,
  chargementArrets,
}: {
  plan: Plan;
  graphe: Graphe;
  arrets: Map<string, ArretsDuLieu>;
  chargementArrets: boolean;
}) {
  const uneSeuleLecture = plan.journees.length === 1 && !plan.journees[0].nuitSubie;
  const parcourus = new Set<string>([
    plan.depart.slug,
    ...plan.troncons.map((t) => t.vers.slug),
  ]);
  const nbInverses = plan.troncons.filter((t) => t.sensInverse).length;

  return (
    <div className="mt-4 space-y-5">
      {/* ── Synthèse ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 sm:p-5">
        <p className="dk-etiquette inline-flex items-center gap-1.5">
          <Route className="h-3.5 w-3.5" aria-hidden="true" />
          {plan.troncons.length} tronçon{plan.troncons.length > 1 ? "s" : ""} relevé
          {plan.troncons.length > 1 ? "s" : ""}
        </p>
        <p className="dk-sous-titre mt-1">
          {plan.depart.nom} → {plan.arrivee.nom}
        </p>
        <p className="mt-2 text-2xl font-bold leading-none tabular-nums text-primary">
          {dureeFr(plan.heuresTotal * 60)}
          {plan.kmTotal != null && (
            <span className="text-base font-semibold text-foreground"> · {plan.kmTotal} km</span>
          )}
        </p>
        <p className="dk-secondaire mt-2 max-w-[70ch] leading-relaxed">
          Somme des durées <strong className="text-foreground">relevées sur le terrain</strong>,
          pauses non comprises. C'est un plancher : tout arrêt s'ajoute.
        </p>
      </div>

      {/* ── D'une traite ──────────────────────────────────────────────── */}
      <section
        className={cn(
          "rounded-2xl border p-4 sm:p-5",
          plan.traite.deNuit ? "border-accent/40 bg-accent/[0.07]" : "border-border bg-card"
        )}
      >
        <h3 className="dk-etiquette inline-flex items-center gap-1.5">
          <Sunset className="h-3.5 w-3.5" aria-hidden="true" />
          {uneSeuleLecture ? "Votre arrivée" : "Sans jamais vous arrêter"}
        </h3>
        <p className="mt-1.5 leading-relaxed">
          Départ le {dateEnFrancais(plan.journees[0].dateISO)} à{" "}
          <strong className="tabular-nums">{heureFr(plan.journees[0].debutAbs)}</strong> — arrivée{" "}
          {plan.traite.dateISO !== plan.journees[0].dateISO && (
            <>le {dateEnFrancais(plan.traite.dateISO)} </>
          )}
          à <strong className="tabular-nums">{heureFr(plan.traite.arriveeAbs)}</strong>.
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {plan.traite.soleilInconnu ? (
            <Etiquette ton="neutre" icone={ScanEye}>
              coucher du soleil inconnu à {plan.arrivee.nom}
            </Etiquette>
          ) : plan.traite.deNuit ? (
            <Etiquette ton="nuit" icone={MoonStar}>
              vous roulez de nuit
            </Etiquette>
          ) : (
            <Etiquette ton="jour" icone={Sunset}>
              arrivée avant la tombée de la nuit
            </Etiquette>
          )}
          {plan.traite.soleil && (
            <span className="dk-secondaire tabular-nums">
              coucher du soleil à {plan.arrivee.nom} : {heureFr(plan.traite.soleil.coucherMin)} ·
              nuit noire à {heureFr(plan.traite.soleil.nuitMin)}
            </span>
          )}
        </div>

        {plan.traite.deNuit && (
          <p className="mt-2.5 max-w-[70ch] text-sm leading-relaxed text-accent-strong">
            {plan.traite.retardSurLeSoleilMin != null && (
              <>
                Vous arriveriez{" "}
                <strong>{dureeFr(plan.traite.retardSurLeSoleilMin)} après le coucher du soleil</strong>
                .{" "}
              </>
            )}
            {plan.traite.nuits > 0 && (
              <>
                Le trajet traverse {plan.traite.nuits} nuit
                {plan.traite.nuits > 1 ? "s" : ""} entière{plan.traite.nuits > 1 ? "s" : ""}.{" "}
              </>
            )}
            Conduire après la tombée du jour à Madagascar, c'est croiser des piétons,
            des zébus et des véhicules sans feux sur une route sans éclairage.
          </p>
        )}
      </section>

      {/* ── Le découpage jour par jour ────────────────────────────────── */}
      {!uneSeuleLecture && (
        <p className="dk-etiquette">En coupant la route pour dormir</p>
      )}

      {plan.journees.map((j) => {
        const arriveeMin = minuteDuJour(j.arriveeAbs);
        const marge = j.soleil ? j.soleil.coucherMin - arriveeMin : null;
        const derniere = j.numero === plan.journees.length;
        return (
          <section key={j.numero} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="dk-sous-titre">
                {plan.journees.length > 1 && `Jour ${j.numero} — `}
                {dateEnFrancais(j.dateISO)}
              </h3>
              <p className="dk-secondaire">
                {derniere ? "Terme du voyage" : "Nuit"} : {j.arriveeSur.nom}
              </p>
            </div>

            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Tronçons du jour {j.numero}, avec distance, durée relevée et horaires
                </caption>
                <thead>
                  <tr className="bg-secondary/60 text-left">
                    <th scope="col" className="px-3 py-2 font-semibold">Tronçon</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Distance</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Durée réelle</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Horaire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {j.etapes.map((e) => (
                    <LigneEtape key={`${e.troncon.de.slug}-${e.troncon.vers.slug}-${e.departAbs}`} e={e} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* La marge sur le soleil, dite en une ligne. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                Arrivée {heureFr(j.arriveeAbs)}
                {j.dateArriveeISO !== j.dateISO && ` le ${dateEnFrancais(j.dateArriveeISO)}`}
              </span>
              {/* ⚠ « X avant la nuit » NE DOIT JAMAIS S'AFFICHER APRÈS UNE NUIT
                  DE ROUTE. Un tronçon de 24 h parti à 6 h arrive à 6 h : il
                  reste bien 11 h de jour devant, et l'écrire serait le plus
                  trompeur des chiffres justes. La marge ne se lit que sur une
                  journée qui n'a pas roulé dans le noir. */}
              {j.soleil == null ? (
                <Etiquette ton="neutre" icone={ScanEye}>
                  coucher du soleil inconnu ici
                </Etiquette>
              ) : marge != null && marge < 0 ? (
                <Etiquette ton="nuit" icone={MoonStar}>
                  {dureeFr(-marge)} après le coucher
                </Etiquette>
              ) : j.nuitSubie ? (
                <Etiquette ton="nuit" icone={MoonStar}>
                  au terme d'une nuit de route
                </Etiquette>
              ) : (
                <Etiquette ton="jour" icone={Sunset}>
                  {dureeFr(marge as number)} avant la nuit
                </Etiquette>
              )}
              {j.soleil && (
                <span className="dk-secondaire tabular-nums">
                  coucher {heureFr(j.soleil.coucherMin)}
                </span>
              )}
            </div>

            {/* ⚠ LE CAS QU'ON NE PEUT PAS RÉPARER, ET QU'ON NOMME. */}
            {j.nuitSubie && (
              <div className="mt-3 rounded-xl border border-accent/40 bg-accent/[0.07] p-3.5">
                <p className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-strong">
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                  Cette journée roule dans le noir, et nous ne pouvons pas la couper
                </p>
                <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed">
                  {j.etapes.length === 1 ? (
                    <>
                      Le tronçon {j.etapes[0].troncon.de.nom} → {j.etapes[0].troncon.vers.nom} est
                      relevé d'un seul tenant
                      {j.etapes[0].troncon.km != null && ` (${j.etapes[0].troncon.km} km, `}
                      {dureeFr(j.etapes[0].troncon.heures * 60)}
                      {j.etapes[0].troncon.km != null && ")"}. Nous n'avons relevé aucun point
                      d'arrêt intermédiaire sur cette route, et nous n'en inventerons pas.
                    </>
                  ) : (
                    <>
                      Aucun des lieux relevés sur ce tronçon n'est atteignable avant le coucher du
                      soleil à l'heure de départ choisie.
                    </>
                  )}
                </p>
                {/* ⚠ L'HEURE LIMITE N'A DE SENS QUE SUR UNE JOURNÉE D'UN SEUL
                    TRONÇON. Sur une journée qui en enchaîne plusieurs, reculer
                    le départ décale toute la chaîne : annoncer une heure
                    calculée sur le premier tronçon seul serait un chiffre
                    faux. On se tait plutôt que d'approcher. */}
                {(() => {
                  if (j.etapes.length !== 1) return null;
                  const e = j.etapes[0];
                  const limite = heureLimiteDeDepart(e);
                  if (limite == null || !e.soleil) return null;
                  // ⚠ Une limite NÉGATIVE veut dire « la veille au soir ».
                  //   `heureFr` la ramènerait dans la journée et afficherait
                  //   « partir à 17 h 39 » : une heure parfaitement plausible,
                  //   parfaitement fausse. On ne l'écrit pas, on dit pourquoi.
                  if (limite < 0)
                    return (
                      <p className="mt-1.5 text-sm leading-relaxed">
                        Ce tronçon dure plus longtemps qu'une journée entière : aucune heure
                        de départ ne permet d'arriver de jour.
                      </p>
                    );
                  return (
                    <p className="mt-1.5 text-sm leading-relaxed">
                      Pour arriver avant la nuit, il faudrait partir à{" "}
                      <strong className="tabular-nums">{heureFr(limite)}</strong>
                      {limite < e.soleil.leverMin ? (
                        <>
                          {" "}
                          — avant le lever du jour, qui est à{" "}
                          <span className="tabular-nums">{heureFr(e.soleil.leverMin)}</span>. Ce
                          tronçon ne tient pas dans une journée de lumière.
                        </>
                      ) : (
                        "."
                      )}
                    </p>
                  );
                })()}
              </div>
            )}

            {/* Où dormir / manger / passer, à l'étape. */}
            <div className="mt-4 border-t border-border pt-3">
              <p className="dk-etiquette">
                {derniere ? `À ${j.arriveeSur.nom}` : `L'étape : ${j.arriveeSur.nom}`}
              </p>
              <ArretsEtape
                lieu={j.arriveeSur}
                arrets={arrets.get(j.arriveeSur.slug) ?? null}
                excursions={excursionsDepuis(graphe, j.arriveeSur.slug, parcourus)}
                chargement={chargementArrets && !arrets.has(j.arriveeSur.slug)}
              />
            </div>
          </section>
        );
      })}

      {/* ── Contre-vérification ──────────────────────────────────────── */}
      {plan.direct && (
        <section className="rounded-2xl bg-secondary p-4 sm:p-5">
          <h3 className="dk-etiquette inline-flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
            Les deux relevés se recoupent
          </h3>
          <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed">
            Le référentiel porte aussi ce trajet <strong>d'un seul bloc</strong> :{" "}
            <span className="tabular-nums">
              {plan.direct.km != null && `${plan.direct.km} km, `}
              {dureeFr(plan.direct.heures * 60)}
            </span>
            . La somme des {plan.troncons.length} tronçons donne{" "}
            <span className="tabular-nums">
              {plan.kmTotal != null && `${plan.kmTotal} km, `}
              {dureeFr(plan.heuresTotal * 60)}
            </span>
            . Deux mesures indépendantes du même trajet, et elles concordent — c'est le
            meilleur contrôle qu'on puisse offrir sur ces chiffres.
          </p>
          {plan.direct.etat && (
            <p className="dk-secondaire mt-1.5">« {plan.direct.etat} »</p>
          )}
          {/* ⚠ ON N'AFFICHE PAS `price_ar`, MÊME QUAND IL EXISTE. La règle du
              projet veut qu'un montant ne paraisse jamais sans son unité, sa
              base et sa date de dernière confirmation ; `place_access` ne porte
              aucune des trois. « 80 000 Ar » sans savoir si c'est par personne,
              ni de quand date le relevé, se périme en silence — et un prix faux
              se retient mieux qu'un prix absent. Les transporteurs, eux, sont
              une donnée stable. */}
          {plan.direct.operateurs?.length ? (
            <p className="dk-secondaire mt-1.5">
              Transporteurs relevés : {plan.direct.operateurs.join(", ")}
            </p>
          ) : null}
        </section>
      )}

      {/* ── Ce que nous ne savons pas ─────────────────────────────────── */}
      <section className="rounded-2xl border border-dashed border-border p-4 sm:p-5">
        <h3 className="dk-etiquette inline-flex items-center gap-1.5">
          <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />
          Ce que ce calcul ne dit pas
        </h3>
        <ul className="mt-2 max-w-[70ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Aucune pause n'est comptée.</strong> Ni repas, ni carburant, ni contrôle
            routier. Ajoutez-les à la main.
          </li>
          {plan.saisonniers.length > 0 && (
            <li>
              <strong className="text-accent-strong">
                {plan.saisonniers.length} tronçon{plan.saisonniers.length > 1 ? "s" : ""} n'
                {plan.saisonniers.length > 1 ? "est" : "est"} pas praticable
                {plan.saisonniers.length > 1 ? "s" : ""} toute l'année
              </strong>{" "}
              :{" "}
              {plan.saisonniers.map((t, i) => (
                <span key={`${t.de.slug}-${t.vers.slug}`}>
                  {i > 0 && " ; "}
                  {t.de.nom} → {t.vers.nom}
                  {t.etat && ` (« ${t.etat} »)`}
                </span>
              ))}
              . Le relevé ne dit pas à quelles dates exactement.
            </li>
          )}
          {plan.sansCoordonnees.length > 0 && (
            <li>
              Nous n'avons pas les coordonnées de{" "}
              {plan.sansCoordonnees.map((l) => l.nom).join(", ")} : impossible d'y calculer
              l'heure du coucher du soleil, donc rien n'est affirmé sur la lumière à cette
              étape.
            </li>
          )}
          {nbInverses > 0 && (
            <li>
              {nbInverses} tronçon{nbInverses > 1 ? "s sont relevés" : " est relevé"} dans le
              sens opposé à votre trajet. La route est la même, la durée est celle mesurée en
              sens inverse — nous ne l'avons pas corrigée, car nous ne l'avons pas mesurée.
            </li>
          )}
          <li>
            Les heures de lever et de coucher sont <strong>calculées</strong> pour les
            coordonnées de chaque lieu, à la date choisie, en heure de Madagascar (UTC+3).
            Elles ne tiennent pas compte du relief : dans une vallée, la lumière tombe plus
            tôt.
          </li>
        </ul>
      </section>
    </div>
  );
}
