const mongoose = require('mongoose');

const autoBidSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    listingId: { type: String, required: true },
    buyerId: { type: String, required: true },
    maxAmount: { type: Number, required: true, min: 0.01 },
    active: { type: Boolean, default: true },
    confirmed: { type: Boolean, default: false },
  },
  { timestamps: true, autoIndex: false }
);

autoBidSchema.index({ listingId: 1, buyerId: 1 }, { unique: true });

module.exports = mongoose.models.AutoBid || mongoose.model('AutoBid', autoBidSchema);
