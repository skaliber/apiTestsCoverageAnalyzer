import { client } from '../apiClient';

const USERS_PATH = '/users';
const BASE_URL = '';
const USER_BY_ID = '/users/1';
enum Routes { USERS = '/users', USER_BY_ID = '/users/{id}' }

// Should cover GET /users via constant
it('gets users', async () => {
  const response = await client.get(USERS_PATH);
  expect(response.status).toBe(200);
});

// Should cover POST /users via literal
it('creates user', async () => {
  const response = await client.post('/users');
  expect(response.status).toBe(201);
});

// Should cover GET /users/{id} via enum
it('gets user by id', async () => {
  const response = await client.get(Routes.USER_BY_ID);
  expect(response.status).toBe(200);
});
