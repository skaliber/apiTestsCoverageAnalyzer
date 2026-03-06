// Sample tests for error handling coverage analysis.
// Each test exercises a specific negative/error scenario for an API endpoint.
// The analyzer detects coverage via:
//   - Status code assertions: expect(response.status).toBe(400)
//   - Description keywords: "missing", "invalid", "unauthorized", "not found", etc.
//   - Code patterns: missing body fields, empty auth headers, large fake IDs, etc.

// ─── POST /users ──────────────────────────────────────────────────────────────

test('POST /users - missing name returns 400', () => {
  const body = { email: 'alice@example.com' }; // name is missing
  const method = 'POST';
  const url = '/users';
  const response = { status: 400, body: { error: 'name is required' } };
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('error');
});

test('POST /users - invalid email format returns 400', () => {
  const body = { name: 'Alice', email: 'not-an-email' }; // invalid format
  const method = 'POST';
  const url = '/users';
  const response = { status: 400, body: { error: 'invalid email format' } };
  expect(response.status).toBe(400);
});

test('POST /users - unauthorized request without token returns 401', () => {
  const headers = { Authorization: '' }; // empty / missing token
  const body = { name: 'Alice', email: 'alice@example.com' };
  const method = 'POST';
  const url = '/users';
  const response = { status: 401, body: { error: 'Unauthorized' } };
  expect(response.status).toBe(401);
});

test('POST /users - duplicate email returns conflict 409', () => {
  // email already in use - duplicate
  const body = { name: 'Alice', email: 'alice@example.com' };
  const method = 'POST';
  const url = '/users';
  const response = { status: 409, body: { error: 'email already in use' } };
  expect(response.status).toBe(409);
});

// ─── GET /users/{id} ─────────────────────────────────────────────────────────

test('GET /users/{id} - not found returns 404', () => {
  const method = 'GET';
  const url = '/users/999999'; // nonexistent large ID
  const response = { status: 404, body: { error: 'User not found' } };
  expect(response.status).toBe(404);
});

test('GET /users/{id} - invalid id format returns 400', () => {
  const method = 'GET';
  const url = '/users/abc'; // invalid non-numeric id
  const response = { status: 400, body: { error: 'invalid ID format or value' } };
  expect(response.status).toBe(400);
});

test('GET /users/{id} - unauthorized request returns 401', () => {
  const method = 'GET';
  const url = '/users/42';
  const headers = { Authorization: 'Bearer ' }; // empty token
  const response = { status: 401 };
  expect(response.status).toBe(401);
});

// ─── PUT /users/{id} ─────────────────────────────────────────────────────────

test('PUT /users/{id} - forbidden when updating another user returns 403', () => {
  const method = 'PUT';
  const url = '/users/99';
  const body = { name: 'Eve' };
  const response = { status: 403, body: { error: 'Forbidden' } };
  expect(response.status).toBe(403);
});

test('PUT /users/{id} - user not found returns 404', () => {
  const method = 'PUT';
  const url = '/users/999999'; // nonexistent user
  const body = { name: 'Ghost' };
  const response = { status: 404 };
  expect(response.status).toBe(404);
});

test('PUT /users/{id} - invalid input value returns 400', () => {
  const method = 'PUT';
  const url = '/users/1';
  const body = { name: null }; // null is invalid
  const response = { status: 400, body: { error: 'invalid input value' } };
  expect(response.status).toBe(400);
});

// ─── DELETE /users/{id} ──────────────────────────────────────────────────────

test('DELETE /users/{id} - unauthorized returns 401', () => {
  const method = 'DELETE';
  const url = '/users/1';
  const headers = { Authorization: '' }; // missing auth token
  const response = { status: 401 };
  expect(response.status).toBe(401);
});

test('DELETE /users/{id} - forbidden returns 403', () => {
  const method = 'DELETE';
  const url = '/users/99';
  // Current user does not have permission - access denied
  const response = { status: 403, body: { error: 'Forbidden' } };
  expect(response.status).toBe(403);
});

test('DELETE /users/{id} - not found returns 404', () => {
  const method = 'DELETE';
  const url = '/users/999999'; // does not exist
  const response = { status: 404 };
  expect(response.status).toBe(404);
});

// ─── GET /items ───────────────────────────────────────────────────────────────

test('GET /items - missing api key returns 401', () => {
  const method = 'GET';
  const url = '/items';
  const headers = {}; // no X-Api-Key — missing api key
  const response = { status: 401, body: { error: 'Missing or invalid API key' } };
  expect(response.status).toBe(401);
});

test('GET /items - invalid limit query parameter returns 400', () => {
  const method = 'GET';
  const url = '/items?limit=0'; // below minimum of 1 — invalid
  const headers = { 'X-Api-Key': 'my-key' };
  const response = { status: 400, body: { error: 'invalid query parameters' } };
  expect(response.status).toBe(400);
});

test('GET /items - server error returns 500', () => {
  const method = 'GET';
  const url = '/items';
  const headers = { 'X-Api-Key': 'my-key' };
  // Simulated internal server error
  const response = { status: 500, body: { error: 'Internal server error' } };
  expect(response.status).toBe(500);
});

// ─── Edge cases: indirect assertions ─────────────────────────────────────────

test('POST /users - error message mentions required field (indirect assertion)', () => {
  // missing required body — checks error message body rather than status code
  const body = { email: 'test@example.com' };
  const method = 'POST';
  const url = '/users';
  const response = { status: 400, body: { message: 'name is required' } };
  // Indirect assertion: check message body instead of status code
  expect(response.body.message).toContain('required');
});

test('GET /users/{id} - error body mentions not found (indirect assertion)', () => {
  // nonexistent resource — assertion on error message, not status code
  const method = 'GET';
  const url = '/users/999999';
  const response = { status: 404, body: { message: 'User not found' } };
  expect(response.body.message).toContain('not found');
});
