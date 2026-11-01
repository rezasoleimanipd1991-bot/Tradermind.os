// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { ThemeProvider } from '../../ThemeProvider';
import { useAppStore } from '../../../store/useAppStore';

const root = () => document.documentElement;

describe('three themes + 10-color picker', () => {
  beforeEach(() => {
    root().className = '';
    root().removeAttribute('style');
  });

  it.each([
    ['light', ['light'], ['dark', 'neon']],
    ['dark', ['dark'], ['light', 'neon']],
    ['neon', ['dark', 'neon'], ['light']],
  ] as const)('theme %s sets the right classes', (theme, has, hasNot) => {
    act(() => useAppStore.setState({ theme }));
    render(<ThemeProvider><div /></ThemeProvider>);
    has.forEach(c => expect(root().classList.contains(c)).toBe(true));
    hasNot.forEach(c => expect(root().classList.contains(c)).toBe(false));
    expect(root().getAttribute('data-theme')).toBe(theme);
  });

  it.each(['light', 'dark', 'neon'] as const)('color picker still drives --primary in %s', (theme) => {
    const seen = new Set<string>();
    for (const colorTheme of ['blue', 'violet', 'emerald', 'amber', 'rose', 'cyan', 'orange', 'pink', 'teal', 'indigo'] as const) {
      act(() => useAppStore.setState({ theme, colorTheme }));
      const { unmount } = render(<ThemeProvider><div /></ThemeProvider>);
      seen.add(root().style.getPropertyValue('--primary'));
      unmount();
    }
    expect(seen.size).toBe(10);
  });
});
