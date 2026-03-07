// Sample integration test file demonstrating multi-step API flow traces.
// Each test simulates a sequence of API calls that form an integration flow.
// Flows are matched by the ordered list of keywords appearing in the test
// description and body, annotated with @flow <flowId> where possible.

// ─── FLOW001: User Registration and First Order ───────────────────────────────

test('create user, get user, then place order - @flow FLOW001', () => {
  // Step 1: POST /users – create user
  const createResponse = { status: 201, body: { id: 1, name: 'Alice', email: 'alice@example.com' } };
  expect(createResponse.status).toBe(201);

  // Step 2: GET /users/1 – get user
  const userId = createResponse.body.id;
  const getResponse = { status: 200, body: { id: userId, name: 'Alice' } };
  expect(getResponse.status).toBe(200);

  // Step 3: POST /orders – place order
  const orderResponse = { status: 201, body: { id: 100, userId, item: 'Widget' } };
  expect(orderResponse.status).toBe(201);
});

// ─── FLOW002: View User Order History ─────────────────────────────────────────

test('get user then list orders for user - @flow FLOW002', () => {
  // Step 1: GET /users/{id} – fetch user
  const userId = 1;
  const getResponse = { status: 200, body: { id: userId, name: 'Alice' } };
  expect(getResponse.status).toBe(200);

  // Step 2: GET /users/{id}/orders – user orders
  const ordersResponse = { status: 200, body: [{ id: 100, item: 'Widget' }] };
  expect(ordersResponse.status).toBe(200);
  expect(ordersResponse.body.length).toBeGreaterThan(0);
});

// ─── FLOW003: Failed Order Due to Missing User ────────────────────────────────

test('nonexistent user returns 404, then create order for nonexistent user fails - @flow FLOW003', () => {
  // Step 1: GET /users/{id} – user not found
  const userId = 99999;
  const getResponse = { status: 404, body: { message: 'User not found' } };
  expect(getResponse.status).toBe(404);

  // Step 2: POST /orders – create order rejected because user is missing
  const orderResponse = { status: 404, body: { message: 'User not found' } };
  expect(orderResponse.status).toBe(404);
});

// ─── FLOW004 is intentionally not fully covered to show partial coverage ──────
// Only step 1 (list users) is exercised here.

test('list all users returns array - partial FLOW004', () => {
  // Step 1: GET /users – all users
  const listResponse = { status: 200, body: [{ id: 1, name: 'Alice' }] };
  expect(Array.isArray(listResponse.body)).toBe(true);
});

test('list all users and fetch orders per user - @flow FLOW004', () => {
  // Step 1: GET /users – all users
  const listResponse = { status: 200, body: [{ id: 1, name: 'Alice' }] };
  expect(Array.isArray(listResponse.body)).toBe(true);

  // Step 2: GET /users/{id}/orders – orders per user
  for (const user of listResponse.body) {
    const ordersResponse = { status: 200, body: [{ id: 10, item: 'Widget' }] };
    expect(ordersResponse.status).toBe(200);
  }
});
