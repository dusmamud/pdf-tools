const rawBase: string = import.meta.env.BASE_URL;
// Normalize: '/pdf-tools/' -> '/pdf-tools' (BASE_URL may or may not trail-slash)
const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

export function homeUrl(locale: string): string {
  return locale === 'en' ? `${base}/` : `${base}/${locale}/`;
}

export function toolUrl(locale: string, slug: string): string {
  return locale === 'en' ? `${base}/${slug}/` : `${base}/${locale}/${slug}/`;
}

export function assetUrl(path: string): string {
  return `${base}/${path.replace(/^\//, '')}`;
}
