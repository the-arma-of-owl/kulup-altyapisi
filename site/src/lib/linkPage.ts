/** Yaka kartı QR sayfası (/link): site çerçevesi (navbar, footer, kenar kutuları, uygulama önerisi) gizlenir. */
export const isLinkPage = (pathname: string): boolean => /^(\/(tr|en))?\/link\/?$/.test(pathname)
