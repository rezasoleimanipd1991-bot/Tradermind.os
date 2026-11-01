import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { backupService, buildBackupData } from '../backupService';

describe('full backup coverage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.delete();
    await db.open();
  });

  it('backs up all portable tables, preserves device-local sync identity, and restores app data', async () => {
    const soundDataUrl = 'data:audio/wav;base64,YXVkaW8=';
    const reminders = JSON.stringify([{ id: 'reminder-1', title: 'جلسه لندن' }]);
    const appSettings = JSON.stringify({ state: { theme: 'amber', dashboardRange: 'year' }, version: 1 });
    localStorage.setItem('tradermind-reminder-custom-sound', soundDataUrl);
    localStorage.setItem('tradermind-reminders', reminders);
    localStorage.setItem('tradermind-app-storage', appSettings);
    localStorage.setItem('tradermind-custom-symbols', JSON.stringify(['EURUSD']));
    localStorage.setItem('perf_preferred_sessions', JSON.stringify(['london']));
    const tombstone = { id: 'trades:deleted-trade', table: 'trades', key: 'deleted-trade', deletedAt: 123 };
    await db.table('syncTombstones').put(tombstone);
    await db.table('syncMeta').put({ key: 'deviceId', value: 'source-device' });

    const payload = await buildBackupData();
    const backupTables = Object.keys(payload.data).filter(name => name !== 'settings').sort();
    const databaseTables = db.tables.map(table => table.name).filter(name => name !== 'syncMeta').sort();

    expect(backupTables).toEqual(databaseTables);
    expect(payload.data.syncTombstones).toEqual([tombstone]);
    expect(payload.data.settings['tradermind-reminder-custom-sound']).toBe(soundDataUrl);
    expect(payload.data.settings['tradermind-reminders']).toBe(reminders);
    expect(payload.metadata.totalRecords).toBe(1);

    localStorage.setItem('tradermind-reminders', '[]');
    localStorage.setItem('perf_preferred_sessions', JSON.stringify(['new-york']));
    await db.table('syncMeta').put({ key: 'deviceId', value: 'destination-device' });
    await backupService.importReplace(payload.data);

    expect(await db.table('syncTombstones').get(tombstone.id)).toEqual(tombstone);
    expect(await db.table('syncMeta').get('deviceId')).toEqual({ key: 'deviceId', value: 'destination-device' });
    expect(localStorage.getItem('tradermind-reminders')).toBe(reminders);
    expect(localStorage.getItem('tradermind-reminder-custom-sound')).toBe(soundDataUrl);
    expect(localStorage.getItem('tradermind-app-storage')).toBe(appSettings);
    expect(localStorage.getItem('perf_preferred_sessions')).toBe(JSON.stringify(['london']));
  });

  it('clears sync identity and tombstones when all app data is reset', async () => {
    await db.table('syncMeta').put({ key: 'deviceId', value: 'local-device' });
    await db.table('syncTombstones').put({
      id: 'trades:deleted-trade',
      table: 'trades',
      key: 'deleted-trade',
      deletedAt: 123,
    });

    await backupService.resetAll();

    expect(await db.table('syncMeta').count()).toBe(0);
    expect(await db.table('syncTombstones').count()).toBe(0);
  });
});
