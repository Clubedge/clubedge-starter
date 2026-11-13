// What the web app's build for the app (Vite's "app" mode) puts in import.meta.env for this
// package. Vite replaces each value when it builds; tests set them with vi.stubEnv.
interface ImportMetaEnv {
  /**
   * In a demo build, the GitHub repository whose latest release the demo asks to be updated to,
   * such as "Clubedge/clubedge-starter". Unset, the demo asks for no update.
   */
  readonly VITE_DEMO_RELEASES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
