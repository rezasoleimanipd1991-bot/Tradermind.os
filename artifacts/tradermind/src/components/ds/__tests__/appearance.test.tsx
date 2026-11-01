// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { ThemeProvider } from '../../ThemeProvider';
import { useAppStore } from '../../../store/useAppStore';

const root = () => document.documentElement;

describe('appearance toggles', () => {
  beforeEach(() => { root().className = ''; });

  it('defaults keep glass and soft animations on', () => {
    expect(useAppStore.getState().glassEffects).toBe(true);
    expect(useAppStore.getState().softAnimations).toBe(true);
  });

  it('turning them off adds opt-out classes and turning on removes them', () => {
    act(() => useAppStore.setState({ glassEffects: false, softAnimations: false }));
    render(<ThemeProvider><div /></ThemeProvider>);
    expect(root().classList.contains('tm-no-glass')).toBe(true);
    expect(root().classList.contains('tm-no-motion')).toBe(true);
    act(() => useAppStore.getState().setGlassEffects(true));
    act(() => useAppStore.getState().setSoftAnimations(true));
    expect(root().classList.contains('tm-no-glass')).toBe(false);
    expect(root().classList.contains('tm-no-motion')).toBe(false);
  });
});
