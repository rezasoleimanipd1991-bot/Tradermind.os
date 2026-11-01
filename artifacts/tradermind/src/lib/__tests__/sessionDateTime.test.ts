import { describe, expect, it } from 'vitest';
import { describeSessionMoment, detectSessionKind, findSessionTypeOptionId, localDayKey } from '../sessionDateTime';

describe('sessionDateTime', () => {
  it('detects the session kind from the UTC hour', () => {
    expect(detectSessionKind(Date.UTC(2026, 9, 11, 3, 0))).toBe('asia');
    expect(detectSessionKind(Date.UTC(2026, 9, 11, 8, 30))).toBe('london');
    expect(detectSessionKind(Date.UTC(2026, 9, 11, 13, 0))).toBe('overlap');
    expect(detectSessionKind(Date.UTC(2026, 9, 11, 18, 0))).toBe('newyork');
    expect(detectSessionKind(Date.UTC(2026, 9, 11, 22, 0))).toBe('asia');
  });

  it('matches a session kind to the option by its label', () => {
    const options = [{ id: 'a', label: 'آسیا' }, { id: 'l', label: 'لندن' }, { id: 'o', label: 'همپوشانی لندن و نیویورک' }];
    expect(findSessionTypeOptionId(options, 'london')).toBe('l');
    expect(findSessionTypeOptionId(options, 'overlap')).toBe('o');
    expect(findSessionTypeOptionId(options, 'newyork')).toBeNull();
  });

  it('describes weekday and both calendars', () => {
    const moment = describeSessionMoment(new Date(2026, 9, 11, 14, 30).getTime());
    expect(moment?.weekday).toBe('یکشنبه');
    expect(moment?.gregorian).toContain('2026');
    expect(moment?.jalali).toContain('۱۴۰۵');
    expect(describeSessionMoment(Number.NaN)).toBeNull();
  });

  it('builds a stable local day key', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});
