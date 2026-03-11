import { render, screen } from '@testing-library/react';
import LocalValidationPanel from '../components/LocalValidationPanel';
import type { LocalValidationCommand } from '../types';

jest.mock('../components/CodeBlock', () => ({
  __esModule: true,
  default: ({ code }: any) => <pre data-testid="code-block">{code}</pre>,
}));

describe('LocalValidationPanel', () => {
  it('renders nothing when commands array is empty', () => {
    const { container } = render(<LocalValidationPanel commands={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders commands with source badges', () => {
    const commands: LocalValidationCommand[] = [
      { command: 'npm test', source: 'detected', label: 'Run unit tests' },
      { command: 'curl localhost:3000/health', source: 'inferred' },
    ];
    render(<LocalValidationPanel commands={commands} />);
    expect(screen.getByText('Detected')).toBeInTheDocument();
    expect(screen.getByText('Inferred')).toBeInTheDocument();
    expect(screen.getByText('Run unit tests')).toBeInTheDocument();
  });

  it('renders data-testid="local-validation-panel" when commands exist', () => {
    const commands: LocalValidationCommand[] = [
      { command: 'npm test', source: 'suggested' },
    ];
    render(<LocalValidationPanel commands={commands} />);
    expect(screen.getByTestId('local-validation-panel')).toBeInTheDocument();
  });
});
