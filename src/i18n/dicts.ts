import en, { type Dict } from './locales/en';

export type { Dict };

// All 20 locale dicts are fully translated (machine-translated via Google
// Translate, spot-checked for hi/ar/de; ar "PDF" acronym hand-fixed).
// The Dict type keeps every locale structurally identical to English so the
// build fails loudly on drift.
import hi from './locales/hi';
import bn from './locales/bn';
import as_ from './locales/as';
import es from './locales/es';
import pt from './locales/pt';
import fr from './locales/fr';
import ar from './locales/ar';
import ur from './locales/ur';
import zh from './locales/zh';
import ja from './locales/ja';
import ko from './locales/ko';
import ru from './locales/ru';
import id from './locales/id';
import de from './locales/de';
import tr from './locales/tr';
import it from './locales/it';
import vi from './locales/vi';
import th from './locales/th';
import ta from './locales/ta';

export const dicts: Record<string, Dict> = {
  en, hi, bn, as: as_, es, pt, fr, ar, ur, zh, ja, ko, ru, id, de, tr, it, vi, th, ta,
};

export function getDict(locale: string): Dict {
  return dicts[locale] ?? en;
}
