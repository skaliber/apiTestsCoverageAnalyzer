const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/:username', auth.optional, async (req, res) => {
  res.json({});
});

router.post('/:username/follow', auth.required, async (req, res) => {
  res.json({});
});

router.delete('/:username/follow', auth.required, async (req, res) => {
  res.json({});
});

module.exports = router;
