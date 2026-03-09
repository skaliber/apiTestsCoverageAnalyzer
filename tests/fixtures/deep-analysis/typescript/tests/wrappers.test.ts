import { apiClient } from '../apiClient';

function getUser(client: any, id: string) {
  return client.get(`/users/${id}`);
}

it('fetches user via wrapper', async () => {
  const response = getUser(apiClient, '123');
  expect(response.status).toBe(200);
});
