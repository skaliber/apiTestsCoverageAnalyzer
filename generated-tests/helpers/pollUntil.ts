// generated-tests/helpers/pollUntil.ts
// AUTO-GENERATED helper — do not delete. Required by integration test templates.

/**
 * Polls a condition function until it returns true or timeout expires.
 * Use this in integration tests instead of raw setTimeout/sleep.
 *
 * @param condition - async function that returns true when the condition is met
 * @param timeoutMs - maximum wait time in milliseconds (default: 10_000)
 * @param intervalMs - polling interval in milliseconds (default: 500)
 * @throws Error if timeout is exceeded before condition is met
 */
export async function pollUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`pollUntil: condition not met within ${timeoutMs}ms`);
}
