import { render, screen } from '@testing-library/react';
import CodeBlock from '../components/CodeBlock';

jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: any) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/cjs/styles/prism', () => ({
  oneDark: {},
  oneLight: {},
}));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}));

describe('CodeBlock', () => {
  it('renders code text content', () => {
    render(<CodeBlock code="console.log('hello')" />);
    expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<CodeBlock code="x = 1" title="My Title" />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('renders copy button', () => {
    render(<CodeBlock code="some code" />);
    expect(screen.getByRole('button', { name: /copy code to clipboard/i })).toBeInTheDocument();
  });
});
