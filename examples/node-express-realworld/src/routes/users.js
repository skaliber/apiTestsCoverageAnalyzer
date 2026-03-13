const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.post('/login', async (req, res) => {
  res.json({ user: { token: 'jwt-token' } });
});

router.post('/', async (req, res) => {
  res.status(201).json({});
});

router.get('/me', auth.required, async (req, res) => {
  res.json({});
});

router.put('/me', auth.required, async (req, res) => {
  res.json({});
});

module.exports = router;
