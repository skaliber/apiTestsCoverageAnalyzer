import { render, screen } from '@testing-library/react';
import EvidencePanel from '../components/EvidencePanel';

jest.mock('../components/CodeBlock', () => ({
  __esModule: true,
  default: ({ code }: any) => <pre data-testid="code-block">{code}</pre>,
}));
jest.mock('../components/ConfidenceBadge', () => ({
  __esModule: true,
  default: ({ confidence }: any) =>
    confidence ? <span data-testid="confidence-badge">{confidence}</span> : null,
}));
jest.mock('../components/DetectionModeBadge', () => ({
  __esModule: true,
  default: ({ mode }: any) =>
    mode ? <span data-testid="detection-badge">{mode}</span> : null,
}));

describe('EvidencePanel', () => {
  it('renders data-testid="evidence-panel"', () => {
    render(<EvidencePanel description="some description" />);
    expect(screen.getByTestId('evidence-panel')).toBeInTheDocument();
  });

  it('shows confidence badge when evidence.confidence is provided', () => {
    render(
      <EvidencePanel evidence={{ confidence: 'high' }} />,
    );
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('high');
  });

  it('shows detection mode badge when evidence.detectionMode is provided', () => {
    render(
      <EvidencePanel evidence={{ detectionMode: 'direct' }} />,
    );
    expect(screen.getByTestId('detection-badge')).toHaveTextContent('direct');
  });

  it('shows description when provided', () => {
    render(<EvidencePanel description="This endpoint handles user creation" />);
    expect(screen.getByText('This endpoint handles user creation')).toBeInTheDocument();
  });

  it('shows test files when testFiles are provided', () => {
    render(<EvidencePanel testFiles={['src/tests/user.test.ts', 'src/tests/auth.test.ts']} />);
    expect(screen.getByText('src/tests/user.test.ts')).toBeInTheDocument();
    expect(screen.getByText('src/tests/auth.test.ts')).toBeInTheDocument();
  });

  it('shows code snippet via CodeBlock when codeSnippet provided', () => {
    render(<EvidencePanel codeSnippet="const x = 42;" />);
    expect(screen.getByTestId('code-block')).toHaveTextContent('const x = 42;');
  });

  it('renders nothing when no props have data', () => {
    const { container } = render(<EvidencePanel />);
    expect(container.innerHTML).toBe('');
  });
});
