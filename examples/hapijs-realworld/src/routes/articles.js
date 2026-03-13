const Joi = require('joi');
const Boom = require('@hapi/boom');

const articlesRoutes = [
  {
    method: 'GET',
    path: '/api/articles',
    options: {
      auth: { mode: 'try' },
      validate: {
        query: Joi.object({
          tag: Joi.string(),
          author: Joi.string(),
          limit: Joi.number().integer().min(1).max(100).default(20),
          offset: Joi.number().integer().min(0).default(0),
        }),
      },
      handler: async (request, h) => {
        return [];
      },
    },
  },
  {
    method: 'POST',
    path: '/api/articles',
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          title: Joi.string().required(),
          description: Joi.string(),
          body: Joi.string().required(),
          tagList: Joi.array().items(Joi.string()),
        }),
      },
      handler: async (request, h) => {
        return h.response({}).code(201);
      },
    },
  },
  {
    method: 'GET',
    path: '/api/articles/{slug}',
    options: {
      auth: { mode: 'try' },
      validate: {
        params: Joi.object({
          slug: Joi.string().required(),
        }),
      },
      handler: async (request, h) => {
        const article = null;
        if (!article) throw Boom.notFound('Article not found');
        return article;
      },
    },
  },
  {
    method: 'PUT',
    path: '/api/articles/{slug}',
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          slug: Joi.string().required(),
        }),
        payload: Joi.object({
          title: Joi.string(),
          description: Joi.string(),
          body: Joi.string(),
        }),
      },
      handler: async (request, h) => {
        return {};
      },
    },
  },
  {
    method: 'DELETE',
    path: '/api/articles/{slug}',
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          slug: Joi.string().required(),
        }),
      },
      handler: async (request, h) => {
        return h.response().code(204);
      },
    },
  },
  {
    method: 'POST',
    path: '/api/articles/{slug}/favorite',
    options: {
      auth: 'jwt',
      handler: async (request, h) => {
        return {};
      },
    },
  },
  {
    method: 'DELETE',
    path: '/api/articles/{slug}/favorite',
    options: {
      auth: 'jwt',
      handler: async (request, h) => {
        return {};
      },
    },
  },
];

module.exports = articlesRoutes;
