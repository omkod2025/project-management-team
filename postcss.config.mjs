// Tailwind v4 compiles only the sheet that imports it (src/app/shadcn.css);
// every other stylesheet passes through untouched.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
