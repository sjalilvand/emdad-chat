// ابزارهای نرمال‌سازی متن فارسی برای جستجو و امتیازدهی

const AR_CHAR_MAP: Record<string, string> = {
  'ي': 'ی', 'ك': 'ک', 'ۀ': 'ه', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا',
  'ؤ': 'و', 'ئ': 'ی', 'ٱ': 'ا', '٠': '0', '١': '1', '٢': '2', '٣': '3',
  '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5',
  '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '\u064B': '', '\u064C': '', '\u064D': '', '\u064E': '', '\u064F': '',
  '\u0650': '', '\u0651': '', '\u0652': '', '\u0653': '', '\u0654': '', '\u0655': '',
  '«': ' ', '»': ' ', '،': ' ', '؛': ' ', '؟': ' ', '!': ' ', '.': ' ',
  ':': ' ', ';': ' ', '(': ' ', ')': ' ', '[': ' ', ']': ' ', '{': ' ', '}': ' ',
  '"': ' ', "'": ' ', '/': ' ', '\\': ' ', '-': ' ', '–': ' ', '—': ' ',
  '*': ' ', '#': ' ', '$': ' ', '%': ' ', '&': ' ', '+': ' ', '=': ' ',
  '<': ' ', '>': ' ', '|': ' ', '~': ' ', '`': ' ', '^': ' ', '@': ' ',
  '\u200C': ' ', '\u200F': ' ', '\u200E': ' ',
};

export function normalizePersian(text: string): string {
  if (!text) return '';
  let out = '';
  for (const ch of text) {
    out += AR_CHAR_MAP[ch] !== undefined ? AR_CHAR_MAP[ch] : ch;
  }
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function tokenize(text: string): string[] {
  const norm = normalizePersian(text);
  if (!norm) return [];
  return norm.split(' ').filter((t) => t.length > 1);
}

// حذف پسوندهای رایج برای جستجوی بهتر (stemming سبک فارسی)
const PREFIXES = ['می', 'نمی', 'بی', 'نا'];
const SUFFIXES = ['ها', 'های', 'هایی', 'ان', 'ترین', 'تر', 'ام', 'ات', 'اش', 'ای'];

export function stemToken(token: string): string {
  let t = token;
  for (const p of PREFIXES) {
    if (t.length > 4 && t.startsWith(p)) {
      t = t.slice(p.length);
      break;
    }
  }
  for (const s of SUFFIXES) {
    if (t.length > 4 && t.endsWith(s)) {
      t = t.slice(0, -s.length);
      break;
    }
  }
  return t;
}

export function extractQueryTerms(query: string): string[] {
  const tokens = tokenize(query);
  const stems = tokens.map(stemToken);
  return Array.from(new Set([...tokens, ...stems]));
}
