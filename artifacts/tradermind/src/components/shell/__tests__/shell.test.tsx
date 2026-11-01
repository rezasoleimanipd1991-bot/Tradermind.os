// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { NavRail } from '../NavRail';
import { MoreNavPanel } from '../MoreNavPanel';
import { NAV_GROUPS, RAIL_ITEMS, isRailItemActive } from '../../../navigation/navConfig';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const routePaths = [...appSrc.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);

describe('shell navigation', () => {
  it('every rail item points to a real route', () => {
    for (const item of RAIL_ITEMS) expect(routePaths).toContain(item.href);
  });
  it('every sidebar group item points to a real route (no dead links)', () => {
    for (const g of NAV_GROUPS) for (const i of g.items) expect(routePaths).toContain(i.href);
  });
  it('rail highlights the right item for nested routes', () => {
    const journal = RAIL_ITEMS.find((i) => i.href === '/journal/trades')!;
    expect(isRailItemActive(journal, '/journal/daily/2026-10-01')).toBe(true);
    expect(isRailItemActive(RAIL_ITEMS[0], '/journal/trades')).toBe(false);
  });
  it('rail renders all primary items and marks current page', () => {
    const { hook } = memoryLocation({ path: '/risk/planner' });
    render(<Router hook={hook}><NavRail /></Router>);
    for (const i of RAIL_ITEMS) expect(screen.getByText(i.label)).toBeTruthy();
    expect(screen.getByText('مدیریت ریسک').closest('a')?.getAttribute('aria-current')).toBe('page');
  });
  it('"all sections" panel exposes every nav entry', () => {
    const { hook } = memoryLocation({ path: '/' });
    render(<Router hook={hook}><MoreNavPanel /></Router>);
    fireEvent.click(screen.getByRole('button', { name: 'همه‌ی بخش‌ها' }));
    const total = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(document.querySelectorAll('a[href]').length).toBeGreaterThanOrEqual(total);
  });
});
