import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { viteApiPlugin } from './vite-api-plugin';

export default defineConfig({
  base: '/',
  root: './src',
  publicDir: './public',
  build: {
    outDir: './dist'
  },
  plugins: [
    tailwindcss(),
    viteApiPlugin(),
  ],
});
