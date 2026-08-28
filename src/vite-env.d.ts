/// <reference types="vite/client" />

/**
 * The two build-time variables this app reads.
 *
 * Declared by name rather than left to Vite's loose index signature, so
 * `import.meta.env.VITE_API_URL` arrives as `string | undefined` and a typo in
 * a variable name is a compile error rather than a silent `undefined`.
 */
interface ImportMetaEnv {
  /** Absolute API origin in development; unset in production, where the SPA is
   *  served from the same host as `/rest/v1`. */
  readonly VITE_API_URL?: string
  /** Stands in for `window.location.hostname` when naming the tenant to the
   *  API. Required on localhost, whose hostname belongs to no institution. */
  readonly VITE_TENANT_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
