import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));

export default defineConfig({
  integrations: [react()],
  // Public URL of the deployed site; makes og:image/og:url/canonical absolute.
  site: process.env.SITE_URL || 'https://midi-mixer.wiiiimm.codes',
  build: { format: 'file' },
  trailingSlash: 'never',
  server: { host: '127.0.0.1', port: 8000 },
  devToolbar: { enabled: false },
  vite: {
    plugins: [{
      name: 'reload-public-assets',
      configureServer(server) {
        server.watcher.add(publicDirectory);
        server.watcher.on('change', file => {
          if (file.startsWith(publicDirectory)) {
            server.ws.send({ type: 'full-reload', path: '*' });
          }
        });
      },
    }],
  },
});
