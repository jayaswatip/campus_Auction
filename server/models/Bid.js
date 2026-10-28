const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {
    listingId: { type: String, required: true },
    bidderId: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Bid || mongoose.model('Bid', bidSchema);
