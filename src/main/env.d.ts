/**
 * electron-vite copies files imported with the `?asset` suffix into the build
 * output and resolves the import to their runtime path (string).
 */
declare module '*?asset' {
  const assetPath: string
  export default assetPath
}

/**
 * OAuth app client ids (public; device flow needs no secret), injected at build
 * time from CYREX_{GITHUB,GITLAB}_CLIENT_ID via a Vite `define`. Empty string
 * when unset — device-flow login is then unavailable and token paste is used.
 */
declare const __GITHUB_CLIENT_ID__: string
declare const __GITLAB_CLIENT_ID__: string
