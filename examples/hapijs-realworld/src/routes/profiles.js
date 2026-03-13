const Joi = require('joi');
const Boom = require('@hapi/boom');

const profilesRoutes = [
  {
    method: 'GET',
    path: '/api/profiles/{username}',
    options: {
      auth: { mode: 'try' },
      validate: {
        params: Joi.object({
          username: Joi.string().required(),
        }),
      },
      handler: async (request, h) => {
        const profile = null;
        if (!profile) throw Boom.notFound('Profile not found');
        return {};
      },
    },
  },
  {
    method: 'POST',
    path: '/api/profiles/{username}/follow',
    options: {
      auth: 'jwt',
      handler: async (request, h) => {
        return {};
      },
    },
  },
  {
    method: 'DELETE',
    path: '/api/profiles/{username}/follow',
    options: {
      auth: 'jwt',
      handler: async (request, h) => {
        return {};
      },
    },
  },
];

module.exports = profilesRoutes;
