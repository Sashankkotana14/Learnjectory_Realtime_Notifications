// Premium dark-purple design tokens. The legacy `sky`, `indigo` and `blue` palettes used across every page are remapped to the
// purple/violet scale, so all existing pages pick up the new theme without changing any markup or behaviour.
const violet = { 50: '#F8F5FF', 100: '#F1EBFF', 200: '#DDD1FE', 300: '#C4B5FD', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9', 800: '#4C1D95', 900: '#2E1065', 950: '#1B0A3F' };
const orchid = { 50: '#FAF5FF', 100: '#F3E8FF', 200: '#E9D5FF', 300: '#D8B4FE', 400: '#C084FC', 500: '#A855F7', 600: '#9333EA', 700: '#7E22CE', 800: '#6B21A8', 900: '#3B1670', 950: '#1E0B3D' };
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { sky: violet, indigo: orchid, blue: violet,
      lj: { bg: '#100B1D', bg2: '#18112A', card: '#211632', elevated: '#291C3D', primary: '#8B5CF6', violet: '#A78BFA', pink: '#EC4899', cyan: '#67E8F9', text: '#F8F5FF', muted: '#B9AEC9' } },
  } },
  plugins: [],
};
