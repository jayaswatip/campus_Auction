const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    sellerId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    condition: { type: String, required: true },
    imageUrls: [{ type: String }],
    startingPrice: { type: Number, required: true },
    minimumIncrement: { type: Number, required: true },
    closingAt: { type: Date, required: true },
    status: { type: String, default: 'ACTIVE' },
    currentBid: { type: Number, default: 0 },
    currentBidderId: { type: String, default: null },
    provisionalWinnerId: { type: String, default: null },
    sellerDecision: { type: String, default: 'pending' },
    bidHistory: [{
      bidderId: String,
      amount: Number,
      createdAt: Date,
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Listing || mongoose.model('Listing', listingSchema);
