import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from '../components/ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders in light mode by default', () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toHaveTextContent('🌙 Dark');
  });

  it('toggles to dark mode when clicked', () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    fireEvent.click(button);
    expect(button).toHaveTextContent('☀️ Light');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggles back to light mode on second click', () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveTextContent('🌙 Dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('starts in dark mode if localStorage has dark theme', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toHaveTextContent('☀️ Light');
  });
});
