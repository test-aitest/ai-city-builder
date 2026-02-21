import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { viteApiPlugin } from './vite-api-plugin.ts';

export default defineConfig({
  base: '/',
  root: './src',
  envDir: '../',
  publicDir: './public',
  build: {
    outDir: './dist'
  },
  plugins: [
    tailwindcss(),
    viteApiPlugin(),
  ],
});
