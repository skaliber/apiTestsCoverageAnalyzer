function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    return res.status(422).json({ errors: err.errors });
  }
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (err.name === 'NotFoundError') {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
