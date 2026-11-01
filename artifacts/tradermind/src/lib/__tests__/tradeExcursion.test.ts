import { describe, expect, it } from 'vitest';
import { computeExcursion, describeExcursion, mergeManualExcursion, parsePriceInput, readManualExcursion } from '../tradeExcursion';

describe('tradeExcursion', () => {
  it('parses Persian digits and decimal separators', () => {
    expect(parsePriceInput('۱٫۰۸۵۲')).toBeCloseTo(1.0852);
    expect(parsePriceInput('1,0852')).toBeCloseTo(1.0852);
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('abc')).toBeNull();
  });

  it('computes MFE/MAE in R for a long trade', () => {
    const result = computeExcursion({ direction: 'long', entryPrice: 100, stopLoss: 98, highPrice: 105, lowPrice: 99 });
    expect(result).toEqual({ risk: 2, mfeR: 2.5, maeR: -0.5 });
  });

  it('computes MFE/MAE in R for a short trade and clamps signs', () => {
    const result = computeExcursion({ direction: 'short', entryPrice: 100, stopLoss: 102, highPrice: 101, lowPrice: 96 });
    expect(result).toEqual({ risk: 2, mfeR: 2, maeR: -0.5 });
    const clamped = computeExcursion({ direction: 'long', entryPrice: 100, stopLoss: 98, highPrice: 99, lowPrice: 101 });
    expect(clamped).toMatchObject({ mfeR: 0, maeR: 0 });
  });

  it('returns null when risk is zero', () => {
    expect(computeExcursion({ direction: 'long', entryPrice: 100, stopLoss: 100, highPrice: 101, lowPrice: 99 })).toBeNull();
  });

  it('merges into existing live monitoring without losing other data and can clear', () => {
    const existing = JSON.stringify({ state: 'closed', events: [{ id: 'e1' }], rProgression: [] });
    const merged = JSON.parse(mergeManualExcursion(existing, { highPrice: 105, lowPrice: 99, mfeR: 2.5, maeR: -0.5 }, 1));
    expect(merged.events).toEqual([{ id: 'e1' }]);
    expect(merged).toMatchObject({ maxFavorableExcursion: 2.5, maxAdverseExcursion: -0.5 });
    expect(readManualExcursion(JSON.stringify(merged))).toEqual({ highPrice: 105, lowPrice: 99 });
    const cleared = JSON.parse(mergeManualExcursion(JSON.stringify(merged), null, 2));
    expect(cleared.maxFavorableExcursion).toBeNull();
    expect(cleared.manualExcursion).toBeUndefined();
    const fresh = JSON.parse(mergeManualExcursion(null, { highPrice: 1, lowPrice: 0, mfeR: 1, maeR: 0 }, 3));
    expect(Array.isArray(fresh.events)).toBe(true);
  });

  it('describes given-back profit and near-stop winners', () => {
    const lines = describeExcursion({ risk: 2, mfeR: 3, maeR: -0.8 }, 1);
    expect(lines).toHaveLength(2);
    expect(describeExcursion({ risk: 2, mfeR: 0.2, maeR: -0.1 }, 0.1)).toEqual([]);
  });
});
