const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    relatedListingId: { type: String, default: null },
    relatedUserId: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
