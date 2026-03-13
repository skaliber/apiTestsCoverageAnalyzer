const express = require('express');
const app = express();
const apiRouter = require('./routes');
const errorHandler = require('./middleware/errorHandler');

app.use(express.json());
app.use('/api', apiRouter);
app.use(errorHandler);

module.exports = app;
