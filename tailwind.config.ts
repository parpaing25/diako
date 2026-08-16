import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      /* ⚠ LE QUATRIÈME SEUIL DU GABARIT v4. Tailwind s'arrête à `2xl` et il
         n'existait aucun palier au-delà de 1536 px — or c'est précisément à
         1920 que la troisième colonne du fil doit apparaître. `large` est ce
         palier, et il est dans `extend` : il s'AJOUTE aux seuils par défaut au
         lieu de les remplacer. Une clé `screens` posée à la racine de `theme`
         les effacerait tous. */
      screens: { large: "1920px" },
      colors: {
        or: "hsl(var(--or))",
        /* Jetons du DESIGN-HANDOFF §1, exposes a Tailwind. */
        "teal-soft": "hsl(var(--teal-soft))",
        "coral-soft": "hsl(var(--coral-soft))",
        gold: { DEFAULT: "hsl(var(--gold))", soft: "hsl(var(--gold-soft))" },
        "line-soft": "hsl(var(--line-soft))",
        ok: {
          DEFAULT: "hsl(var(--ok))",
          soft: "hsl(var(--ok-soft))",
          foreground: "hsl(var(--ok-foreground))",
        },
        warn: { DEFAULT: "hsl(var(--warn))", soft: "hsl(var(--warn-soft))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          strong: "hsl(var(--accent-strong))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sand: "hsl(var(--sand))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        // Serif et mono du SYSTEME : zero octet telecharge sur 3G.
        serif: ["Georgia", "Iowan Old Style", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Cascadia Mono", "Menlo", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
