import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    host: 'localhost',
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        /*
         * Split by what a request actually needs, not by package name.
         *
         * The object form of `manualChunks` names entry MODULES, and neither
         * `react` nor `react-dom` is imported by that specifier at runtime —
         * the JSX transform pulls `react/jsx-runtime` and the entry pulls
         * `react-dom/client` — so the `react` chunk came out empty while React
         * itself ended up in the app bundle. Matching on the resolved path
         * catches every specifier a package exposes.
         *
         * `recharts` is the reason this matters: 400 kB of charting that only
         * the dashboards need. Combined with the route-level lazy loading in
         * `app/router.tsx`, someone who signs in and opens a roster never
         * downloads it.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@tanstack/react-router')) return 'router'
          if (id.includes('@tanstack/react-query')) return 'query'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'charts'
          }
          /* ~80 icons across Phosphor's six weights. Its own chunk because it
           * is stable between deploys — a release that touches only feature
           * code leaves this one in the browser cache. */
          if (id.includes('@phosphor-icons')) return 'icons'

          /* The rich-text editor. ONE screen in the product opens a document,
           * and swept into `vendor` by the catch-all below it is downloaded by
           * everybody who signs in — 600 kB for a page most readers never
           * open.
           *
           * `undefined` rather than a name of its own: naming it makes the
           * split circular (`vendor -> editor -> vendor`), because BlockNote
           * and the rest of `vendor` share modules in both directions, and a
           * circular chunk pair is an initialisation-order bug waiting for a
           * page load. Handing it back to Rollup lets it work the graph out —
           * and it does, because the only importer is a lazily loaded route,
           * so the result is a chunk nobody downloads until they open a
           * curriculum. */
          if (id.includes('@blocknote')) return undefined

          return 'vendor'
        },
      },
    },
  },
})
