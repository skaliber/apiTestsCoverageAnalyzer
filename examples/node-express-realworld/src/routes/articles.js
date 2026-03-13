const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Auth-required routes
router.post('/', auth.required, async (req, res) => {
  res.status(201).json({});
});

router.put('/:slug', auth.required, async (req, res) => {
  res.json({});
});

router.delete('/:slug', auth.required, async (req, res) => {
  res.json({});
});

// Auth-optional routes
router.get('/', auth.optional, async (req, res) => {
  res.json([]);
});

router.get('/:slug', auth.optional, async (req, res) => {
  res.json({});
});

// Comments
router.get('/:slug/comments', auth.optional, async (req, res) => {
  res.json([]);
});

router.post('/:slug/comments', auth.required, async (req, res) => {
  res.status(201).json({});
});

// Favorites
router.post('/:slug/favorite', auth.required, async (req, res) => {
  res.json({});
});

router.delete('/:slug/favorite', auth.required, async (req, res) => {
  res.json({});
});

module.exports = router;
