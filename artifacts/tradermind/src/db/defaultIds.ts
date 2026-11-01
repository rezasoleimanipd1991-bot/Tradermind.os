export const DEFAULT_ACCOUNT_ID = 'default:account';
export const DEFAULT_CHECKLIST_ID = 'default:checklist';

export const DEFAULT_COLLECTION_IDS: Record<string, string> = {
  'بهترین معاملات': 'default:collection:best-trades',
  'بدترین معاملات': 'default:collection:worst-trades',
  'نمونه‌های یادگیری': 'default:collection:learning',
  'اشتباهات': 'default:collection:mistakes',
};

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** شناسه‌ی قطعی گزینه‌ی ژورنال: دو دستگاه برای یک گزینه‌ی هم‌نام شناسه‌ی یکسان می‌سازند */
export const stableOptionId = (category: string, label: string) =>
  `opt:${category}:${norm(label)}`;
