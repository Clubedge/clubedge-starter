/**
 * The website's public origin, which emailed links open. Pages the website serves are on it; a
 * build whose pages load from elsewhere, such as a mobile app's, sets VITE_PUBLIC_ORIGIN.
 */
export const publicOrigin: string = import.meta.env.VITE_PUBLIC_ORIGIN || window.location.origin;
