import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative base so the same build works on movies.ezhdanov.com and on
// epzhdanov.github.io/movies/ before the custom domain is connected.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
