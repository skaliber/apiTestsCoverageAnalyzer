const express = require('express');
const router = express.Router();

const articlesRouter = require('./articles');
const usersRouter = require('./users');
const profilesRouter = require('./profiles');

router.use('/articles', articlesRouter);
router.use('/users', usersRouter);
router.use('/profiles', profilesRouter);

module.exports = router;
