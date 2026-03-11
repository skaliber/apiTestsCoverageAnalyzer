import { mapActions } from 'vuex';
import ApiService from '../../services/api.service';

const FETCH_ARTICLES = 'fetchArticles';
const FETCH_ARTICLE = 'fetchArticle';
const CREATE_ARTICLE = 'createArticle';
const UPDATE_ARTICLE = 'updateArticle';
const DELETE_ARTICLE = 'deleteArticle';
const FAVORITE_ARTICLE = 'favoriteArticle';
const UNFAVORITE_ARTICLE = 'unfavoriteArticle';

const state = {
  articles: [],
  article: null,
};

const actions = {
  [FETCH_ARTICLES]({ commit }, params) {
    return ApiService.get('articles', params);
  },
  [FETCH_ARTICLE]({ commit }, slug) {
    return ApiService.get(`articles/${slug}`);
  },
  [CREATE_ARTICLE]({ commit }, article) {
    return ApiService.post('articles', { article });
  },
  [UPDATE_ARTICLE]({ commit }, { slug, article }) {
    return ApiService.put(`articles/${slug}`, { article });
  },
  [DELETE_ARTICLE]({ commit }, slug) {
    return ApiService.delete(`articles/${slug}`);
  },
  [FAVORITE_ARTICLE]({ commit }, slug) {
    return ApiService.post(`articles/${slug}/favorite`);
  },
  [UNFAVORITE_ARTICLE]({ commit }, slug) {
    return ApiService.delete(`articles/${slug}/favorite`);
  },
};

export default { state, actions };
