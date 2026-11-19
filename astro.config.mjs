import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));

export default defineConfig({
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
