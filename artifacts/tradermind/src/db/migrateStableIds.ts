import { Transaction } from 'dexie';
import { runAsRemote, SYNC_META_TABLES } from './syncSupport';
import {
  DEFAULT_ACCOUNT_ID, DEFAULT_CHECKLIST_ID, DEFAULT_COLLECTION_IDS, stableOptionId,
} from './defaultIds';

/** جایگزینی شناسه در رشته، JSON داخل رشته، آرایه و آبجکت ساده. اگر چیزی عوض نشود همان مرجع برمی‌گردد. */
function remap(value: any, map: Map<string, string>): any {
  if (typeof value === 'string') {
    const direct = map.get(value);
    if (direct !== undefined) return direct;
    if (value.length > 1 && (value[0] === '[' || value[0] === '{')) {
      try {
        const parsed = JSON.parse(value);
        const next = remap(parsed, map);
        if (next !== parsed) return JSON.stringify(next);
      } catch { /* JSON نیست */ }
    }
    return value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(v => { const n = remap(v, map); if (n !== v) changed = true; return n; });
    return changed ? out : value;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false;
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      const n = remap(v, map);
      if (n !== v) changed = true;
      out[k] = n;
    }
    return changed ? out : value;
  }
  return value; // Blob, Date, عدد، ...
}

const byCreated = (a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0);
const PK_TABLES = ['journalOptions', 'screenshotCollections', 'accounts', 'preTradeChecklists'];
const DEFAULT_ACCOUNT_NAMES = new Set(['حساب اصلی', 'main account']);

export async function migrateToStableIds(tx: Transaction, tableNames: string[]): Promise<void> {
  const map = new Map<string, string>();

  const plan = async (table: string, pick: (rows: any[]) => [any, string][]) => {
    const rows = (await tx.table(table).toArray()).sort(byCreated);
    const used = new Set<string>(rows.map(r => r.id));
    for (const [row, newId] of pick(rows)) {
      if (row.id === newId || used.has(newId)) continue;
      used.add(newId);
      map.set(row.id, newId);
    }
  };

  await plan('journalOptions', rows =>
    rows.map((o): [any, string] => [o, stableOptionId(o.category, o.label)]));
  await plan('screenshotCollections', rows =>
    rows.filter(c => c.isDefault && DEFAULT_COLLECTION_IDS[c.name])
        .map((c): [any, string] => [c, DEFAULT_COLLECTION_IDS[c.name]]));
  await plan('accounts', rows => {
    const a = rows.find(r =>
      !r.isArchived &&
      r.isDefault &&
      DEFAULT_ACCOUNT_NAMES.has(String(r.name ?? '').trim().toLowerCase()),
    );
    return a ? [[a, DEFAULT_ACCOUNT_ID]] : [];
  });
  await plan('preTradeChecklists', rows => {
    const c = rows.find(r => r.isDefault);
    return c ? [[c, DEFAULT_CHECKLIST_ID]] : [];
  });

  if (!map.size) return;

  await runAsRemote(async () => {
    for (const name of tableNames) {
      if (SYNC_META_TABLES.includes(name)) continue;
      const table = tx.table(name);
      if (PK_TABLES.includes(name)) {
        for (const row of await table.toArray()) {
          const next = remap(row, map);
          if (next === row) continue;
          if (next.id !== row.id) await table.delete(row.id);
          await table.put(next);
        }
      } else {
        await table.toCollection().modify((row: any) => {
          const next = remap(row, map);
          if (next !== row) Object.assign(row, next);
        });
      }
    }
  });
}
