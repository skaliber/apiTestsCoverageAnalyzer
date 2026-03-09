// Mock for react-markdown — renders children as plain text in tests
import React from 'react';

const ReactMarkdown = ({ children }: { children: string }) =>
  React.createElement('div', { 'data-testid': 'markdown' }, children);

export default ReactMarkdown;
