import Dexie from 'dexie';
import { Account, db, TradingBox } from '../db/database';

function uuid(): string {
  return crypto.randomUUID();
}

export function isTradingBoxAvailableForAccount(box: TradingBox, account: Account | undefined): boolean {
  if (!account) return !box.accountId;
  if (!box.accountId) return true;
  if (box.accountId === account.id) return true;
  if (Array.isArray(account.tradingBoxIds)) return account.tradingBoxIds.includes(box.id);
  return false;
}

export const tradingBoxService = {
  async getAll(): Promise<TradingBox[]> {
    return db.tradingBoxes.orderBy('createdAt').reverse().toArray();
  },

  async getById(id: string): Promise<TradingBox | undefined> {
    return db.tradingBoxes.get(id);
  },

  async create(data: Omit<TradingBox, 'id' | 'createdAt' | 'updatedAt'>): Promise<TradingBox> {
    const now = Date.now();
    const box: TradingBox = {
      id: uuid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    await db.tradingBoxes.add(box);
    return box;
  },

  async update(id: string, data: Partial<Omit<TradingBox, 'id' | 'createdAt'>>): Promise<void> {
    await db.tradingBoxes.update(id, { ...data, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.tradingBoxes.delete(id);
  },

  /** تعداد معاملات یک باکس */
  async getTradeCount(boxId: string): Promise<number> {
    // ایندکس boxId از نسخه ۱۹ به بعد وجود دارد. filter به‌عنوان مسیر
    // مقاوم برای دیتابیس‌هایی که هنوز مهاجرتشان کامل نشده باقی می‌ماند.
    try {
      return await db.trades.where('boxId').equals(boxId).count();
    } catch (error) {
      if (error instanceof Dexie.SchemaError) {
        return db.trades.filter(trade => trade.boxId === boxId).count();
      }
      throw error;
    }
  },
};
