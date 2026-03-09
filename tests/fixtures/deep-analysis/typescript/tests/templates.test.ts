import { client } from '../apiClient';

const BASE = '';
const userId = '123';

it('gets user by template', async () => {
  const path = `${BASE}/users/${userId}`;
  const response = await client.get(path);
  expect(response.status).toBe(200);
});
