const Joi = require('joi');
const Boom = require('@hapi/boom');

const usersRoutes = [
  {
    method: 'POST',
    path: '/api/users/login',
    options: {
      auth: false,
      validate: {
        payload: Joi.object({
          email: Joi.string().email().required(),
          password: Joi.string().required(),
        }),
      },
      handler: async (request, h) => {
        return { user: { token: 'jwt-token' } };
      },
    },
  },
  {
    method: 'POST',
    path: '/api/users',
    options: {
      auth: false,
      validate: {
        payload: Joi.object({
          email: Joi.string().email().required(),
          username: Joi.string().required(),
          password: Joi.string().min(8).required(),
        }),
      },
      handler: async (request, h) => {
        return h.response({}).code(201);
      },
    },
  },
  {
    method: 'GET',
    path: '/api/user',
    options: {
      auth: 'jwt',
      handler: async (request, h) => {
        return {};
      },
    },
  },
  {
    method: 'PUT',
    path: '/api/user',
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          email: Joi.string().email(),
          username: Joi.string(),
          bio: Joi.string().allow(''),
          image: Joi.string().uri().allow(''),
        }),
      },
      handler: async (request, h) => {
        return {};
      },
    },
  },
];

module.exports = usersRoutes;
