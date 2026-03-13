import ApiService from '../../services/api.service';

const FETCH_PROFILE = 'fetchProfile';
const FOLLOW_USER = 'followUser';
const UNFOLLOW_USER = 'unfollowUser';

const state = {
  profile: null,
};

const actions = {
  [FETCH_PROFILE](context, username) {
    return ApiService.get(`profiles/${username}`);
  },
  [FOLLOW_USER](context, username) {
    return ApiService.post(`profiles/${username}/follow`);
  },
  [UNFOLLOW_USER](context, username) {
    return ApiService.delete(`profiles/${username}/follow`);
  },
};

export default { state, actions };
