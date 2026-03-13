import {
  detectAxiosBaseUrl,
  detectVuexActions,
  detectVuexDispatches,
} from '../../../src/languages/javascript/vueDetector';

describe('detectAxiosBaseUrl', () => {
  it('detects axios.defaults.baseURL setting', () => {
    const source = `axios.defaults.baseURL = 'https://api.example.com';`;
    const result = detectAxiosBaseUrl(source, '/fake/api.js');
    expect(result).toBeDefined();
    expect(result!.url).toBe('https://api.example.com');
  });

  it('returns undefined when no baseURL set', () => {
    const source = `import axios from 'axios';`;
    expect(detectAxiosBaseUrl(source, '/fake/api.js')).toBeUndefined();
  });
});

describe('detectVuexActions', () => {
  it('detects ApiService.get calls in Vuex actions', () => {
    const source = `
const actions = {
  fetchArticles({ commit }) {
    return ApiService.get('articles')
      .then(({ data }) => commit('setArticles', data.articles));
  }
};
`;
    const calls = detectVuexActions(source, '/fake/store.js');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].urlPattern).toBe('articles');
    expect(calls[0].actionName).toBe('fetchArticles');
  });

  it('detects axios calls in actions', () => {
    const source = `
const actions = {
  createArticle({ commit }, payload) {
    return axios.post('/api/articles', payload);
  }
};
`;
    const calls = detectVuexActions(source, '/fake/store.js');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].urlPattern).toBe('/api/articles');
  });

  it('detects multiple API calls', () => {
    const source = `
const actions = {
  fetchArticles({ commit }) {
    return ApiService.get('articles');
  },
  fetchTags({ commit }) {
    return ApiService.get('tags');
  }
};
`;
    const calls = detectVuexActions(source, '/fake/store.js');
    expect(calls).toHaveLength(2);
  });

  it('returns empty for non-Vuex code', () => {
    const source = `export default { data() { return {}; } };`;
    expect(detectVuexActions(source, '/fake/component.vue')).toEqual([]);
  });
});

describe('detectVuexDispatches', () => {
  it('detects this.$store.dispatch calls', () => {
    const source = `
this.$store.dispatch('fetchArticles');
this.$store.dispatch('fetchTags');
`;
    const dispatches = detectVuexDispatches(source, '/fake/component.vue');
    expect(dispatches).toHaveLength(2);
    expect(dispatches[0].actionName).toBe('fetchArticles');
    expect(dispatches[1].actionName).toBe('fetchTags');
  });

  it('detects store.dispatch calls', () => {
    const source = `store.dispatch('createArticle');`;
    const dispatches = detectVuexDispatches(source, '/fake/component.vue');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].actionName).toBe('createArticle');
  });

  it('returns empty for non-dispatch code', () => {
    const source = `this.$router.push('/');`;
    expect(detectVuexDispatches(source, '/fake/component.vue')).toEqual([]);
  });
});
