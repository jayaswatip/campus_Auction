const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    relatedListingId: { type: String, default: null },
    relatedUserId: { type: String, default: null },
    read: { type: Boolean, default: false },
    dedupeKey: { type: String, default: null, unique: true, sparse: true },
  },
  { timestamps: true, autoIndex: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
