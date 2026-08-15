import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  /* ═══ LES EXCEPTIONS, NOMMEES ET JUSTIFIEES ═══════════════════════════════
     ⚠ POURQUOI DES EXCEPTIONS CIBLEES PLUTOT QU'UN LINT NON BLOQUANT. La CI
       laissait passer les erreurs (`continue-on-error`), ce qui revient a ne
       pas avoir de lint : seize erreurs y dormaient. Le lint devient bloquant,
       et les seuls cas legitimes sont declares ICI, un par un, avec leur
       raison. Une regle desactivee sans motif est une dette qui ne se voit
       plus ; une regle desactivee AVEC motif est une decision. */

  {
    // Les plugins Tailwind se chargent en `require()` : c'est la forme
    // attendue par l'outil, et le fichier n'est jamais embarque dans le
    // paquet du site.
    files: ["tailwind.config.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // shadcn/ui est du code VENDU tel quel. Le reecrire pour satisfaire le
    // lint le rendrait impossible a mettre a jour, et ces motifs (interface
    // vide qui etend un type, `any` sur une prop de Radix) viennent de la
    // bibliotheque, pas de nous.
    files: ["src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // `sessionStorage` leve en navigation privee sur iOS. Le catch vide est
    // le comportement voulu : la restauration de defilement est un confort,
    // pas une fonction — elle ne doit jamais faire echouer une page.
    files: ["src/hooks/useScrollRestore.ts"],
    rules: { "no-empty": "off" },
  },
  {
    // La fonction d'agent retire les caracteres de controle d'une saisie
    // utilisateur avant de la transmettre a un LLM : la classe de controle
    // dans l'expression reguliere est exactement le but recherche.
    files: ["supabase/functions/**"],
    rules: { "no-control-regex": "off" },
  },
);
