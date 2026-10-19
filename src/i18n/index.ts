export { getDict, dicts } from './dicts';
export type { Dict } from './dicts';

export const rtlLocales = ['ar', 'ur'];

export function isRtl(locale: string): boolean {
  return rtlLocales.includes(locale);
}

/** Replace {name} placeholders in dict strings. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
