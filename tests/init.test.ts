import { execSync } from 'child_process';

test('CLI displays help information without errors', () => {
  // Execute the CLI with --help flag via ts-node to run TypeScript directly
  const output = execSync('node -r ts-node/register src/index.ts --help').toString();
  // The help output should include the usage or description text
  expect(output).toMatch(/Analyze API test coverage/);
});
