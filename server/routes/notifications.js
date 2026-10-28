const express = require('express');
const { getNotificationsForUser } = require('../store');
const { authMiddleware } = require('../utils');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const notifications = getNotificationsForUser(req.user.id);
  return res.json({ notifications });
});

module.exports = router;
