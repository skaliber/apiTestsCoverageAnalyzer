import ApiService from '../../services/api.service';

const LOGIN = 'login';
const REGISTER = 'register';
const GET_USER = 'getUser';
const UPDATE_USER = 'updateUser';

const state = {
  user: null,
  isAuthenticated: false,
};

const actions = {
  [LOGIN](context, credentials) {
    return ApiService.post('users/login', { user: credentials });
  },
  [REGISTER](context, user) {
    return ApiService.post('users', { user });
  },
  [GET_USER](context) {
    return ApiService.get('user');
  },
  [UPDATE_USER](context, user) {
    return ApiService.put('user', { user });
  },
};

export default { state, actions };
