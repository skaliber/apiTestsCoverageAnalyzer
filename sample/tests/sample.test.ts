// Sample integration test file for the API coverage analyzer.
// HTTP calls are expressed as "METHOD /path" strings (e.g. in a request helper).

test('GET /users - list all users', () => {
  const method = 'GET';
  const url = '/users';
  expect(`${method} ${url}`).toBe('GET /users');
});

test('POST /users - create a new user', () => {
  const method = 'POST';
  const url = '/users';
  expect(`${method} ${url}`).toBe('POST /users');
});

test('GET /users/123 - get user by id', () => {
  const method = 'GET';
  const url = '/users/123';
  expect(`${method} ${url}`).toBe('GET /users/123');
});

test('GET /orders - list all orders', () => {
  const method = 'GET';
  const url = '/orders';
  expect(`${method} ${url}`).toBe('GET /orders');
});

test('POST /orders - create an order', () => {
  const method = 'POST';
  const url = '/orders';
  expect(`${method} ${url}`).toBe('POST /orders');
});

test('PUT /users/1 - update a user', () => {
  const method = 'PUT';
  const url = '/users/1';
  expect(`${method} ${url}`).toBe('PUT /users/1');
});

test('DELETE /users/1 - delete a user', () => {
  const method = 'DELETE';
  const url = '/users/1';
  expect(`${method} ${url}`).toBe('DELETE /users/1');
});

test('GET /orders/1 - get order by id', () => {
  const method = 'GET';
  const url = '/orders/1';
  expect(`${method} ${url}`).toBe('GET /orders/1');
});

test('GET /users/1/orders - list orders for a user', () => {
  const method = 'GET';
  const url = '/users/1/orders';
  expect(`${method} ${url}`).toBe('GET /users/1/orders');
});
