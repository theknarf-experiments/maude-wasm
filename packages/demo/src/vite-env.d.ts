/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Repository URL for the GitHub link in the sidebar, provided at build
   * time (e.g. `VITE_REPO_URL=https://github.com/user/repo pnpm build`).
   * Absent means the link is not rendered.
   */
  readonly VITE_REPO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
