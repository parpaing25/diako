/* Bot de collecte Diako — interface locale. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const GENRES = {
  etablissement: "Établissement",
  carte: "Carte / menu",
  evenement: "Événement",
  recit: "Récit",
};

const CATEGORIES = {
  hotel: "Hébergement",
  restaurant: "Restaurant",
  agence_voyage: "Agence de voyage",
  guide: "Guide",
  transporteur: "Transport",
  location_vehicule: "Location de véhicule",
  site_attraction: "Site à visiter",
  organisateur_evenement: "Organisateur d'événements",
};

const UNITES = {
  "": "— ? —",
  nuit: "la nuit",
  plat: "le plat",
  personne: "par personne",
  jour: "la journée",
  circuit: "le circuit",
};

/* Les 11 valeurs que la contrainte `vehicle_offers_vehicle_type` accepte, et
   rien d'autre : un type hors liste ferait échouer l'INSERT ENTIER de la
   grille, pas seulement la ligne fautive. */
const TYPES_VEHICULE = {
  "4x4": "4x4",
  berline: "Berline",
  citadine: "Citadine",
  minibus: "Minibus",
  van: "Van",
  moto: "Moto",
  quad: "Quad",
  bateau: "Bateau",
  velo: "Vélo",
  camion: "Camion",
  autre: "Autre",
};

/* Tri-état. « oui », « non » et « le texte ne le dit pas » sont TROIS réponses
   différentes : `with_driver` a un défaut en base (avec chauffeur, la norme à
   Madagascar). Laisser vide, c'est laisser la base trancher ; écrire « non »,
   c'est affirmer ce qu'on n'a pas lu.

   ⚠ Une LISTE de paires, pas un objet : JavaScript remonte les clés qui
     ressemblent à des entiers en tête ({"":…, "1":…, "0":…} sort « non, oui,
     — ? — »), et la valeur neutre se retrouverait en dernier. */
const TRI_ETAT = [
  ["", "— ? —"],
  ["1", "oui"],
  ["0", "non"],
];

/* Les valeurs de `posts.kind`, telles que la contrainte les accepte. */
const GENRES_POST = {
  recit: "Récit", assiette: "Assiette", photo: "Photo", bon_plan: "Bon plan",
  avis: "Avis", alerte: "Alerte",
};

/* Les trous du site, dans l'ordre où ils comptent. `cle` est ce que rend
   /api/etat ; `total` sert à écrire « 3 356 sur 3 356 ». */
const TROUS = [
  { cle: "sans_photo", quoi: "fiches sans photo", sur: "fiches" },
  { cle: "restos_sans_carte", quoi: "restaurants sans carte" },
  { cle: "sans_contact", quoi: "fiches sans contact", sur: "fiches" },
  { cle: "sans_texte", quoi: "fiches sans description", sur: "fiches" },
  { cle: "hotels_sans_chambre", quoi: "hôtels sans tarif" },
  { cle: "lignes_de_carte", quoi: "lignes de carte en tout", inverse: true },
  { cle: "recits", quoi: "récits au fil", inverse: true },
  { cle: "evenements_a_venir", quoi: "événements à venir", inverse: true },
];

/* ⚠ `publier_directement` N'EST PAS ICI : il vit dans l'onglet Automatisation,
   à côté de la publication. Deux champs pour un même réglage finissent par
   s'écraser l'un l'autre, et c'est celui qui décide si une fiche part en ligne. */
const REGLAGES = {
  posts_max_par_source: "Publications max par source",
  scrolls_max_par_source: "Défilements max par source",
  posts_max_fil: "Publications max — fil d'actualité",
  scrolls_max_fil: "Défilements max — fil d'actualité",
  pages_max_par_site: "Pages max par site web",
  sites_max_par_collecte: "Sites web par collecte (0 = tous)",
  memoire_mini_mo: "Mémoire mini pour ouvrir Chromium (Mo)",
  llm_delai: "Délai maxi d'une relecture IA (s)",
  photos_max_par_trouvaille: "Photos max par trouvaille",
  largeur_photo_min: "Largeur mini d'une photo (px)",
  cote_photo_min: "Côté long mini pour une couverture (px)",
  cote_photo_max: "Côté long max à l'envoi (px)",
  qualite_photo: "Qualité JPEG (0-100)",
  jours_max: "Ignorer au-delà de (jours)",
  // Le réglage de fraîcheur. Une publication d'une année antérieure est
  // écartée ; celle dont la date est illisible passe quand même — sinon
  // 99 % de la collecte disparaîtrait (voir `collecteur.annee_de_publication`).
  annee_minimum: "Année minimale d'une publication",
  pause_entre_envois_photos: "Pause entre envois de photos (s)",
  navigateur_visible: "Afficher le navigateur",
  travailleurs: "Traitements en parallèle (hors Facebook)",
  garder_les_incompletes: "Garder les trouvailles incomplètes",
};

let etatFiltres = {
  statut: "a_trier", genre: "", source_id: 0, recherche: "", tri: "score", apport: "",
};
let ouverte = null;
let config = {};

/* ── Utilitaires ─────────────────────────────────────────────────── */
async function api(url, options = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const texte = await r.text();
  const data = texte ? JSON.parse(texte) : null;
  if (!r.ok) throw new Error(data?.detail || `Erreur ${r.status}`);
  return data;
}

let minuteurToast;
function toast(message, genre = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast ${genre}`;
  el.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => (el.hidden = true), 4600);
}

const echapper = (t) =>
  String(t ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

const nombre = (n) => (n == null ? "" : Number(n).toLocaleString("fr-FR"));
const ar = (n) => (n == null ? "" : nombre(n) + " Ar");

function prixLisible(t) {
  if (!t.prix_ar) return "";
  const unite = UNITES[t.prix_unite || ""] || "";
  return unite && unite !== "— ? —" ? `${ar(t.prix_ar)} ${unite}` : ar(t.prix_ar);
}

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

/* ── Onglets ─────────────────────────────────────────────────────── */
$$(".onglet").forEach((b) =>
  b.addEventListener("click", () => montrerVue(b.dataset.vue))
);

function montrerVue(nom) {
  $$(".onglet").forEach((o) => o.classList.toggle("actif", o.dataset.vue === nom));
  $$(".vue").forEach((v) => v.classList.toggle("active", v.id === `vue-${nom}`));
  if (nom === "trouvailles") chargerListe();
  if (nom === "sources") chargerSources();
  if (nom === "candidats") chargerCandidats();
  if (nom === "auto") chargerReglages().then(majRegles);
  if (nom === "reglages") chargerReglages();
}

$$("[data-vers-auto]").forEach((b) =>
  b.addEventListener("click", () => montrerVue("auto"))
);

$$(".lien-statut").forEach((b) =>
  b.addEventListener("click", () => {
    etatFiltres.statut = b.dataset.statut;
    etatFiltres.apport = "";
    $("#filtre-apport").value = "";
    $$("#filtres-statut .puce").forEach((p) =>
      p.classList.toggle("actif", p.dataset.statut === b.dataset.statut)
    );
    montrerVue("trouvailles");
  })
);

/* Les compteurs « plats récoltés » et « tarifs de chambre » sont les deux plus
   précieux du bandeau — et ils n'étaient que des nombres qu'on ne pouvait pas
   ouvrir. Un clic montre maintenant ce qu'ils comptent, TOUS statuts confondus :
   la question posée est « qu'ai-je récolté », pas « qu'ai-je à trier ». */
$$(".lien-apport").forEach((b) =>
  b.addEventListener("click", () => {
    etatFiltres.apport = b.dataset.apport;
    etatFiltres.statut = "tous";
    $("#filtre-apport").value = b.dataset.apport;
    $$("#filtres-statut .puce").forEach((p) =>
      p.classList.toggle("actif", p.dataset.statut === "tous")
    );
    montrerVue("trouvailles");
  })
);

/* ── État global (sondage) ───────────────────────────────────────── */
async function rafraichirEtat() {
  let e;
  try {
    e = await api("/api/etat");
  } catch {
    return;
  }
  const c = e.compteurs;
  ["a_trier", "validee", "publiee", "incomplete"].forEach(
    (k) => ($(`#n-${k}`).textContent = c[k])
  );
  $("#n-plats").textContent = c.plats;
  $("#n-chambres").textContent = c.chambres ?? 0;
  /* La perte silencieuse au grand jour : ces chambres ne partiront jamais
     tant que leur prix n'est pas saisi (base_price_ar est NOT NULL en prod). */
  $("#n-chambres-sans-prix").textContent = c.chambres_sans_prix ?? 0;
  $("#n-vehicules").textContent = c.vehicules ?? 0;
  // Les pastilles existent deux fois : rail (PC) et barre du bas (téléphone).
  $$(".pastille-trier").forEach((p) => {
    p.textContent = c.a_trier;
    p.classList.toggle("zero", !c.a_trier);
  });
  if (e.candidats !== undefined) {
    $$(".pastille-candidats").forEach((p) => {
      p.textContent = e.candidats;
      p.classList.toggle("zero", !e.candidats);
      p.classList.toggle("vif", e.candidats > 0);
    });
  }

  const occupe = e.tache.actif;
  majCompteFacebook(e.session_fb, occupe && e.tache.type === "connexion", e.sources_actives);
  majSante(e);
  majAujourdhui(e);

  // Sans compte Facebook, la collecte ne peut rien faire : on l'empêche plutôt
  // que de la laisser échouer dans le journal.
  // Un compte Facebook n'est plus indispensable : les sources « site web » se
  // lisent sans lui. On ne bloque donc que s'il n'y a aucune source du tout.
  $("#btn-collecte").disabled = occupe || !e.sources_actives;
  $("#btn-collecte-sans-ia").disabled = occupe || !e.sources_actives;
  majAideIA();
  $("#btn-lot").disabled = occupe;
  $("#btn-referentiel").disabled = occupe;
  $("#btn-moisson").disabled = occupe;
  $("#btn-arreter").disabled = !(occupe && e.tache.type === "collecte");

  const prog = $("#progression");
  prog.hidden = !occupe;
  if (occupe) {
    // ⭐ CE QUI EST ÉCARTÉ SE DIT PENDANT LA COLLECTE, pas seulement à la fin
    //   dans le journal. Un filtre trop sévère ressemble sinon à une source
    //   tarie : on lit « 0 retenue » sans savoir si Facebook n'a rien donné ou
    //   si le bot a tout jeté.
    //   ⚠ Les trois compteurs peuvent manquer : la page est servie du disque
    //     et le serveur en cours peut dater d'avant. `|| 0` partout.
    const ecartes = [
      [e.collecte.ecartes_immobilier || 0, "immobilier"],
      [e.collecte.ecartes_anciennes || 0, "trop ancienne(s)"],
      [e.collecte.ecartes_doublons || 0, "déjà collecté(s)"],
      [e.collecte.ecartes_hors_sujet || 0, "hors sujet (ventes, vœux, pubs)"],
    ].filter(([n]) => n > 0).map(([n, quoi]) => `${n} ${quoi}`);
    const libelles = {
      collecte: `Collecte${e.collecte.source ? " — " + e.collecte.source : ""} · ${e.collecte.trouvees} retenue(s)${c.en_traitement ? ` · ${c.en_traitement} en lecture` : ""}${ecartes.length ? ` · écarté : ${ecartes.join(", ")}` : ""}`,
      publication: `Publication en cours ${e.tache.detail || ""}`,
      referentiel: "Rechargement du référentiel Diako…",
      moisson: e.tache.detail || "Recherche des sites web…",
      connexion: "Fenêtre Facebook ouverte — connectez-vous dedans.",
    };
    $("#texte-progression").textContent = libelles[e.tache.type] || "Travail en cours…";
  }

  majManques(e.manques, e.referentiel);
  majPlanning(e.planning);

  $("#journal").innerHTML = e.journal
    .map(
      (l) =>
        `<li class="${l.niveau}"><time>${new Date(l.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
         <span>${echapper(l.message)}</span></li>`
    )
    .join("");
}

/* ── Les voyants du rail : le bot peut-il faire son travail maintenant ? ──
   Le 02/09/2026, le tableau de bord disait « Compte Facebook connecté, 409
   sources surveillées » pendant que la collecte de 18 h sautait sa partie
   Facebook faute de mémoire et que 311 trouvailles dormaient « en lecture ».
   Tout allait bien à l'écran ; rien n'allait. */
function dureeLisible(s) {
  if (s == null) return "";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
  return `${Math.floor(s / 86400)} j ${Math.round((s % 86400) / 3600)} h`;
}

function majSante(e) {
  const s = e.sante;
  if (!s) return;
  const occupe = e.tache.actif;
  const voyants = [];
  const enLecture = s.en_lecture || 0;
  voyants.push({
    classe: occupe ? "actif" : "ok",
    titre: occupe ? `Au travail : ${e.tache.type === "collecte" ? "collecte" : e.tache.type}` : "Bot en veille",
    detail: `tourne depuis ${dureeLisible(s.depuis_s)}` +
      (s.demarrages_24h > 1 ? `, ${s.demarrages_24h} démarrages en 24 h` : "") +
      (enLecture ? `, ${enLecture} en lecture` : ""),
  });
  voyants.push({
    classe: s.facebook ? "ok" : "ko",
    titre: s.facebook ? "Facebook connecté" : "Facebook : aucune session",
    detail: s.facebook ? `${e.sources_actives} sources surveillées` : "la partie Facebook sera sautée",
  });
  const ia = s.ia || {};
  voyants.push({
    classe: ia.ok === true ? "ok" : ia.ok === false ? "ko" : "moyen",
    titre: ia.ok === true ? "IA prête" : ia.ok === false ? "IA indisponible" : "IA : " + (ia.detail || "—"),
    detail: ia.ok === true ? ia.detail : ia.ok === false ? `${ia.detail}, lecture par règles` : ia.chemin || "",
  });
  const m = s.memoire || {};
  voyants.push({
    classe: m.ok === true ? "ok" : m.ok === false ? "ko" : "moyen",
    titre: m.libre_mo != null ? `${nombre(m.libre_mo)} Mo libres` : "Mémoire inconnue",
    detail: m.ok === false ? `il en faut ${m.mini_mo} pour ouvrir Chromium` : `seuil ${m.mini_mo} Mo pour Chromium`,
  });
  if (s.derniere_erreur) {
    voyants.push({ classe: "ko", titre: "Dernier plantage", detail: s.derniere_erreur.slice(0, 90) });
  }
  const html = voyants
    .map(
      (v) => `<div class="voyant ${v.classe}"><i></i><div><strong>${echapper(v.titre)}</strong><span>${echapper(v.detail)}</span></div></div>`
    )
    .join("");
  const rail = $("#voyants");
  if (rail) rail.innerHTML = html;
  const mobile = $("#voyants-mobile");
  if (mobile) mobile.innerHTML = html;
}

/* ── « Aujourd'hui » : l'objectif et les passages, pas un mur de compteurs ── */
function majAujourdhui(e) {
  const p = e.planning || {};
  const bloc = $("#aujourdhui");
  if (!bloc) return;
  const objectif = p.objectif || 0;
  const fait = p.collectees || 0;
  const part = objectif ? Math.min(1, fait / objectif) : 0;
  const cercle = $("#jauge-fait");
  if (cercle) cercle.style.strokeDashoffset = String(364.4 * (1 - part));
  $("#jauge-nombre").innerHTML = `${fait}<small>${objectif ? "/" + objectif : ""}</small>`;
  bloc.classList.toggle("atteint", Boolean(p.atteint));
  bloc.classList.toggle("eteint", !p.actif);

  const maintenant = new Date();
  const heures = p.heures || [];
  const enCours = e.tache.actif && e.tache.type === "collecte";
  const passages = heures.map((h, i) => {
    const [hh, mm] = h.split(":").map(Number);
    const moment = new Date(); moment.setHours(hh, mm, 0, 0);
    const suivant = heures[i + 1];
    let etat = moment > maintenant ? "a-venir" : "fait";
    let libelle = moment > maintenant ? "à venir" : "passé";
    if (enCours && moment <= maintenant) {
      const finFenetre = suivant ? (() => { const [sh, sm] = suivant.split(":").map(Number); const d = new Date(); d.setHours(sh, sm, 0, 0); return d; })() : null;
      if (!finFenetre || maintenant < finFenetre) { etat = "en-cours"; libelle = "en cours"; }
    }
    return `<div class="passage ${etat}"><i></i><b>${h}</b><span>${libelle}</span></div>`;
  });
  $("#passages").innerHTML = passages.join("");

  const reste = Math.max(0, objectif - fait);
  let phrase;
  if (!p.actif) phrase = "Collectes automatiques éteintes : seul le bouton ramène des trouvailles.";
  else if (enCours) phrase = `Collecte en cours${e.collecte.source ? ", " + e.collecte.source : ""}.`;
  else if (p.atteint) phrase = `Objectif atteint. Prochain passage ${p.prochain || "—"}.`;
  else phrase = `Encore ${reste} à trouver. Prochain passage ${p.prochain || "—"}. Un passage manqué se rattrape jusqu'au suivant.`;
  $("#aujourdhui-phrase").textContent = phrase;
  $("#aujourdhui-titre").textContent = maintenant.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());
}

function majManques(m, referentiel) {
  const zone = $("#manques");
  if (!m || !Object.keys(m).length) {
    zone.innerHTML = `<p class="aide">Référentiel injoignable — impossible de
      mesurer les trous. Vérifiez le jeton Supabase (voir LISEZ-MOI, § Secrets).</p>`;
  } else {
    zone.innerHTML = TROUS.map((t) => {
      const valeur = m[t.cle] ?? 0;
      const total = t.sur ? m[t.sur] : null;
      // La barre montre ce qui est COMBLÉ : sur 3 689 fiches, 3 396 sans
      // photo = 8 % illustrées. C'est ce pourcentage qui doit monter.
      const comble = total ? Math.max(0, Math.min(1, 1 - valeur / total)) : null;
      return `<div class="trou ${t.inverse ? "comble" : ""}">
        <span class="quoi">${t.quoi}</span>
        <span><span class="chiffre-trou">${nombre(valeur)}</span>${
          total ? `<span class="etiquette"> / ${nombre(total)}</span>` : ""
        }</span>
        ${comble != null ? `<span class="jauge-trou" title="${Math.round(comble * 100)} % comblé"><i style="width:${(comble * 100).toFixed(1)}%"></i></span>` : ""}
      </div>`;
    }).join("");
  }

  const r = referentiel || {};
  const vieux = (r.age_heures ?? 999) > 24;
  $("#etat-referentiel").innerHTML =
    `<span class="pastille-etat ${r.ref_pages ? (vieux ? "ko" : "ok") : "ko"}">` +
    `${nombre(r.ref_pages || 0)} fiches · ${nombre(r.ref_lieux || 0)} lieux en cache</span>` +
    `<span>${
      !r.ref_pages
        ? "Aucun rapprochement possible tant que le référentiel n'est pas chargé."
        : vieux
        ? `Chargé il y a ${Math.round(r.age_heures)} h — pensez à le recharger.`
        : `Chargé il y a ${r.age_heures} h.`
    }</span>`;
}

/* Le plan de la journée : ce qui se passera sans vous, dans l'ordre.
   Il est rendu à deux endroits — tableau de bord et onglet Automatisation —
   pour qu'on n'ait jamais à deviner l'état des réglages. */
/* Dire, à l'endroit où l'on clique, ce que le modèle apporte et ce qu'il ne
   décide pas. La question « est-ce que ça marche sans Claude ? » doit trouver
   sa réponse sur le bouton, pas dans un fichier. */
function majAideIA() {
  const zone = $("#aide-ia");
  if (!zone) return;
  const actif = Boolean(config.llm_actif);
  const chemin =
    config.llm_transport === "anthropic"
      ? "API Claude (payante)"
      : "passerelle locale — abonnement, coût nul";
  zone.innerHTML = actif
    ? `<strong>Avec l'IA</strong> (${echapper(chemin)}) : elle comprend le texte
       libre, structure les grilles de tarifs et <strong>transcrit les cartes
       photographiées</strong>. <em>Sans l'IA</em>, la collecte tourne quand même —
       lecture par règles : numéros, montants, dates, mots-clés. Ce qu'on perd,
       ce sont surtout les cartes en photo.`
    : `<strong>IA éteinte</strong> — lecture par règles seulement. Le bouton
       principal collecte donc déjà sans elle. Pour l'allumer :
       <button class="lien-discret" data-vers-auto>Automatisation</button>.`;
  $$("[data-vers-auto]", zone).forEach((b) =>
    b.addEventListener("click", () => montrerVue("auto"))
  );
}

function majPlan(auto) {
  if (!auto) return;
  const html = (auto.lignes || [])
    .map(
      (l) => `<div class="plan-ligne ${l.actif ? "" : "eteint"} ${
        l.danger ? "danger" : ""
      }">
        <span class="plan-quoi">${echapper(l.quoi)}</span>
        <span class="plan-quand">${echapper(l.quand)}</span>
        <span class="plan-detail">${echapper(l.detail)}</span>
      </div>`
    )
    .join("");
  ["#plan-auto", "#plan-auto-2"].forEach((sel) => {
    const zone = $(sel);
    if (zone) zone.innerHTML = html;
  });
}

function majPlanning(p) {
  if (!p) return;
  majPlan(p.automatisation);
  const zone = $("#etat-planning");
  const reste = Math.max(0, (p.objectif || 0) - p.collectees);
  if (!p.actif) {
    zone.innerHTML = `<span class="pastille-etat ko">Collectes automatiques éteintes</span>
      <span>Seul le bouton « Lancer la collecte » ramène des trouvailles.</span>`;
  } else {
    zone.innerHTML =
      `<span class="pastille-etat ${p.atteint ? "ok" : ""}">` +
      `${p.collectees}${p.objectif ? " / " + p.objectif : ""} aujourd'hui</span>` +
      `<span>${
        p.atteint ? "Objectif atteint." : p.objectif ? `Encore ${reste} à trouver.` : ""
      } Passages : ${p.heures.join(" et ")}${
        p.prochain ? ` · prochain ${p.prochain}` : ""
      }.</span>`;
  }
  // Les heures ne sont remplies qu'au premier affichage : sinon on écraserait
  // ce qu'on est en train de taper.
  const champ = $("#heures-collecte");
  if (champ && document.activeElement !== champ && !champ.dataset.rempli) {
    champ.value = (p.heures || []).join(", ");
    champ.dataset.rempli = "1";
  }
}

/* ── Compte Facebook ─────────────────────────────────────────────── */
function majCompteFacebook(connecte, enCours, sourcesActives) {
  $$(".etat-fb").forEach((pastille) => pastille.classList.toggle("ok", connecte));
  $("#etat-fb-texte").textContent = enCours
    ? "Facebook : connexion…"
    : connecte
    ? "Facebook : connecté"
    : "Facebook : non connecté";

  $("#banniere-fb").hidden = connecte || enCours;
  $("#btn-connexion-banniere").disabled = enCours;

  const ligne = $("#ligne-compte");
  if (enCours) {
    ligne.innerHTML = `<span class="pastille-etat ko">Fenêtre Facebook ouverte</span>
      <span>Connectez-vous dedans ; elle se fermera toute seule.</span>`;
  } else if (!connecte) {
    ligne.innerHTML = `<span class="pastille-etat ko">Aucun compte Facebook</span>
      <span>La collecte est bloquée tant qu'un compte n'est pas branché.</span>
      <button class="lien-discret" data-connecter>Connecter un compte</button>`;
  } else {
    ligne.innerHTML = `<span class="pastille-etat ok">Compte Facebook connecté</span>
      <span>${
        !sourcesActives
          ? "Ajoutez une source dans l'onglet Sources — ou une des recherches suggérées."
          : `${sourcesActives} source${sourcesActives > 1 ? "s" : ""} surveillée${sourcesActives > 1 ? "s" : ""}.`
      }</span>
      <button class="lien-discret" data-deconnecter>Changer de compte</button>`;
  }

  $$("[data-connecter]").forEach((b) => (b.onclick = connecterFacebook));
  $$("[data-deconnecter]").forEach((b) => (b.onclick = deconnecterFacebook));
}

async function connecterFacebook() {
  try {
    await api("/api/facebook/connexion", { method: "POST" });
    toast("Une fenêtre Facebook s'ouvre — connectez-vous dedans.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
}

async function deconnecterFacebook() {
  if (!confirm("Oublier le compte Facebook enregistré sur ce PC ?")) return;
  try {
    await api("/api/facebook/session", { method: "DELETE" });
    toast("Compte oublié — reconnectez-vous quand vous voulez.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
}

$("#btn-connexion-banniere").addEventListener("click", connecterFacebook);
$$(".etat-fb").forEach((b) =>
  b.addEventListener("click", () => {
    montrerVue("bord");
    window.scrollTo({ top: 0, behavior: "smooth" });
  })
);

/* ── Boutons du tableau de bord ──────────────────────────────────── */
/* Deux boutons, un seul chemin. `ia` ne surcharge que CE passage : partir sans
   le modèle parce que la passerelle est tombée ne doit pas éteindre la
   relecture pour les collectes de 11 h et 18 h. */
async function lancerCollecte(ia) {
  try {
    await api(`/api/collecte/lancer${ia === undefined ? "" : "?ia=" + ia}`, {
      method: "POST",
    });
    toast(ia === "0" ? "Collecte lancée — sans l'IA." : "Collecte lancée.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
}

$("#btn-collecte").addEventListener("click", () => lancerCollecte());
$("#btn-collecte-sans-ia").addEventListener("click", () => lancerCollecte("0"));

$("#btn-arreter").addEventListener("click", async () => {
  await api("/api/collecte/arreter", { method: "POST" });
  toast("Arrêt demandé.");
});

$("#btn-referentiel").addEventListener("click", async () => {
  try {
    await api("/api/referentiel/recharger", { method: "POST" });
    toast("Rechargement du référentiel lancé — suivez le journal.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
});

$("#btn-moisson").addEventListener("click", async () => {
  try {
    await api("/api/moisson-sites", { method: "POST" });
    toast("Recherche des sites lancée — OpenStreetMap peut prendre deux minutes.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
});

$("#btn-lot").addEventListener("click", async () => {
  if (!confirm("Publier toutes les trouvailles validées sur Diako ?")) return;
  try {
    const r = await api("/api/publier-lot", { method: "POST" });
    toast(`${r.nombre} trouvaille(s) en cours de publication…`);
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
});

/* ── Suggestions de recherche ────────────────────────────────────── */
async function chargerSuggestions() {
  const zone = $("#suggestions");
  try {
    const liste = await api("/api/suggestions");
    zone.innerHTML = liste
      .map(
        (s, i) => `<div class="suggestion">
          <span class="termes">${echapper(s.termes)}</span>
          <span class="pourquoi">${echapper(s.pourquoi)}</span>
          <button class="bouton" data-suggestion="${i}">Ajouter aux sources</button>
        </div>`
      )
      .join("");
    $$("[data-suggestion]", zone).forEach((b) =>
      b.addEventListener("click", async () => {
        const s = liste[Number(b.dataset.suggestion)];
        b.disabled = true;
        try {
          await api("/api/sources", {
            method: "POST",
            body: JSON.stringify({ nom: "", url: s.termes }),
          });
          b.textContent = "Ajoutée ✓";
          chargerSources();
        } catch (e) {
          b.disabled = false;
          toast(e.message, "erreur");
        }
      })
    );
  } catch (e) {
    zone.innerHTML = `<p class="aide">Suggestions indisponibles : ${echapper(e.message)}</p>`;
  }
}

/* ── Liste des trouvailles ───────────────────────────────────────── */
$$("#filtres-statut .puce").forEach((p) =>
  p.addEventListener("click", () => {
    $$("#filtres-statut .puce").forEach((x) => x.classList.remove("actif"));
    p.classList.add("actif");
    etatFiltres.statut = p.dataset.statut;
    chargerListe();
  })
);
$("#filtre-genre").addEventListener("change", (e) => {
  etatFiltres.genre = e.target.value;
  chargerListe();
});
$("#filtre-apport").addEventListener("change", (e) => {
  etatFiltres.apport = e.target.value;
  chargerListe();
});
$("#filtre-source").addEventListener("change", (e) => {
  etatFiltres.source_id = Number(e.target.value);
  chargerListe();
});
$("#tri").addEventListener("change", (e) => {
  etatFiltres.tri = e.target.value;
  chargerListe();
});
let minuteurRecherche;
$("#recherche").addEventListener("input", (e) => {
  clearTimeout(minuteurRecherche);
  minuteurRecherche = setTimeout(() => {
    etatFiltres.recherche = e.target.value.trim();
    chargerListe();
  }, 300);
});

/* ── Regrouper ce qui vient du même établissement ─────────────────────────
 *
 * ⭐ POURQUOI (mesuré le 24/08/2026 sur les 2 217 trouvailles de la base) :
 *    84 établissements reviennent au moins deux fois et totalisent 1 238
 *    trouvailles — 83 pour « Nosy Be Hôtel & Spa », 61 pour l'« Hôtel
 *    Carlton », 55 pour « KIBAN HOTEL Nosy Be ». Les trier une par une, c'est
 *    ouvrir 61 panneaux pour remplir UNE fiche Diako. Repliés, ils tiennent en
 *    une ligne qu'on déplie quand on veut.
 *
 * ⚠ CE CODE DOIT MARCHER AVEC L'ANCIEN SERVEUR. La page est servie du disque
 *   alors que le processus en cours peut dater d'avant ce changement :
 *   `groupe_cle` sera alors absent de la réponse. On le recalcule ici à
 *   l'identique — mêmes clés, même ordre que `base.cle_entite` — plutôt que
 *   d'appeler une route qui n'existe pas encore.
 */
const groupesOuverts = new Set();

function cleEntite(t) {
  if (t.groupe_cle !== undefined) return t.groupe_cle;
  if (t.page_id) return `fiche:${t.page_id}`;
  const page = (t.page_facebook || "").trim().toLowerCase().replace(/\/+$/, "");
  if (page) return `fb:${page}`;
  // ⚠ NFKD + suppression des diacritiques, comme `base.cle_entite` :
  //   « Hôtel Carlton » et « Hotel Carlton » sont le même établissement.
  const nom = (t.nom_etab || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return nom.length >= 3 ? `nom:${nom}` : "";
}

function nomEntite(t) {
  // ⚠ Coupé à 60 : `nom_etab` est extrait d'un texte et ramasse parfois une
  //   phrase entière (« 𝗩𝗼𝘆𝗮𝗴𝗲𝗿, 𝗰'𝗲𝘀𝘁 𝗱𝗲́𝗰𝗼𝘂𝘃𝗿𝗶𝗿… » coiffait un groupe de
  //   52 publications). `normalize("NFKC")` ramène le gras Unicode à des
  //   lettres ordinaires — sinon le titre du bloc est illisible.
  // ⚠ « Nosy Be Hôtel & Spa est à Nosy Be Hôtel & Spa. » est le libellé d'un
  //   enregistrement de lieu, et il coiffe le plus gros groupe de la base
  //   (83 publications). On coupe à la tournure, comme `base.nom_entite`.
  const brut = (t.groupe_nom || t.page_nom || t.nom_etab || t.page_facebook || "")
    .normalize("NFKC")
    .split(/\s+(?:est à|est chez|a actualisé|est en direct)\b/)[0]
    .replace(/^[\s.,–—-]+|[\s.,–—-]+$/g, "");
  return brut.length > 60 ? brut.slice(0, 60).trimEnd() + "…" : brut;
}

function blocGroupe(cle, membres) {
  const nom = nomEntite(membres[0]) || "Établissement sans nom";
  // `groupe_total` compte AUSSI ce que la limite de 300 lignes a laissé
  // derrière ; sans lui on annoncerait douze publications là où il y en a 61.
  const total = membres[0].groupe_total || membres.length;
  const reste = total > membres.length ? ` · ${total} en tout` : "";
  const photos = membres.reduce((n, t) => n + (t.nb_photos || 0), 0);
  const meilleur = Math.max(...membres.map((t) => t.score || 0));
  return `<details class="groupe"${groupesOuverts.has(cle) ? " open" : ""}
      data-groupe="${echapper(cle)}">
    <summary>
      <span class="groupe-nom">${echapper(nom)}</span>
      <span class="groupe-compte">${membres.length} publication${
        membres.length > 1 ? "s" : ""
      }${reste}</span>
      <span class="groupe-chiffres">${photos} photo${photos > 1 ? "s" : ""} ·
        meilleur score ${meilleur}</span>
      <button type="button" class="groupe-cocher"
        title="Cocher ou décocher tout le groupe">Tout cocher</button>
    </summary>
    <div class="groupe-corps">${membres.map(carte).join("")}</div>
  </details>`;
}

function grilleGroupee(liste) {
  const par = new Map();
  for (const t of liste) {
    const cle = cleEntite(t);
    if (!cle) continue;
    if (!par.has(cle)) par.set(cle, []);
    par.get(cle).push(t);
  }
  // L'ordre de la liste est celui du tri choisi : le groupe prend la place de
  // son premier membre, il ne remonte ni ne descend.
  const sortis = new Set();
  const blocs = [];
  for (const t of liste) {
    const cle = cleEntite(t);
    const membres = cle ? par.get(cle) : null;
    if (!membres || membres.length < 2) {
      blocs.push(carte(t));
      continue;
    }
    if (sortis.has(cle)) continue;
    sortis.add(cle);
    blocs.push(blocGroupe(cle, membres));
  }
  return blocs.join("");
}

async function chargerListe() {
  const q = new URLSearchParams(etatFiltres);
  const liste = await api(`/api/trouvailles?${q}`);
  const grille = $("#grille");
  $("#vide").hidden = liste.length > 0;
  grille.innerHTML = grilleGroupee(liste);
  $$("details.groupe", grille).forEach((d) =>
    d.addEventListener("toggle", () => {
      // Un groupe déplié le reste au rafraîchissement suivant : sinon il se
      // referme sous les doigts toutes les deux secondes.
      d.open ? groupesOuverts.add(d.dataset.groupe)
             : groupesOuverts.delete(d.dataset.groupe);
    })
  );
  $$(".groupe-cocher", grille).forEach((b) =>
    b.addEventListener("click", (e) => {
      // Dans un <summary>, le clic par défaut ouvre ou ferme le bloc.
      e.preventDefault();
      e.stopPropagation();
      const cases = $$("[data-choix-annonce]", b.closest("details.groupe"));
      const toutCoche = cases.every((c) => c.checked);
      cases.forEach((c) => {
        c.checked = !toutCoche;
        c.checked
          ? cochesTrouvailles.add(c.dataset.choixAnnonce)
          : cochesTrouvailles.delete(c.dataset.choixAnnonce);
        c.closest(".annonce-enveloppe").classList.toggle("cochee", c.checked);
      });
      majChoixTrouvailles();
    })
  );
  $$(".annonce", grille).forEach((el) =>
    el.addEventListener("click", () => ouvrir(el.dataset.id))
  );
  $$("[data-choix-annonce]", grille).forEach((c) =>
    c.addEventListener("change", () => {
      const id = c.dataset.choixAnnonce;
      c.checked ? cochesTrouvailles.add(id) : cochesTrouvailles.delete(id);
      c.closest(".annonce-enveloppe").classList.toggle("cochee", c.checked);
      majChoixTrouvailles();
    })
  );
  // Une trouvaille cochée puis filtrée hors de la vue serait triée sans qu'on
  // la voie : on ne garde que ce qui est à l'écran.
  const visibles = new Set(liste.map((x) => x.id));
  [...cochesTrouvailles].forEach((id) => visibles.has(id) || cochesTrouvailles.delete(id));
  majChoixTrouvailles();
}

/* ── Tri groupé : cocher les cartes plutôt qu'ouvrir cinquante panneaux ── */
function majChoixTrouvailles() {
  const n = cochesTrouvailles.size;
  $("#choix-compte").textContent = `${n} sélectionnée(s)`;
  $("#barre-choix").hidden = n === 0;
}

async function trierChoisies(action) {
  const n = cochesTrouvailles.size;
  if (!n) return;
  const mot = action === "valider" ? "Valider" : "Rejeter";
  if (!confirm(`${mot} ${n} trouvaille(s) ?`)) return;
  try {
    const r = await api("/api/trouvailles/lot-choisi", {
      method: "POST",
      body: JSON.stringify({ ids: [...cochesTrouvailles], action }),
    });
    cochesTrouvailles.clear();
    // ⚠ Une trouvaille laissée de côté sans explication passe pour un bug. On
    //   nomme les premières et ce qui leur manque.
    const refuses = r.refuses || [];
    if (refuses.length) {
      const detail = refuses
        .slice(0, 3)
        .map((x) => `« ${x.titre || "sans titre"} » : ${x.manques.join(", ")}`)
        .join(" · ");
      toast(
        `${r.nombre} faite(s). ${refuses.length} laissée(s) — ${detail}` +
          (refuses.length > 3 ? "…" : ""),
        "erreur"
      );
    } else {
      toast(`${r.nombre} trouvaille(s) ${action === "valider" ? "validée(s)" : "rejetée(s)"}.`);
    }
  } catch (e) {
    toast(e.message, "erreur");
  }
  chargerListe();
  rafraichirEtat();
}

$("#choix-valider").addEventListener("click", () => trierChoisies("valider"));
$("#choix-rejeter").addEventListener("click", () => trierChoisies("rejeter"));
$("#choix-tout").addEventListener("click", (e) => {
  e.preventDefault();
  $$("[data-choix-annonce]").forEach((c) => {
    c.checked = true;
    cochesTrouvailles.add(c.dataset.choixAnnonce);
    c.closest(".annonce-enveloppe").classList.add("cochee");
  });
  majChoixTrouvailles();
});
$("#choix-rien").addEventListener("click", (e) => {
  e.preventDefault();
  $$("[data-choix-annonce]").forEach((c) => {
    c.checked = false;
    c.closest(".annonce-enveloppe").classList.remove("cochee");
  });
  cochesTrouvailles.clear();
  majChoixTrouvailles();
});

function carte(t) {
  const image = t.vignette
    ? `style="background-image:url('/photo/${t.id}/${t.vignette}')"`
    : "";
  const badges = [
    ...(t.manques || []).map((m) => `<span class="badge manque">${echapper(m)} ?</span>`),
    t.page_id ? `<span class="badge etab">${echapper(t.page_nom || "fiche")}</span>` : "",
    t.lieu_nom ? `<span class="badge lieu">${echapper(t.lieu_nom)}</span>` : "",
    t.nb_plats ? `<span class="badge plat">${t.nb_plats} plats</span>` : "",
    t.nb_chambres ? `<span class="badge etab">${t.nb_chambres} chambres</span>` : "",
    t.nb_circuits ? `<span class="badge lieu">${t.nb_circuits} circuits</span>` : "",
    t.nb_vehicules ? `<span class="badge vehicule">${t.nb_vehicules} véhicules</span>` : "",
    t.source_genre === "site" ? `<span class="badge recherche">site web</span>` : "",
    t.statut === "publiee" ? `<span class="badge ok">publiée</span>` : "",
    t.statut === "doublon" ? `<span class="badge doublon">doublon</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  // La case vit HORS du bouton : imbriquer un contrôle cliquable dans un
  // <button> est invalide, et le clic ouvrirait le panneau au lieu de cocher.
  return `<div class="annonce-enveloppe${cochesTrouvailles.has(t.id) ? " cochee" : ""}">
    <label class="annonce-choix" title="Sélectionner pour un tri groupé">
      <input type="checkbox" data-choix-annonce="${t.id}" ${
        cochesTrouvailles.has(t.id) ? "checked" : ""
      }>
    </label>
    <button class="annonce" data-id="${t.id}">
    <div class="vignette" ${image}>${t.vignette ? "" : '<span class="sans">sans photo</span>'}
      <span class="note ${t.niveau || "faible"}" title="Score de tri sur 100">${t.score ?? 0}</span>
      ${t.lu_par_llm ? `<span class="puce-ia" title="Relue par l'IA">IA</span>` : ""}
      <span class="genre">${GENRES[t.genre] || t.genre}</span>
      ${t.nb_photos ? `<span class="nb-photos">${t.nb_photos} photo${t.nb_photos > 1 ? "s" : ""}</span>` : ""}
    </div>
    <div class="annonce-corps">
      <h3>${echapper(t.titre || t.nom_etab || "Sans titre")}</h3>
      ${t.prix_ar ? `<span class="prix">${prixLisible(t)}</span>` : ""}
      <div class="meta">
        <span>${echapper(t.lieu_nom || t.lieu_texte || "lieu ?")}</span>
        ${t.telephone ? `<span>${echapper(t.telephone)}</span>` : ""}
      </div>
      <div class="badges">${badges}</div>
    </div>
    </button>
  </div>`;
}

/* ── Panneau de détail ───────────────────────────────────────────── */
async function ouvrir(id) {
  ouverte = await api(`/api/trouvailles/${id}`);
  const t = ouverte;
  try {
    t._score = await api(`/api/trouvailles/${id}/score`);
  } catch {
    t._score = null;
  }
  $("#p-titre").textContent = t.titre || GENRES[t.genre] || "Trouvaille";
  $("#p-source").innerHTML =
    `${echapper(t.source_nom || "")} · ${echapper(t.auteur || "auteur inconnu")}` +
    // ⚠ « Date inconnue » se dit, elle ne se cache pas. Avant le 24/08/2026 le
    //   bot inscrivait la date du jour dès qu'il ne savait pas lire celle de
    //   Facebook : la ligne affichait donc TOUJOURS une date, et toujours la
    //   bonne en apparence. Un blanc silencieux referait la même illusion.
    (t.date_post
      ? ` · ${jour(t.date_post)}`
      : ` · <span class="sans-date">date de publication inconnue</span>`) +
    (t.permalien
      ? ` · <a class="lien-post" href="${t.permalien}" target="_blank" rel="noreferrer">voir sur Facebook</a>`
      : "");
  $("#panneau-contenu").innerHTML = corpsPanneau(t);
  $("#panneau").hidden = false;
  brancherPanneau();

  const bloquants = t.bloquants || [];
  $("#p-publier").disabled = t.statut === "publiee" || bloquants.length > 0;
  $("#p-publier").title = bloquants.length ? "À compléter : " + bloquants.join(", ") : "";
  $("#p-publier").textContent =
    t.statut === "publiee" ? "Déjà publiée" : "Publier sur Diako";
}

function corpsPanneau(t) {
  const opt = (o, v) =>
    Object.entries(o)
      .map(([k, l]) => `<option value="${k}" ${k === (v ?? "") ? "selected" : ""}>${l}</option>`)
      .join("");

  const champ = (cle, label, valeur, type = "text") =>
    `<div class="champ"><label>${label}</label>
      <input data-champ="${cle}" type="${type}" value="${echapper(valeur ?? "")}"></div>`;

  const zone = (cle, label, valeur, lignes = 4) =>
    `<div class="champ large"><label>${label}</label>
      <textarea data-champ="${cle}" rows="${lignes}">${echapper(valeur ?? "")}</textarea></div>`;

  const barres = (t._score?.details || [])
    .map(
      (d) => `<div class="brique">
        <span class="brique-nom">${d.cle}</span>
        <span class="brique-jauge"><i style="width:${(d.points / d.sur) * 100}%"></i></span>
        <span class="brique-val">${d.points}/${d.sur}</span>
        <span class="brique-motif">${echapper(d.motif)}</span>
      </div>`
    )
    .join("");
  const alertes = (t._score?.alertes || []).map((m) => `<li>${echapper(m)}</li>`).join("");

  const bloquants = t.bloquants || [];
  const avertissement = bloquants.length
    ? `<p class="bloc-manquant">Impossible de publier tant qu'il manque :
       <strong>${bloquants.map(echapper).join(", ")}</strong></p>`
    : "";

  return `
    ${avertissement}
    <div class="bandeau-score ${t.niveau || "faible"}">
      <span class="gros-score">${t.score ?? 0}<small>/100</small></span>
      <div class="score-corps">
        <strong>${t.niveau || "—"}</strong>
        ${alertes ? `<ul class="score-alertes">${alertes}</ul>` : ""}
        <div class="briques">${barres}</div>
      </div>
    </div>

    ${t.lu_par_llm
      ? `<p class="note-ia">Relue par l'IA${t.llm_confiance != null ? ` — confiance ${t.llm_confiance}/100` : ""}${
          t.llm_doute ? ` · ${echapper(t.llm_doute)}` : ""
        }</p>`
      : `<p class="note-ia discret">Lecture par règles seulement.
         <button class="lien-discret" id="btn-relire">Faire relire par l'IA</button></p>`}

    ${blocApports(t)}

    ${blocRapprochement(t)}

    <p class="bloc-titre">Genre et lieu</p>
    <div class="champs">
      <div class="champ"><label>Nature de la trouvaille</label>
        <select data-champ="genre">${opt(GENRES, t.genre)}</select></div>
      <div class="champ"><label>Lieu du référentiel</label>
        <input id="rech-lieu" placeholder="chercher un lieu…"
               value="${echapper(t.lieu_nom || t.lieu_texte || "")}"></div>
      <div class="champ large"><div id="resultats-lieu"></div></div>
    </div>

    <p class="bloc-titre">Photos — cliquez pour choisir la couverture</p>
    <div class="galerie">${galerie(t)}</div>
    <p class="aide" style="margin:-8px 0 16px">
      Le ✓ garde ou écarte une photo. Le 🍽 marque une photo de <strong>carte</strong> :
      elle ira dans <code>menu_photos</code>, pas dans la galerie de la fiche.
    </p>

    ${champsDuGenre(t, champ, zone, opt)}

    ${(t.lignes_circuit || []).length ? blocCircuits(t) : ""}

    ${(t.lignes_chambre || []).length || t.source_genre === "site" ? blocChambres(t) : ""}

    ${(t.lignes_vehicule || []).length ||
    (t.categories || []).includes("location_vehicule")
      ? blocVehicules(t)
      : ""}

    ${t.genre === "carte" || (t.lignes_carte || []).length ? blocCarte(t) : ""}

    <p class="bloc-titre">Ce qui sera publié</p>
    <div class="apercu" id="apercu">${echapper(apercu(t))}</div>

    <p class="bloc-titre">Texte d'origine sur Facebook</p>
    <div class="texte-source">${echapper(t.texte || "")}</div>`;
}

function galerie(t) {
  if (!t.photos.length)
    return `<p class="aide">Aucune photo n'a pu être récupérée pour cette publication.</p>`;
  return t.photos
    .map(
      (p) => `<div class="photo ${p.couverture ? "couverture" : ""} ${p.garder ? "" : "ecartee"}"
             data-pid="${p.id}"
             style="background-image:url('/photo/${t.id}/${p.fichier}')">
        ${p.couverture ? '<span class="marque-couv">couverture</span>' : ""}
        ${p.est_la_carte ? '<span class="marque-couv" style="background:var(--corail)">carte</span>' : ""}
        <button class="basculer" data-pid="${p.id}" title="Garder / écarter">${p.garder ? "✓" : "✕"}</button>
        <button class="basculer" data-carte="${p.id}" style="right:30px"
                title="C'est une photo de la carte">🍽</button>
      </div>`
    )
    .join("");
}

/* Le rapprochement : le point où une erreur ne se rattrape pas. */
/* ⭐ CE QUE LA PUBLICATION REMPLIRA AILLEURS. Une trouvaille ne sert pas un
   seul écran : la même photo de Nosy Komba illustre le récit ET la destination.
   Diako compte 18 334 destinations pour 91 photos, 2 521 sites pour 226 : ce
   bloc dit, avant le clic, ce qu'on va combler au passage. */
const CIBLES = {
  places: ["lieu", "Destination"],
  attractions: ["lieu", "Site ou parc"],
  dishes: ["plat", "Plat du référentiel"],
  tours: ["etab", "Circuits de l'agence"],
};

function blocApports(t) {
  const apports = t.apports || [];
  if (!apports.length) return "";
  const lignes = apports
    .map((a) => {
      const [classe, libelle] = CIBLES[a.cible] || ["", a.cible];
      return `<div class="candidat ${a.pret ? "choisi" : ""}">
        <span class="badge ${classe}">${libelle}</span>
        <span class="nom-candidat">${echapper(a.nom || "—")}</span>
        <span class="detail-candidat">${echapper(a.quoi)}${
          a.pret ? "" : " — il manque la fiche d'établissement"
        }</span>
      </div>`;
    })
    .join("");
  return `<div class="rapprochement">
    <h4>En publiant, on remplit aussi</h4>
    ${lignes}
    <p class="aide" style="margin:8px 0 0">
      Rien n'est écrasé : une destination déjà illustrée garde sa photo. Chaque
      image posée emporte son crédit, sa licence et son lien d'origine.
    </p>
  </div>`;
}

function blocCircuits(t) {
  const lignes = (t.lignes_circuit || [])
    .map(
      (c) => `<div class="plat-ligne ${c.garder ? "" : "ecarte"}" data-rid="${c.id}">
        <input data-circuit="titre" value="${echapper(c.titre)}">
        <input data-circuit="prix_ar" type="number" value="${c.prix_ar ?? ""}" placeholder="prix Ar">
        <span class="rattache ${c.jours ? "" : "non"}">${
          c.jours
            ? echapper(
                c.jours + " j" + (c.nuits ? " / " + c.nuits + " n" : "") +
                  (c.prix_ar ? " · " + (c.prix_unite || "personne") : "") +
                  (c.depart_id ? " · départ rattaché" : "")
              )
            : "sans durée — non publiable"
        }</span>
        <button class="oter" data-oter-circuit="${c.id}" title="Retirer">×</button>
      </div>`
    )
    .join("");
  const publiables = (t.lignes_circuit || []).filter((c) => c.jours).length;
  return `<p class="bloc-titre">Circuits — ${publiables} publiable(s) sur ${
    (t.lignes_circuit || []).length
  }</p>
    <div class="carte-plats">${lignes}</div>
    <p class="aide" style="margin:8px 0 16px">
      <code>tours</code> est <strong>vide</strong> sur Diako, alors que les agences
      ne racontent que ça. Un circuit <strong>sans durée n'entre pas</strong> :
      <code>duration_days</code> est l'entier sur lequel on filtre, et une durée
      approximative ferait ressortir le circuit dans les mauvaises recherches.
      Il faut aussi une fiche d'agence — sans elle, le circuit n'a nulle part où aller.
    </p>`;
}

function blocRapprochement(t) {
  if (t.genre === "recit" && !t.nom_etab && !t.page_id) return "";
  const candidats = t.page_candidats || [];
  const rattachee = Boolean(t.page_id);

  const lignes = candidats
    .map((c) => {
      const part = Math.round((c.score || 0) * 100);
      const classe = part >= 78 ? "sur" : part >= 60 ? "moyen" : "";
      const etat = [
        c.a_photo ? "a une photo" : "sans photo",
        c.a_tel ? "a un numéro" : "sans numéro",
        c.nb_carte ? `${c.nb_carte} plats` : "sans carte",
        c.lieu_nom || "lieu inconnu",
      ].join(" · ");
      return `<div class="candidat ${t.page_id === c.id ? "choisi" : ""}">
        <span class="part ${classe}">${part}%</span>
        <span class="nom-candidat">${echapper(c.nom)}</span>
        <span class="detail-candidat">${echapper(etat)}</span>
        <button class="bouton" data-rattacher="${c.id}">
          ${t.page_id === c.id ? "rattachée" : "rattacher"}</button>
      </div>`;
    })
    .join("");

  return `<div class="rapprochement ${rattachee ? "" : "aucun"}">
    <h4>${
      rattachee
        ? `Rattachée à « ${echapper(t.page_nom)} »${
            t.page_score ? ` — ${Math.round(t.page_score * 100)} %` : ""
          }`
        : "Aucune fiche rattachée — une fiche sera CRÉÉE à la publication"
    }</h4>
    ${lignes || `<p class="aide" style="margin:0 0 8px">Aucun candidat trouvé dans l'annuaire.</p>`}
    <div class="chercher-fiche">
      <input id="rech-fiche" placeholder="chercher une fiche par son nom…"
             value="${echapper(t.nom_etab || "")}">
      ${rattachee ? `<button class="bouton danger" data-detacher>Détacher</button>` : ""}
    </div>
    <div id="resultats-fiche"></div>
  </div>`;
}

function champsDuGenre(t, champ, zone, opt) {
  const categories = Object.entries(CATEGORIES)
    .map(
      ([k, l]) =>
        `<label><input type="checkbox" data-cat="${k}" ${
          (t.categories || []).includes(k) ? "checked" : ""
        }> ${l}</label>`
    )
    .join("");

  if (t.genre === "evenement") {
    return `<p class="bloc-titre">Événement</p>
      <div class="champs">
        ${champ("titre", "Titre", t.titre)}
        ${champ("evt_debut", "Début", t.evt_debut, "date")}
        ${champ("evt_fin", "Fin (facultatif)", t.evt_fin, "date")}
        ${champ("organisateur", "Organisateur", t.organisateur)}
        ${champ("prix_ar", "Entrée (Ar)", t.prix_ar, "number")}
        <div class="champ"><label>Unité du prix</label>
          <select data-champ="prix_unite">${opt(UNITES, t.prix_unite)}</select></div>
        ${zone("resume", "Résumé publié", t.resume, 3)}
      </div>
      <div class="interrupteurs">
        <label><input type="checkbox" data-champ="evt_recurrent" ${
          t.evt_recurrent ? "checked" : ""
        }> revient chaque année</label>
      </div>`;
  }

  if (t.genre === "recit") {
    return `<p class="bloc-titre">Récit</p>
      <div class="champs">
        <div class="champ"><label>Genre de publication</label>
          <select data-champ="post_genre">${opt(GENRES_POST, t.post_genre)}</select></div>
        ${champ("prix_ar", "Prix cité (Ar)", t.prix_ar, "number")}
        <div class="champ"><label>Unité du prix</label>
          <select data-champ="prix_unite">${opt(UNITES, t.prix_unite)}</select></div>
        ${champ("prix_vu_le", "Prix relevé le", (t.prix_vu_le || "").slice(0, 10), "date")}
        ${zone("corps", "Texte publié sur le fil", t.corps, 8)}
      </div>
      <p class="aide" style="margin:-8px 0 16px">
        Ce texte part sous le compte Diako. Il ne recopie pas la publication
        d'origine : la ligne « Vu sur Facebook — … » est ajoutée à la
        publication, avec le nom de l'auteur.
      </p>`;
  }

  // Établissement et carte partagent la fiche.
  return `<p class="bloc-titre">Établissement</p>
    <div class="champs">
      ${champ("nom_etab", "Nom", t.nom_etab)}
      ${champ("telephone", "Téléphone", t.telephone)}
      ${champ("whatsapp", "WhatsApp", t.whatsapp)}
      ${champ("email", "E-mail", t.email)}
      ${champ("site_web", "Site web", t.site_web)}
      ${champ("page_facebook", "Page Facebook", t.page_facebook)}
      ${champ("adresse", "Adresse", t.adresse)}
      ${champ("repere", "Repère (« en face de… »)", t.repere)}
      ${champ("horaires", "Horaires", t.horaires)}
      ${champ("prix_ar", "Prix d'appel (Ar)", t.prix_ar, "number")}
      <div class="champ"><label>Unité du prix</label>
        <select data-champ="prix_unite">${opt(UNITES, t.prix_unite)}</select></div>
      ${champ("prix_vu_le", "Prix relevé le", (t.prix_vu_le || "").slice(0, 10), "date")}
      ${zone("resume", "Résumé (court, affiché en liste)", t.resume, 2)}
      ${zone("presentation", "Présentation (fiche)", t.presentation, 6)}
    </div>

    <p class="bloc-titre">Catégories</p>
    <div class="interrupteurs">${categories}</div>

    <p class="bloc-titre">Équipements lus dans le texte</p>
    <p class="aide">${
      (t.equipements || []).length
        ? (t.equipements || []).map(echapper).join(" · ")
        : "aucun"
    }</p>`;
}

function blocChambres(t) {
  const lignes = (t.lignes_chambre || [])
    .map(
      (c) => `<div class="plat-ligne ${c.garder ? "" : "ecarte"}" data-cid="${c.id}">
        <input data-chambre="nom" value="${echapper(c.nom)}">
        <input data-chambre="prix_ar" type="number" value="${c.prix_ar ?? ""}" placeholder="prix Ar">
        <span class="rattache ${c.prix_ar ? "" : "non bloquant"}">${
          c.prix_ar
            ? echapper(
                (c.unite === "personne" ? "par personne" : "la chambre") +
                  (c.saison ? " · " + c.saison : "") +
                  (c.capacite ? " · " + c.capacite + " pers." : "")
              )
            : "sans prix — ne partira pas"
        }</span>
        <button class="oter" data-oter-chambre="${c.id}" title="Retirer">×</button>
      </div>`
    )
    .join("");

  const chiffrees = (t.lignes_chambre || []).filter((c) => c.prix_ar).length;
  return `<p class="bloc-titre">Tarifs de chambre — ${chiffrees} chiffré(s) sur ${
    (t.lignes_chambre || []).length
  }</p>
    <div class="carte-plats">${
      lignes || '<p class="aide" style="padding:10px">Aucun tarif lu sur ce site.</p>'
    }</div>
    <div class="ajout-plat">
      <input id="chambre-nom" placeholder="Type de chambre">
      <input id="chambre-prix" type="number" placeholder="Prix Ar" style="width:120px">
      <button class="bouton" id="btn-ajouter-chambre">Ajouter</button>
    </div>
    <p class="aide" style="margin:8px 0 16px">
      Une chambre <strong>sans prix ne peut pas être publiée</strong> :
      <code>room_types.base_price_ar</code> est obligatoire, et on n'invente pas
      de tarif. Deux lignes de même nom ne sont pas un doublon — ce sont deux
      saisons, et elles deviennent un seul type de chambre avec ses
      <code>season_rates</code>.
    </p>`;
}

/* ⭐ LA GRILLE D'UN LOUEUR. `location_vehicule` comptait 24 trouvailles et
   produisait ZÉRO ligne de tarif : les prix restaient dans le texte, invisibles
   au site. Ce bloc suit exactement la mécanique des chambres — corriger,
   retirer, ajouter à la main — parce que c'est le geste que la main connaît. */
function blocVehicules(t) {
  const choix = (paires, v) =>
    paires
      .map(([k, l]) => `<option value="${k}" ${k === (v ?? "") ? "selected" : ""}>${l}</option>`)
      .join("");
  /* SQLite rend 1, 0 ou null ; un <select> ne connaît que des chaînes. */
  const triEtat = (v) => (v == null ? "" : String(Number(v)));
  /* ⚠ Contrairement aux chambres, `price_day_ar` est NULLABLE côté Diako : une
     offre sans prix mais avec un modèle ou une note entre quand même — c'est
     une fiche de flotte, pas un tarif inventé. Une ligne qui n'a AUCUN des
     trois, en revanche, ne partira jamais : la publication l'écarte. */
  const publiable = (v) => Boolean(v.prix_jour_ar || v.modele || v.note_prix);

  const lignes = (t.lignes_vehicule || [])
    .map((v) => {
      const etat = [
        v.avec_chauffeur == null
          ? "chauffeur non dit"
          : v.avec_chauffeur
          ? "avec chauffeur"
          : "sans chauffeur",
        v.places ? v.places + " places" : "",
        v.km_par_jour ? v.km_par_jour + " km/j" : "",
        v.carburant_inclus == null
          ? ""
          : v.carburant_inclus
          ? "carburant inclus"
          : "carburant en sus",
        v.caution_ar ? "caution " + ar(v.caution_ar) : "",
      ]
        .filter(Boolean)
        .join(" · ");

      return `<div class="plat-ligne vehicule ${v.garder ? "" : "ecarte"}" data-vid="${v.id}">
        <select data-vehicule="type_vehicule">${choix(
          Object.entries(TYPES_VEHICULE),
          TYPES_VEHICULE[v.type_vehicule] ? v.type_vehicule : "autre"
        )}</select>
        <input data-vehicule="modele" value="${echapper(v.modele)}" placeholder="modèle (Hilux…)">
        <input data-vehicule="prix_jour_ar" type="number" value="${
          v.prix_jour_ar ?? ""
        }" placeholder="Ar / jour">
        <span class="rattache ${publiable(v) ? "" : "non bloquant"}">${
          publiable(v) ? echapper(etat) : "ni prix ni modèle — ne partira pas"
        }</span>
        <button class="oter" data-oter-vehicule="${v.id}" title="Retirer">×</button>
        <div class="details-vehicule">
          <label>places <input data-vehicule="places" type="number" value="${
            v.places ?? ""
          }"></label>
          <label>chauffeur <select data-vehicule="avec_chauffeur">${choix(
            TRI_ETAT,
            triEtat(v.avec_chauffeur)
          )}</select></label>
          <label>carburant <select data-vehicule="carburant_inclus">${choix(
            TRI_ETAT,
            triEtat(v.carburant_inclus)
          )}</select></label>
          <label>km / jour <input data-vehicule="km_par_jour" type="number" value="${
            v.km_par_jour ?? ""
          }"></label>
          <label>caution Ar <input data-vehicule="caution_ar" type="number" value="${
            v.caution_ar ?? ""
          }"></label>
          <label class="large">note <input data-vehicule="note_prix" value="${echapper(
            v.note_prix
          )}" placeholder="« hors carburant », « 3 jours minimum »…"></label>
        </div>
      </div>`;
    })
    .join("");

  const partants = (t.lignes_vehicule || []).filter(publiable).length;
  return `<p class="bloc-titre">Véhicules et tarifs — ${partants} publiable(s) sur ${
    (t.lignes_vehicule || []).length
  }</p>
    <div class="carte-plats">${
      lignes ||
      '<p class="aide" style="padding:10px">Aucune grille de location lue ici — saisissez-la à la main ci-dessous.</p>'
    }</div>
    <div class="ajout-plat">
      <select id="vehicule-type" style="width:120px">${choix(
        Object.entries(TYPES_VEHICULE),
        "4x4"
      )}</select>
      <input id="vehicule-modele" placeholder="Modèle (Hilux, Duster…)">
      <input id="vehicule-prix" type="number" placeholder="Ar / jour" style="width:110px">
      <select id="vehicule-chauffeur" style="width:135px">${choix(
        [["", "chauffeur ?"], ["1", "avec chauffeur"], ["0", "sans chauffeur"]],
        ""
      )}</select>
      <button class="bouton" id="btn-ajouter-vehicule">Ajouter</button>
    </div>
    <p class="aide" style="margin:8px 0 16px">
      Ces quatre champs créent la ligne ; places, carburant, km/jour, caution et
      note se saisissent ensuite <strong>directement sur la ligne</strong>.
      Une offre part dès qu'elle porte <strong>un prix, un modèle ou une note</strong> —
      <code>price_day_ar</code> est NULLABLE ici, contrairement aux chambres.
      Et « chauffeur ? » n'est pas « sans chauffeur » : laissé vide, c'est la base
      qui applique son défaut (<code>with_driver</code> = avec chauffeur).
    </p>`;
}

function blocCarte(t) {
  const lignes = (t.lignes_carte || [])
    .map(
      (l) => `<div class="plat-ligne ${l.garder ? "" : "ecarte"}" data-lid="${l.id}">
        <input data-ligne="nom" value="${echapper(l.nom)}">
        <input data-ligne="prix_ar" type="number" value="${l.prix_ar ?? ""}" placeholder="prix Ar">
        <span class="rattache ${l.plat_id ? "" : "non"}">${
          l.plat_id ? "→ " + echapper(l.plat_nom) : "hors référentiel"
        }</span>
        <button class="oter" data-oter="${l.id}" title="Retirer">×</button>
      </div>`
    )
    .join("");

  return `<p class="bloc-titre">Carte — ${(t.lignes_carte || []).length} plat(s)</p>
    <div class="carte-plats">${lignes || '<p class="aide" style="padding:10px">Aucun plat.</p>'}</div>
    <div class="ajout-plat">
      <input id="plat-nom" placeholder="Nom du plat">
      <input id="plat-prix" type="number" placeholder="Prix Ar" style="width:120px">
      <button class="bouton" id="btn-ajouter-plat">Ajouter</button>
      <button class="bouton" id="btn-lire-carte">Lire la carte sur les photos</button>
    </div>
    <p class="aide" style="margin:8px 0 16px">
      « → » indique qu'un plat est rattaché au référentiel des 95 plats : c'est
      ce lien qui fait marcher « qui sert ce plat, et à quel prix ».
    </p>`;
}

function apercu(t) {
  if (t.genre === "recit") return t.corps || "";
  if (t.genre === "evenement")
    return [t.titre, t.resume, t.evt_debut ? `Le ${jour(t.evt_debut)}` : ""]
      .filter(Boolean)
      .join("\n");
  return [t.nom_etab, t.resume, "", t.presentation].filter(Boolean).join("\n");
}

/* ── Branchements du panneau ─────────────────────────────────────── */
function brancherPanneau() {
  const zone = $("#panneau-contenu");

  const relire = $("#btn-relire", zone);
  if (relire)
    relire.addEventListener("click", async () => {
      relire.disabled = true;
      relire.textContent = "Relecture en cours…";
      try {
        await api(`/api/trouvailles/${ouverte.id}/relire`, { method: "POST" });
        toast("Trouvaille relue.", "succes");
        ouvrir(ouverte.id);
        chargerListe();
      } catch (e) {
        toast(e.message, "erreur");
        relire.disabled = false;
        relire.textContent = "Faire relire par l'IA";
      }
    });

  $$("[data-champ]", zone).forEach((el) =>
    el.addEventListener("change", async () => {
      const cle = el.dataset.champ;
      const valeur =
        el.type === "checkbox"
          ? el.checked
            ? 1
            : 0
          : el.type === "number"
          ? el.value === ""
            ? null
            : Number(el.value)
          : el.value === ""
          ? null
          : el.value;
      await enregistrer({ [cle]: valeur });
      if (cle === "genre") ouvrir(ouverte.id);
    })
  );

  $$("[data-cat]", zone).forEach((el) =>
    el.addEventListener("change", async () => {
      const liste = $$("[data-cat]", zone).filter((x) => x.checked).map((x) => x.dataset.cat);
      await enregistrer({ categories: liste });
    })
  );

  $$(".photo", zone).forEach((el) =>
    el.addEventListener("click", async (ev) => {
      if (ev.target.classList.contains("basculer")) return;
      await api(`/api/trouvailles/${ouverte.id}/couverture/${el.dataset.pid}`, {
        method: "POST",
      });
      ouvrir(ouverte.id);
    })
  );

  $$("[data-pid].basculer", zone).forEach((el) =>
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const photo = ouverte.photos.find((p) => p.id == el.dataset.pid);
      await api(`/api/photos/${el.dataset.pid}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { garder: photo.garder ? 0 : 1 } }),
      });
      ouvrir(ouverte.id);
    })
  );

  $$("[data-carte]", zone).forEach((el) =>
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const photo = ouverte.photos.find((p) => p.id == el.dataset.carte);
      await api(`/api/photos/${el.dataset.carte}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { est_la_carte: photo.est_la_carte ? 0 : 1 } }),
      });
      ouvrir(ouverte.id);
    })
  );

  brancherRapprochement(zone);
  brancherCarte(zone);
  brancherChambres(zone);
  brancherVehicules(zone);
  brancherCircuits(zone);
}

function brancherCircuits(zone) {
  $$(".plat-ligne [data-circuit]", zone).forEach((el) =>
    el.addEventListener("change", async () => {
      const rid = el.closest(".plat-ligne").dataset.rid;
      const cle = el.dataset.circuit;
      const valeur = cle === "prix_ar" ? (el.value === "" ? null : Number(el.value)) : el.value;
      await api(`/api/circuits/${rid}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { [cle]: valeur } }),
      });
      ouvrir(ouverte.id);
    })
  );
  $$("[data-oter-circuit]", zone).forEach((el) =>
    el.addEventListener("click", async () => {
      await api(`/api/circuits/${el.dataset.oterCircuit}`, { method: "DELETE" });
      ouvrir(ouverte.id);
    })
  );
}

function brancherChambres(zone) {
  $$(".plat-ligne [data-chambre]", zone).forEach((el) =>
    el.addEventListener("change", async () => {
      const cid = el.closest(".plat-ligne").dataset.cid;
      const cle = el.dataset.chambre;
      const valeur = cle === "prix_ar" ? (el.value === "" ? null : Number(el.value)) : el.value;
      await api(`/api/chambres/${cid}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { [cle]: valeur } }),
      });
      ouvrir(ouverte.id);
    })
  );

  $$("[data-oter-chambre]", zone).forEach((el) =>
    el.addEventListener("click", async () => {
      await api(`/api/chambres/${el.dataset.oterChambre}`, { method: "DELETE" });
      ouvrir(ouverte.id);
    })
  );

  const ajouter = $("#btn-ajouter-chambre", zone);
  if (ajouter)
    ajouter.addEventListener("click", async () => {
      const nom = $("#chambre-nom", zone).value.trim();
      if (!nom) return toast("Donnez au moins un type de chambre.", "erreur");
      const prix = $("#chambre-prix", zone).value;
      await api(`/api/trouvailles/${ouverte.id}/chambres`, {
        method: "POST",
        body: JSON.stringify({ nom, prix_ar: prix === "" ? null : Number(prix) }),
      });
      ouvrir(ouverte.id);
    });
}

/* Mêmes gestes que les chambres : on corrige sur place, on retire, on ajoute.
   Chaque changement repasse par `ouvrir()` pour que l'état affiché à droite de
   la ligne (« ne partira pas ») suive la saisie sans recharger la page. */
function brancherVehicules(zone) {
  /* Les entiers passent en Number, jamais en chaîne : les colonnes sont INTEGER.
     Un champ vidé redevient NULL — pas 0, qui voudrait dire « gratuit ». Et pour
     chauffeur/carburant, NULL veut dire « le texte ne le dit pas » : c'est une
     information, pas une absence de réponse. */
  const ENTIERS = ["prix_jour_ar", "places", "km_par_jour", "caution_ar",
                   "avec_chauffeur", "carburant_inclus"];

  $$(".plat-ligne [data-vehicule]", zone).forEach((el) =>
    el.addEventListener("change", async () => {
      const vid = el.closest(".plat-ligne").dataset.vid;
      const cle = el.dataset.vehicule;
      let valeur = el.value;
      if (ENTIERS.includes(cle)) valeur = valeur === "" ? null : Number(valeur);
      await api(`/api/vehicules/${vid}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { [cle]: valeur } }),
      });
      ouvrir(ouverte.id);
    })
  );

  $$("[data-oter-vehicule]", zone).forEach((el) =>
    el.addEventListener("click", async () => {
      await api(`/api/vehicules/${el.dataset.oterVehicule}`, { method: "DELETE" });
      ouvrir(ouverte.id);
    })
  );

  const ajouter = $("#btn-ajouter-vehicule", zone);
  if (ajouter)
    ajouter.addEventListener("click", async () => {
      const modele = $("#vehicule-modele", zone).value.trim();
      const prix = $("#vehicule-prix", zone).value;
      const chauffeur = $("#vehicule-chauffeur", zone).value;
      // Une ligne sans prix NI modèle serait écartée à la publication : autant
      // le dire ici plutôt que de la laisser croire enregistrée.
      if (!modele && prix === "")
        return toast("Donnez au moins un modèle ou un prix par jour.", "erreur");
      await api(`/api/trouvailles/${ouverte.id}/vehicules`, {
        method: "POST",
        body: JSON.stringify({
          type_vehicule: $("#vehicule-type", zone).value,
          modele: modele || null,
          prix_jour_ar: prix === "" ? null : Number(prix),
          avec_chauffeur: chauffeur === "" ? null : chauffeur === "1",
        }),
      });
      ouvrir(ouverte.id);
    });
}

function brancherRapprochement(zone) {
  $$("[data-rattacher]", zone).forEach((el) =>
    el.addEventListener("click", async () => {
      await api(`/api/trouvailles/${ouverte.id}/rattacher`, {
        method: "POST",
        body: JSON.stringify({ champs: { page_id: el.dataset.rattacher } }),
      });
      toast("Rattachée.", "succes");
      ouvrir(ouverte.id);
      chargerListe();
    })
  );

  const detacher = $("[data-detacher]", zone);
  if (detacher)
    detacher.addEventListener("click", async () => {
      await api(`/api/trouvailles/${ouverte.id}/rattacher`, {
        method: "POST",
        body: JSON.stringify({ champs: {} }),
      });
      toast("Détachée — une fiche sera créée à la publication.");
      ouvrir(ouverte.id);
    });

  brancherRecherche(
    $("#rech-fiche", zone),
    $("#resultats-fiche", zone),
    (q) => `/api/fiches?q=${encodeURIComponent(q)}&lieu_id=${ouverte.lieu_id || ""}`,
    (r) => `${r.nom} — ${r.lieu_nom || "lieu inconnu"} (${Math.round(r.score * 100)} %)`,
    async (r) => {
      await api(`/api/trouvailles/${ouverte.id}/rattacher`, {
        method: "POST",
        body: JSON.stringify({ champs: { page_id: r.id } }),
      });
      toast("Rattachée.", "succes");
      ouvrir(ouverte.id);
    }
  );

  brancherRecherche(
    $("#rech-lieu", zone),
    $("#resultats-lieu", zone),
    (q) => `/api/lieux?q=${encodeURIComponent(q)}`,
    (r) => `${r.nom}${r.region ? " — " + r.region : ""}`,
    async (r) => {
      await api(`/api/trouvailles/${ouverte.id}/lieu`, {
        method: "POST",
        body: JSON.stringify({ champs: { lieu_id: r.id } }),
      });
      toast(`Lieu posé : ${r.nom}`, "succes");
      ouvrir(ouverte.id);
    }
  );
}

/* Une petite recherche incrémentale partagée par les fiches et les lieux. */
function brancherRecherche(champ, sortie, urlDe, libelleDe, choisir) {
  if (!champ || !sortie) return;
  let minuteur;
  champ.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(async () => {
      const q = champ.value.trim();
      if (q.length < 3) return (sortie.innerHTML = "");
      let liste = [];
      try {
        liste = await api(urlDe(q));
      } catch {
        return;
      }
      sortie.innerHTML = liste
        .map(
          (r, i) => `<div class="candidat">
            <span class="detail-candidat">${echapper(libelleDe(r))}</span>
            <button class="bouton" data-choix="${i}">choisir</button>
          </div>`
        )
        .join("");
      $$("[data-choix]", sortie).forEach((b) =>
        b.addEventListener("click", () => choisir(liste[Number(b.dataset.choix)]))
      );
    }, 320);
  });
}

function brancherCarte(zone) {
  $$(".plat-ligne [data-ligne]", zone).forEach((el) =>
    el.addEventListener("change", async () => {
      const lid = el.closest(".plat-ligne").dataset.lid;
      const cle = el.dataset.ligne;
      const valeur = cle === "prix_ar" ? (el.value === "" ? null : Number(el.value)) : el.value;
      await api(`/api/lignes/${lid}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { [cle]: valeur } }),
      });
      ouvrir(ouverte.id);
    })
  );

  $$("[data-oter]", zone).forEach((el) =>
    el.addEventListener("click", async () => {
      await api(`/api/lignes/${el.dataset.oter}`, { method: "DELETE" });
      ouvrir(ouverte.id);
    })
  );

  const ajouter = $("#btn-ajouter-plat", zone);
  if (ajouter)
    ajouter.addEventListener("click", async () => {
      const nom = $("#plat-nom", zone).value.trim();
      if (!nom) return toast("Donnez au moins un nom de plat.", "erreur");
      const prix = $("#plat-prix", zone).value;
      await api(`/api/trouvailles/${ouverte.id}/lignes`, {
        method: "POST",
        body: JSON.stringify({ nom, prix_ar: prix === "" ? null : Number(prix) }),
      });
      ouvrir(ouverte.id);
    });

  const lire = $("#btn-lire-carte", zone);
  if (lire)
    lire.addEventListener("click", async () => {
      lire.disabled = true;
      lire.textContent = "Lecture en cours… (jusqu'à 2 min)";
      try {
        await api(`/api/trouvailles/${ouverte.id}/lire-carte`, { method: "POST" });
        toast("Carte lue.", "succes");
        ouvrir(ouverte.id);
        chargerListe();
      } catch (e) {
        toast(e.message, "erreur");
        lire.disabled = false;
        lire.textContent = "Lire la carte sur les photos";
      }
    });
}

async function enregistrer(champs) {
  ouverte = await api(`/api/trouvailles/${ouverte.id}`, {
    method: "PATCH",
    body: JSON.stringify({ champs }),
  });
  const zone = $("#apercu");
  if (zone) zone.textContent = apercu(ouverte);
  $("#p-titre").textContent = ouverte.titre || "Trouvaille";
  const bloquants = ouverte.bloquants || [];
  $("#p-publier").disabled = ouverte.statut === "publiee" || bloquants.length > 0;
}

async function changerStatut(statut) {
  if (!ouverte) return;
  await api(`/api/trouvailles/${ouverte.id}`, {
    method: "PATCH",
    body: JSON.stringify({ champs: { statut } }),
  });
  toast(statut === "validee" ? "Trouvaille validée." : "Trouvaille rejetée.");
  fermerPanneau();
  chargerListe();
  rafraichirEtat();
}

$("#p-valider").addEventListener("click", () => changerStatut("validee"));
$("#p-rejeter").addEventListener("click", () => changerStatut("rejetee"));
$("#p-publier").addEventListener("click", async () => {
  if (!ouverte) return;
  if (!confirm(`Publier « ${ouverte.titre} » sur Diako ?`)) return;
  try {
    await api(`/api/trouvailles/${ouverte.id}/publier`, { method: "POST" });
    toast("Publication lancée — suivez le journal.");
    fermerPanneau();
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
});

function fermerPanneau() {
  $("#panneau").hidden = true;
  ouverte = null;
}
$$("[data-fermer]").forEach((el) => el.addEventListener("click", fermerPanneau));

document.addEventListener("keydown", (e) => {
  if ($("#panneau").hidden) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.key === "Escape") fermerPanneau();
  if (e.key.toLowerCase() === "v") changerStatut("validee");
  if (e.key.toLowerCase() === "r") changerStatut("rejetee");
});

/* ── Sources ─────────────────────────────────────────────────────── */
const ETIQUETTE_SOURCE = {
  groupe: ["groupe", "Groupe"],
  page: ["page", "Page"],
  fil: ["fil", "Fil"],
  recherche: ["recherche", "Recherche"],
  site: ["etab", "Site web"],
};

/* Le fil d'actualité, mis en avant : c'est la source la plus rentable et la
   plus facile à activer, et elle passait inaperçue au milieu des adresses. */
function majFilVedette(sources) {
  const carte = $("#fil-vedette");
  if (!carte) return;
  const fil = sources.find((s) => s.genre === "fil");
  const bouton = $("#btn-fil");
  carte.classList.toggle("on", Boolean(fil && fil.actif));
  if (fil && fil.actif) {
    bouton.textContent = "Mettre de côté";
    bouton.className = "bouton";
    $("#fil-texte").innerHTML =
      `Actif — <strong>${fil.nb_trouvees}</strong> trouvaille(s) en sont venues. ` +
      `Le fil est déroulé plus loin que les autres sources : l'algorithme de ` +
      `Facebook continue d'y servir du neuf là où un groupe se répète.`;
  } else {
    bouton.textContent = fil ? "Réactiver mon fil" : "Activer mon fil";
    bouton.className = "bouton principal";
  }
  bouton.onclick = async () => {
    bouton.disabled = true;
    try {
      if (fil) {
        await api(`/api/sources/${fil.id}`, {
          method: "PATCH",
          body: JSON.stringify({ champs: { actif: fil.actif ? 0 : 1 } }),
        });
        toast(fil.actif ? "Fil mis de côté." : "Fil réactivé.", "succes");
      } else {
        await api("/api/sources", {
          method: "POST",
          body: JSON.stringify({ nom: "", url: "facebook.com" }),
        });
        toast("Fil d'actualité ajouté aux sources.", "succes");
      }
      chargerSources();
      rafraichirEtat();
    } catch (e) {
      toast(e.message, "erreur");
    }
    bouton.disabled = false;
  };
}

/* Le filtre du tableau des sources : 409 lignes ne se parcourent pas à l'œil. */
let filtreSources = { genre: "", texte: "" };
let sourcesConnues = [];

function resultatSource(s) {
  const echecs = Number(s.echecs || 0);
  if (s.genre !== "site") return { texte: "", classe: "" };
  if (echecs >= 4) return { texte: `en pause : ${s.dernier_resultat || "échecs répétés"}`, classe: "pause" };
  if (echecs > 0) return { texte: `${s.dernier_resultat || "échec"} (×${echecs})`, classe: "ko" };
  if (s.dernier_resultat) return { texte: s.dernier_resultat, classe: "" };
  return { texte: "", classe: "" };
}

function rendreTableSources() {
  const q = filtreSources.texte.toLowerCase();
  const visibles = sourcesConnues.filter((s) => {
    if (filtreSources.genre === "pause") return Number(s.echecs || 0) >= 4;
    if (filtreSources.genre && s.genre !== filtreSources.genre) return false;
    if (q && !(`${s.nom} ${s.url}`.toLowerCase().includes(q))) return false;
    return true;
  });
  $("#compte-sources").textContent = `${visibles.length} sur ${sourcesConnues.length}`;
  $("#table-sources tbody").innerHTML = visibles
    .map((s) => {
      const [classe, libelle] = ETIQUETTE_SOURCE[s.genre] || ["", s.genre];
      const r = resultatSource(s);
      return `<tr class="${s.actif ? "" : "inactive"}">
        <td><input type="checkbox" data-actif="${s.id}" ${s.actif ? "checked" : ""}></td>
        <td><span class="badge ${classe}">${libelle}</span></td>
        <td><input class="nom-source" data-nom="${s.id}" value="${echapper(s.nom)}"></td>
        <td class="url">${echapper(s.url)}</td>
        <td>${s.derniere_collecte ? new Date(s.derniere_collecte).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "jamais"}</td>
        <td class="resultat ${r.classe}">${echapper(r.texte)}</td>
        <td>${s.nb_trouvees}</td>
        <td><button class="bouton danger" data-suppr="${s.id}">Retirer</button></td>
      </tr>`;
    })
    .join("");
  brancherTableSources();
}

$$("#filtres-genre-source .puce").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#filtres-genre-source .puce").forEach((p) => p.classList.toggle("actif", p === b));
    filtreSources.genre = b.dataset.genre;
    rendreTableSources();
  })
);
let minuteurSources;
$("#recherche-source").addEventListener("input", (e) => {
  clearTimeout(minuteurSources);
  minuteurSources = setTimeout(() => {
    filtreSources.texte = e.target.value.trim();
    rendreTableSources();
  }, 250);
});

async function chargerSources() {
  const sources = await api("/api/sources");
  majFilVedette(sources);
  sourcesConnues = sources;
  rendreTableSources();

  $("#filtre-source").innerHTML =
    `<option value="0">Toutes les sources</option>` +
    sources
      .map((s) => `<option value="${s.id}">${echapper(s.nom)}</option>`)
      .join("");
}

function brancherTableSources() {
  $$("[data-actif]").forEach((el) =>
    el.addEventListener("change", () =>
      api(`/api/sources/${el.dataset.actif}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { actif: el.checked ? 1 : 0 } }),
      })
    )
  );
  $$("[data-nom]").forEach((el) =>
    el.addEventListener("change", async () => {
      const nom = el.value.trim();
      if (!nom) return chargerSources();
      await api(`/api/sources/${el.dataset.nom}`, {
        method: "PATCH",
        body: JSON.stringify({ champs: { nom } }),
      });
      toast("Nom mis à jour.", "succes");
    })
  );
  $$("[data-suppr]").forEach((el) =>
    el.addEventListener("click", async () => {
      if (!confirm("Retirer cette source de la surveillance ?")) return;
      await api(`/api/sources/${el.dataset.suppr}`, { method: "DELETE" });
      chargerSources();
    })
  );
}

$("#form-source").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const s = await api("/api/sources", {
      method: "POST",
      body: JSON.stringify({ nom: $("#source-nom").value, url: $("#source-url").value }),
    });
    $("#source-nom").value = $("#source-url").value = "";
    chargerSources();
    const [, libelle] = ETIQUETTE_SOURCE[s.genre] || ["", s.genre];
    toast(`${libelle} « ${s.nom} » ajouté.`, "succes");
  } catch (err) {
    toast(err.message, "erreur");
  }
});

/* ── Automatisation ──────────────────────────────────────────────── */
/* Les règles « tous les N jours » n'ont pas d'interrupteur en base : c'est le
   nombre lui-même qui les éteint (0 = jamais). L'interrupteur de l'interface
   est donc un miroir du nombre, pas un réglage de plus — deux réglages pour
   une seule idée finissent toujours par se contredire. */
const BASCULES_NUMERIQUES = { moisson_auto_jours: 7, auto_purger_jours: 30 };

function majRegles() {
  Object.entries(BASCULES_NUMERIQUES).forEach(([cle, defaut]) => {
    const bascule = $(`[data-bascule="${cle}"]`);
    if (bascule) bascule.checked = Number(config[cle] || 0) > 0;
    const champ = $(`[data-cfg="${cle}"]`);
    if (champ && !Number(champ.value)) champ.value = defaut;
  });

  const etats = {
    "regle-collecte": "collecte_auto",
    "regle-moisson": "moisson_auto_jours",
    "regle-ia": "llm_actif",
    "regle-valider": "auto_valider",
    "regle-rejeter": "auto_rejeter",
    "regle-publier": "auto_publier",
    "regle-purger": "auto_purger_jours",
  };
  Object.entries(etats).forEach(([id, cle]) => {
    const bloc = $(`#${id}`);
    if (!bloc) return;
    const actif = Boolean(
      typeof config[cle] === "number" ? Number(config[cle]) > 0 : config[cle]
    );
    bloc.classList.toggle("active", actif);
    const marque = $(".marque-etat", bloc);
    if (marque) marque.textContent = actif ? "actif" : "éteint";
  });
}

async function enregistrerConfig() {
  const nouveau = {};
  $$("[data-cfg]").forEach((el) => {
    if (el.type === "checkbox") nouveau[el.dataset.cfg] = el.checked;
    else if (el.type === "number") nouveau[el.dataset.cfg] = Number(el.value);
    else nouveau[el.dataset.cfg] = el.value;
  });
  // Un interrupteur éteint met le nombre à zéro ; allumé, il rend au champ sa
  // valeur (ou celle par défaut si le champ est vide).
  Object.entries(BASCULES_NUMERIQUES).forEach(([cle, defaut]) => {
    const bascule = $(`[data-bascule="${cle}"]`);
    if (!bascule) return;
    nouveau[cle] = bascule.checked ? Number(nouveau[cle]) || defaut : 0;
  });
  const champHeures = $("#heures-collecte");
  if (champHeures) {
    const heures = champHeures.value
      .split(",")
      .map((h) => h.trim())
      .filter((h) => /^\d{1,2}:\d{2}$/.test(h));
    if (heures.length) nouveau.heures_collecte = heures;
  }
  config = await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({ config: nouveau }),
  });
  majRegles();
  rafraichirEtat();
  toast("Automatisation enregistrée.", "succes");
}

["#btn-auto-enregistrer", "#btn-auto-enregistrer-2"].forEach((sel) => {
  const bouton = $(sel);
  if (bouton) bouton.addEventListener("click", enregistrerConfig);
});

$$("[data-cfg], [data-bascule]").forEach((el) =>
  el.addEventListener("change", () => {
    // ⚠ UN MÊME RÉGLAGE PEUT APPARAÎTRE DANS DEUX ONGLETS. Sans cette recopie,
    //   changer `llm_actif` dans Automatisation puis enregistrer reprendrait la
    //   valeur PÉRIMÉE restée dans Réglages — l'enregistrement parcourt le
    //   document dans l'ordre, et le dernier trouvé gagne.
    if (el.dataset.cfg) {
      $$(`[data-cfg="${el.dataset.cfg}"]`).forEach((jumeau) => {
        if (jumeau === el) return;
        if (jumeau.type === "checkbox") jumeau.checked = el.checked;
        else jumeau.value = el.value;
      });
    }
    // Le plan se met à jour à la volée : on voit l'effet du réglage avant de
    // l'enregistrer, pas après.
    if (el.type === "checkbox") majRegles();
  })
);

$("#btn-auto-essai").addEventListener("click", async () => {
  const bouton = $("#btn-auto-essai");
  const zone = $("#etat-essai");
  bouton.disabled = true;
  await enregistrerConfig();
  try {
    const r = await api("/api/automatisation/essai", { method: "POST" });
    zone.hidden = false;
    zone.innerHTML =
      `<span class="pastille-etat ok">Essai fait</span> <span>${echapper(r.message)}</span>`;
    chargerListe();
  } catch (e) {
    zone.hidden = false;
    zone.innerHTML = `<span class="pastille-etat ko">Échec</span> <span>${echapper(e.message)}</span>`;
  }
  bouton.disabled = false;
  rafraichirEtat();
});

/* ── Réglages ────────────────────────────────────────────────────── */
async function chargerReglages() {
  config = await api("/api/config");
  $$("[data-cfg]").forEach((el) => {
    const valeur = config[el.dataset.cfg];
    if (valeur === undefined) return;
    if (el.type === "checkbox") el.checked = Boolean(valeur);
    else el.value = valeur;
  });
  majRegles();
  $("#grille-reglages").innerHTML = Object.entries(REGLAGES)
    .map(([cle, label]) => {
      const v = config[cle];
      if (typeof v === "boolean")
        return `<div class="reglage"><label>${label}</label>
          <label><input type="checkbox" data-cfg="${cle}" ${v ? "checked" : ""}> activé</label></div>`;
      return `<div class="reglage"><label>${label}</label>
        <input type="number" step="any" data-cfg="${cle}" value="${v}"></div>`;
    })
    .join("");
}

// Un seul chemin d'enregistrement pour toute la configuration : deux boutons
// qui écrivent différemment finissent par écrire des choses différentes.
$("#btn-reglages").addEventListener("click", enregistrerConfig);

$("#btn-test-llm").addEventListener("click", async () => {
  const zone = $("#etat-llm");
  const bouton = $("#btn-test-llm");
  bouton.disabled = true;
  zone.querySelector("span").textContent = "Test en cours… (jusqu'à 2 minutes)";
  // On enregistre avant de tester, sinon on teste l'ancien réglage.
  await $("#btn-reglages").click();
  try {
    const r = await api("/api/llm/test", { method: "POST" });
    zone.querySelector("span").innerHTML =
      `<span class="pastille-etat ok">Relecture opérationnelle</span> ` +
      `${echapper(r.modele)} · a lu « ${echapper(r.genre_lu || "?")} »` +
      (r.nom_lu ? ` — « ${echapper(r.nom_lu)} »` : "") +
      ` · ${r.plats_lus || 0} plat(s)` +
      (r.confiance != null ? ` (confiance ${r.confiance}/100)` : "");
  } catch (e) {
    zone.querySelector("span").innerHTML =
      `<span class="pastille-etat ko">Échec</span> ${echapper(e.message).slice(0, 180)}`;
  }
  bouton.disabled = false;
});

/* ── Démarrage ───────────────────────────────────────────────────── */
rafraichirEtat();
setInterval(rafraichirEtat, 2000);
chargerSources();
chargerReglages();
chargerSuggestions();

/* ------------------------------------------------------------------------ *
 *  Nouvelles sources : le bot cherche, vous tranchez.
 * ------------------------------------------------------------------------ */
const cochesTrouvailles = new Set();
const cochesCandidats = new Set();
let origineCandidats = "";

async function chargerCandidats() {
  let d;
  try {
    d = await api(`/api/candidats?origine=${origineCandidats}`);
  } catch (e) {
    toast(e.message, "erreur");
    return;
  }
  const liste = $("#liste-candidats");
  const vide = $("#candidats-vide");
  $("#nb-requetes").textContent = (d.requetes || []).length;
  if (!$("#requetes-prospection").value) {
    $("#requetes-prospection").value = (d.requetes || []).join("\n");
  }

  const sous = d.sous_le_seuil
    ? ` · ${d.sous_le_seuil} écarté(s) sous ${d.seuil}/100`
    : "";
  $("#etat-candidats").textContent =
    `${d.candidats.length} en attente${sous} · ${d.compteurs.adopte || 0} adoptée(s)`;

  vide.hidden = d.candidats.length > 0;
  liste.innerHTML = d.candidats
    .map((c) => {
      const eff = c.effectif
        ? `${c.effectif.toLocaleString("fr-FR")} ${c.genre === "page" ? "abonnés" : "membres"}`
        : c.origine === "fil"
        ? ""
        : "effectif inconnu";
      const ryt = c.rythme ? `${c.rythme} pub./jour` : "";
      // Une source repérée sur le fil se juge sur ce qu'elle a DONNÉ.
      const vu = c.vues
        ? `<strong>${c.retenues}/${c.vues}</strong> utiles` +
          (c.publiees ? ` · <strong>${c.publiees}</strong> publiée(s)` : "")
        : "";
      const alertes = (c.alertes || [])
        .map((a) => `<li>${echapper(a)}</li>`)
        .join("");
      const barres = (c.details || [])
        .map(
          (x) => `<span class="mini-brique" title="${echapper(x.motif)}">
              ${echapper(x.cle)} <i style="width:${(x.points / x.sur) * 100}%"></i>
            </span>`
        )
        .join("");
      return `<article class="candidat ${c.niveau}">
        <label class="candidat-choix">
          <input type="checkbox" data-cand="${c.cle}" ${
            cochesCandidats.has(c.cle) ? "checked" : ""
          }>
          <span class="note-mini ${c.note >= 78 ? "bon" : ""}">${c.note}</span>
        </label>
        <div class="candidat-corps">
          <h3>${echapper(c.nom)}
            <span class="badge ${c.genre}">${c.genre}</span>
            ${c.origine === "fil" ? '<span class="badge fil">vu sur le fil</span>' : ""}
            ${c.prive ? '<span class="badge manque">privé</span>' : ""}
          </h3>
          <p class="candidat-chiffres">
            ${vu ? vu + (eff || ryt ? " · " : "") : ""}
            ${eff ? `<strong>${eff}</strong>` : ""}${ryt ? " · " + ryt : ""}
            ${c.categorie ? " · " + echapper(c.categorie) : ""}
            ${c.lieu ? " · " + echapper(c.lieu) : ""}
          </p>
          <div class="candidat-barres">${barres}</div>
          ${alertes ? `<ul class="candidat-alertes">${alertes}</ul>` : ""}
          <p class="discret">${
            c.origine === "fil"
              ? "Repéré sur votre fil d'actualité"
              : `Trouvé par « ${echapper(c.requete || "")} »`
          } —
            <a href="${c.url}" target="_blank" rel="noopener">${
              c.genre === "site" ? "voir le site" : "voir sur Facebook"
            }</a></p>
        </div>
        <div class="candidat-actions">
          <button class="bouton" data-decider="ecarte" data-cle="${c.cle}">Écarter</button>
          <button class="bouton principal" data-decider="adopte" data-cle="${c.cle}">Adopter</button>
        </div>
      </article>`;
    })
    .join("");

  liste.querySelectorAll("[data-cand]").forEach((c) =>
    c.addEventListener("change", () => {
      c.checked ? cochesCandidats.add(c.dataset.cand) : cochesCandidats.delete(c.dataset.cand);
      majChoixCandidats();
    })
  );
  liste.querySelectorAll("[data-decider]").forEach((b) =>
    b.addEventListener("click", () => trancher(b.dataset.cle, b.dataset.decider))
  );
  majChoixCandidats();
}

function majChoixCandidats() {
  $("#cand-compte").textContent = `${cochesCandidats.size} sélectionné(s)`;
}

async function trancher(cle, decision) {
  try {
    await api(`/api/candidats/${encodeURIComponent(cle)}/${decision}`, { method: "POST" });
    cochesCandidats.delete(cle);
    toast(decision === "adopte" ? "Source ajoutée." : "Candidat écarté.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  chargerCandidats();
  rafraichirEtat();
}

async function trancherLot(decision) {
  if (!cochesCandidats.size) return toast("Rien de coché.", "erreur");
  const n = cochesCandidats.size;
  if (
    decision === "adopte" &&
    !confirm(`Ajouter ${n} source(s) ? Chaque source ajoute du temps à chaque collecte.`)
  )
    return;
  try {
    await api(`/api/candidats/lot/${decision}`, {
      method: "POST",
      body: JSON.stringify({ ids: [...cochesCandidats] }),
    });
    cochesCandidats.clear();
    toast(`${n} source(s) ${decision === "adopte" ? "adoptée(s)" : "écartée(s)"}.`);
  } catch (e) {
    toast(e.message, "erreur");
  }
  chargerCandidats();
}

$$(".filtres-candidats .puce").forEach((b) =>
  b.addEventListener("click", () => {
    origineCandidats = b.dataset.origine;
    $$(".filtres-candidats .puce").forEach((p) =>
      p.classList.toggle("actif", p === b)
    );
    chargerCandidats();
  })
);

$("#btn-cand-adopter").addEventListener("click", () => trancherLot("adopte"));
$("#btn-cand-ecarter").addEventListener("click", () => trancherLot("ecarte"));
$("#cand-tout").addEventListener("click", (e) => {
  e.preventDefault();
  $$("#liste-candidats [data-cand]").forEach((c) => {
    c.checked = true;
    cochesCandidats.add(c.dataset.cand);
  });
  majChoixCandidats();
});
$("#cand-rien").addEventListener("click", (e) => {
  e.preventDefault();
  $$("#liste-candidats [data-cand]").forEach((c) => (c.checked = false));
  cochesCandidats.clear();
  majChoixCandidats();
});

$("#btn-prospecter-sources").addEventListener("click", async () => {
  try {
    await api("/api/candidats/prospecter", { method: "POST" });
    toast("Recherche lancée — elle prend quelques minutes, suivez le journal.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
});

$("#btn-requetes").addEventListener("click", async () => {
  const requetes = $("#requetes-prospection")
    .value.split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  try {
    // ⚠ La route est un PUT qui attend `{config: {...}}` : en POST avec le
    //   corps nu, le serveur répondait 405 et les recherches n'étaient JAMAIS
    //   enregistrées — le bouton disait pourtant « enregistrées ».
    config = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify({ config: { prospection_requetes: requetes } }),
    });
    $("#nb-requetes").textContent = requetes.length;
    toast(`${requetes.length} recherche(s) enregistrée(s).`);
  } catch (e) {
    toast(e.message, "erreur");
  }
});
