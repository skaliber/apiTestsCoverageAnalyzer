import axios from 'axios';

const ApiService = {
  init() {
    axios.defaults.baseURL = 'https://api.realworld.io/api';
  },

  get(resource, params) {
    return axios.get(resource, { params });
  },

  post(resource, data) {
    return axios.post(resource, data);
  },

  put(resource, data) {
    return axios.put(resource, data);
  },

  delete(resource) {
    return axios.delete(resource);
  }
};

export default ApiService;
