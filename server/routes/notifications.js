const express = require('express');
const { getNotificationsForUser, markNotificationAsRead, markAllNotificationsAsRead } = require('../store');
const { authMiddleware } = require('../utils');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const notifications = getNotificationsForUser(req.user.id);
  return res.json({
    notifications,
    unreadCount: notifications.filter((notification) => !notification.read).length,
  });
});

router.patch('/:id/read', authMiddleware, (req, res) => {
  const notification = markNotificationAsRead(req.params.id, req.user.id);
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found.' });
  }

  return res.json({ notification });
});

router.patch('/read-all', authMiddleware, (req, res) => {
  const notifications = markAllNotificationsAsRead(req.user.id);
  return res.json({ notifications, unreadCount: 0 });
});

module.exports = router;
