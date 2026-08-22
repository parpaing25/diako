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

const REGLAGES = {
  posts_max_par_source: "Publications max par source",
  scrolls_max_par_source: "Défilements max par source",
  photos_max_par_trouvaille: "Photos max par trouvaille",
  largeur_photo_min: "Largeur mini d'une photo (px)",
  cote_photo_min: "Côté long mini pour une couverture (px)",
  cote_photo_max: "Côté long max à l'envoi (px)",
  qualite_photo: "Qualité JPEG (0-100)",
  jours_max: "Ignorer au-delà de (jours)",
  pause_entre_envois_photos: "Pause entre envois de photos (s)",
  navigateur_visible: "Afficher le navigateur",
  travailleurs: "Traitements en parallèle (hors Facebook)",
  garder_les_incompletes: "Garder les trouvailles incomplètes",
  publier_directement: "Publier en ligne (sinon en attente)",
};

let etatFiltres = { statut: "a_trier", genre: "", source_id: 0, recherche: "", tri: "score" };
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
  if (nom === "reglages") chargerReglages();
}

$$(".lien-statut").forEach((b) =>
  b.addEventListener("click", () => {
    etatFiltres.statut = b.dataset.statut;
    $$("#filtres-statut .puce").forEach((p) =>
      p.classList.toggle("actif", p.dataset.statut === b.dataset.statut)
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
  $("#pastille-trier").textContent = c.a_trier;

  const occupe = e.tache.actif;
  majCompteFacebook(e.session_fb, occupe && e.tache.type === "connexion", e.sources_actives);

  // Sans compte Facebook, la collecte ne peut rien faire : on l'empêche plutôt
  // que de la laisser échouer dans le journal.
  // Un compte Facebook n'est plus indispensable : les sources « site web » se
  // lisent sans lui. On ne bloque donc que s'il n'y a aucune source du tout.
  $("#btn-collecte").disabled = occupe || !e.sources_actives;
  $("#btn-lot").disabled = occupe;
  $("#btn-referentiel").disabled = occupe;
  $("#btn-moisson").disabled = occupe;
  $("#btn-arreter").disabled = !(occupe && e.tache.type === "collecte");

  const prog = $("#progression");
  prog.hidden = !occupe;
  if (occupe) {
    const libelles = {
      collecte: `Collecte${e.collecte.source ? " — " + e.collecte.source : ""} · ${e.collecte.trouvees} retenue(s)${c.en_traitement ? ` · ${c.en_traitement} en lecture` : ""}`,
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
        `<li><time>${new Date(l.ts).toLocaleTimeString("fr-FR")}</time>
         <span class="${l.niveau}">${echapper(l.message)}</span></li>`
    )
    .join("");
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
      return `<div class="trou ${t.inverse ? "comble" : ""}">
        <span class="chiffre-trou">${nombre(valeur)}</span>${
          total ? `<span class="etiquette"> / ${nombre(total)}</span>` : ""
        }
        <span class="quoi">${t.quoi}</span>
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

function majPlanning(p) {
  if (!p) return;
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
  const pastille = $("#etat-fb");
  pastille.classList.toggle("ok", connecte);
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
$("#etat-fb").addEventListener("click", () => {
  montrerVue("bord");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ── Boutons du tableau de bord ──────────────────────────────────── */
$("#btn-collecte").addEventListener("click", async () => {
  try {
    await api("/api/collecte/lancer", { method: "POST" });
    toast("Collecte lancée.");
  } catch (e) {
    toast(e.message, "erreur");
  }
  rafraichirEtat();
});

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

async function chargerListe() {
  const q = new URLSearchParams(etatFiltres);
  const liste = await api(`/api/trouvailles?${q}`);
  const grille = $("#grille");
  $("#vide").hidden = liste.length > 0;
  grille.innerHTML = liste.map(carte).join("");
  $$(".annonce", grille).forEach((el) =>
    el.addEventListener("click", () => ouvrir(el.dataset.id))
  );
}

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
    t.source_genre === "site" ? `<span class="badge recherche">site web</span>` : "",
    t.statut === "publiee" ? `<span class="badge ok">publiée</span>` : "",
    t.statut === "doublon" ? `<span class="badge doublon">doublon</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `<button class="annonce" data-id="${t.id}">
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
  </button>`;
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
    (t.date_post ? ` · ${jour(t.date_post)}` : "") +
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

    ${(t.lignes_chambre || []).length || t.source_genre === "site" ? blocChambres(t) : ""}

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
        <span class="rattache ${c.prix_ar ? "" : "non"}">${
          c.prix_ar
            ? echapper(
                (c.unite === "personne" ? "par personne" : "la chambre") +
                  (c.saison ? " · " + c.saison : "") +
                  (c.capacite ? " · " + c.capacite + " pers." : "")
              )
            : "sans prix — non publiable"
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

async function chargerSources() {
  const sources = await api("/api/sources");
  $("#table-sources tbody").innerHTML = sources
    .map((s) => {
      const [classe, libelle] = ETIQUETTE_SOURCE[s.genre] || ["", s.genre];
      return `<tr>
        <td><input type="checkbox" data-actif="${s.id}" ${s.actif ? "checked" : ""}></td>
        <td><span class="badge ${classe}">${libelle}</span></td>
        <td><input class="nom-source" data-nom="${s.id}" value="${echapper(s.nom)}"></td>
        <td class="url">${echapper(s.url)}</td>
        <td>${s.derniere_collecte ? new Date(s.derniere_collecte).toLocaleString("fr-FR") : "jamais"}</td>
        <td>${s.nb_trouvees}</td>
        <td><button class="bouton danger" data-suppr="${s.id}">Retirer</button></td>
      </tr>`;
    })
    .join("");

  $("#filtre-source").innerHTML =
    `<option value="0">Toutes les sources</option>` +
    sources
      .map((s) => `<option value="${s.id}">${echapper(s.nom)}</option>`)
      .join("");

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

/* ── Réglages ────────────────────────────────────────────────────── */
async function chargerReglages() {
  config = await api("/api/config");
  $$("[data-cfg]").forEach((el) => {
    const valeur = config[el.dataset.cfg];
    if (valeur === undefined) return;
    if (el.type === "checkbox") el.checked = Boolean(valeur);
    else el.value = valeur;
  });
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

$("#btn-reglages").addEventListener("click", async () => {
  const nouveau = {};
  $$("[data-cfg]").forEach((el) => {
    if (el.type === "checkbox") nouveau[el.dataset.cfg] = el.checked;
    else if (el.type === "number") nouveau[el.dataset.cfg] = Number(el.value);
    else nouveau[el.dataset.cfg] = el.value;
  });
  await api("/api/config", { method: "PUT", body: JSON.stringify({ config: nouveau }) });
  toast("Réglages enregistrés.", "succes");
});

$("#btn-planning").addEventListener("click", async () => {
  const heures = $("#heures-collecte")
    .value.split(",")
    .map((h) => h.trim())
    .filter((h) => /^\d{1,2}:\d{2}$/.test(h));
  if (!heures.length) return toast("Indiquez au moins une heure, ex. 11:00", "erreur");
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({
      config: {
        collecte_auto: $('[data-cfg="collecte_auto"]').checked,
        objectif_par_jour: Number($('[data-cfg="objectif_par_jour"]').value),
        heures_collecte: heures,
      },
    }),
  });
  toast("Collectes automatiques enregistrées.", "succes");
  rafraichirEtat();
});

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
