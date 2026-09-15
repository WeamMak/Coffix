import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  // No local .env file may redirect the isolated browser to the developer API.
  envDir: '/tmp/coffix-e2e-no-env',
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
  server: {
    host: 'localhost', port: Number(process.env.COFFIX_E2E_ADMIN_PORT ?? 5320), strictPort: true,
    proxy: { '/api': process.env.COFFIX_E2E_API_URL ?? 'http://127.0.0.1:8320' },
  },
});
