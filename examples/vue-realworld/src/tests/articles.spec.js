import axios from 'axios';
import ApiService from '../services/api.service';

jest.mock('axios');

describe('Articles API', () => {
  beforeEach(() => {
    ApiService.init();
  });

  test('fetches articles', async () => {
    axios.get.mockResolvedValue({ data: [] });
    const res = await ApiService.get('articles');
    expect(axios.get).toHaveBeenCalledWith('articles', { params: undefined });
  });

  test('creates article', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await ApiService.post('articles', { article: { title: 'Test' } });
    expect(axios.post).toHaveBeenCalledWith('articles', { article: { title: 'Test' } });
  });

  test('updates article', async () => {
    axios.put.mockResolvedValue({ data: {} });
    await ApiService.put('articles/test-slug', { article: { title: 'Updated' } });
    expect(axios.put).toHaveBeenCalledWith('articles/test-slug', { article: { title: 'Updated' } });
  });

  test('deletes article', async () => {
    axios.delete.mockResolvedValue({});
    await ApiService.delete('articles/test-slug');
    expect(axios.delete).toHaveBeenCalledWith('articles/test-slug');
  });
});
