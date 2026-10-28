const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    listingId: { type: String, required: true },
    bidderId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
  },
  { timestamps: true, autoIndex: false }
);

bidSchema.index({ listingId: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.Bid || mongoose.model('Bid', bidSchema);
