// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard, DataPlaceholder, Panel } from '..';

describe('design system', () => {
  it('KpiCard shows a dash, never an invented number, when value is missing', () => {
    render(<KpiCard label="Win Rate" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
  it('KpiCard renders a real value and delta', () => {
    render(<KpiCard label="Profit Factor" value="1.84" tone="positive" delta={{ value: '8%', direction: 'up' }} />);
    expect(screen.getByText('1.84')).toBeTruthy();
    expect(screen.getByText('8%')).toBeTruthy();
  });
  it('DataPlaceholder exposes status semantics per kind', () => {
    const { rerender } = render(<DataPlaceholder kind="empty" />);
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(<DataPlaceholder kind="error" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('Panel renders title and children', () => {
    render(<Panel title="نمودار"><p>x</p></Panel>);
    expect(screen.getByText('نمودار')).toBeTruthy();
  });
});
