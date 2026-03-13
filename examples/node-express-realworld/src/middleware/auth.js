const jwt = require('express-jwt');

function getTokenFromHeader(req) {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Token') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
}

const auth = {
  required: jwt({
    secret: 'secret',
    algorithms: ['HS256'],
    credentialsRequired: true,
    getToken: getTokenFromHeader,
  }),
  optional: jwt({
    secret: 'secret',
    algorithms: ['HS256'],
    credentialsRequired: false,
    getToken: getTokenFromHeader,
  }),
};

module.exports = auth;
