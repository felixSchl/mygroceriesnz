/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./{app,components,screens}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        foreground: "#020817",

        muted: "#F1F5F9",
        "muted-foreground": "#64748B",

        popover: "#FFFFFF",
        "popover-foreground": "#020817",

        card: "#FFFFFF",
        "card-foreground": "#020817",

        border: "#E2E8F0",
        input: "#E2E8F0",

        primary: "#0F172A",
        "primary-foreground": "#f8fafc",

        secondary: "#F1F5F9",
        "secondary-foreground": "#0F172A",

        accent: "#F1F5F9",
        "accent-foreground": "#0F172A",

        destructive: "#EF4444",
        "destructive-foreground": "#f8fafc",

        ring: "#020817",
      },
      fontSize: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.5rem",
        "2xl": "1.75rem",
        "3xl": "2rem",
        "4xl": "2.5rem",
        "5xl": "3rem",
        "6xl": "3.75rem",
        "7xl": "4.5rem",
        "8xl": "6rem",
        "9xl": "8rem",
      },
    },
  },
};
