# Les documents de Diako

Index de `docs/`. Le dépôt est **public** — aucun de ces fichiers ne doit
contenir de clé, de mot de passe ni de donnée personnelle.

---

## Le document de référence

### [`TDR-DIAKO.md`](TDR-DIAKO.md) — Termes de référence, v1.0 du 31/07/2026

Ce qu'on construit, pourquoi, et comment. **À lire avant toute décision de
fond.** Établi à partir d'un audit de l'intégralité du code de Fonenako et de
l'ancien Diako.

| § | Ce qu'on y trouve | Quand y aller |
|---|---|---|
| [§0](TDR-DIAKO.md#0-résumé-pour-décision) | Résumé pour décision, les 7 choix structurants | Pour comprendre le projet en 5 minutes |
| [§1](TDR-DIAKO.md#1-contexte-vision-positionnement) | Contexte, vision, positionnement | Avant d'écrire un texte destiné au public |
| [§2](TDR-DIAKO.md#2-objectifs-périmètre-non-objectifs) | Objectifs, périmètre, **non-objectifs** | Avant d'ajouter une fonctionnalité |
| [§3](TDR-DIAKO.md#3-utilisateurs-et-parcours) | Les 5 personas et leurs parcours | **Avant toute décision de design** |
| [§4](TDR-DIAKO.md#4-architecture-technique) | Architecture, dépôt, déploiement | |
| [§5](TDR-DIAKO.md#5-modèle-de-données) | Modèle de données `PAGE → OFFRE → TARIF` | Avant toute migration |
| [§6](TDR-DIAKO.md#6-le-moteur-de-recherche--la-fonction-signature) | Le moteur de recherche | |
| [§7](TDR-DIAKO.md#7-le-fil-infini) | Le fil infini, curseur et classement | |
| [§8](TDR-DIAKO.md#8-les-pages-professionnelles-et-lespace-gestionnaire) | Pages pro et espace gestionnaire | |
| [§9](TDR-DIAKO.md#9-sécurité-droits-daccès-et-conformité) | **Sécurité et RLS** | Avant de toucher aux droits |
| [§10](TDR-DIAKO.md#10-performance-coûts-et-exploitation) | Performance, egress, référencement | Avant d'ajouter une dépendance |
| [§11](TDR-DIAKO.md#11-identité-design-et-expérience-mobile) | **Identité, design, mobile** | ⭐ Point de départ de toute refonte visuelle |
| [§12](TDR-DIAKO.md#12-monétisation) | Monétisation | |
| [§13](TDR-DIAKO.md#13-contenu-initial-et-amorçage) | Contenu initial — **le vrai risque du projet** | |
| [§14](TDR-DIAKO.md#14-lotissement-planning-et-livrables) | Lots et planning | |
| [§15](TDR-DIAKO.md#15-risques-et-parades) | Risques | |
| [§16](TDR-DIAKO.md#16-décisions-à-trancher) | Décisions à trancher | |
| [Annexe A](TDR-DIAKO.md#annexe-a--correspondance-fonenako--diako) | Correspondance Fonenako → Diako | |
| [Annexe B](TDR-DIAKO.md#annexe-b--les-20-pièges-à-ne-jamais-reproduire) | ⚠️ **Les 20 pièges à ne jamais reproduire** | Avant chaque vague |

> ⚠️ La charte du §11 a **évolué depuis** : le fond est passé au papier
> `#FAF6EF`, le primaire au teal profond `#0F5C5A` et l'accent du corail à la
> brique `#B4472F`. Le §11 reste valable pour la méthode (contrastes AA,
> densité mobile, cibles 44 px, Inter auto-hébergée) — pour les valeurs
> actuelles, se reporter à [`PROMPT-1-DIRECTION-DESIGN.md`](PROMPT-1-DIRECTION-DESIGN.md) §3.

---

## Les prompts de délégation

Documents autonomes, écrits pour être **copiés-collés dans une conversation
Claude** qui n'a pas accès au dépôt. Tout ce qui est nécessaire y est recopié.

### [`PROMPT-1-DIRECTION-DESIGN.md`](PROMPT-1-DIRECTION-DESIGN.md)
Confie la **direction artistique** : les 4 personas, la charte actuelle avec ses
ratios de contraste, les contraintes non négociables, et surtout **ce qui existe
vraiment en base face à ce qui n'existe pas encore**.
→ Rend un rapport : parti pris, système complet, langage de mouvement, trois
écrans détaillés.

### [`PROMPT-2-MODERNISER-TOUTES-LES-PAGES.md`](PROMPT-2-MODERNISER-TOUTES-LES-PAGES.md)
Confie la **modernisation des 53 entrées** du produit : 21 routes, 22 composants
partagés, 8 éléments transverses. Rien n'est écarté.
→ Rend un rapport écran par écran, plus un ordre d'exécution en trois lots.

---

## Les procédures

### [`supabase-config-manuelle.md`](supabase-config-manuelle.md)
Les réglages qui **ne peuvent pas** passer par une migration et doivent être
faits à la main dans la console Supabase.

---

## Ailleurs dans le dépôt

| Où | Quoi |
|---|---|
| [`../README.md`](../README.md) | Démarrer, les règles du projet, l'état d'avancement |
| [`../supabase/migrations/`](../supabase/migrations/) | **La seule source de vérité du schéma.** Chaque fichier porte en tête ce qu'il corrige et pourquoi |
| [`../supabase/functions/`](../supabase/functions/) | Les fonctions serveur : l'agent de voyage, l'envoi des notifications push |
