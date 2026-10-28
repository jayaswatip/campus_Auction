const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    sellerId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true },
    description: { type: String, required: true },
    condition: { type: String, required: true },
    imageUrls: [{ type: String }],
    startingPrice: { type: Number, required: true, min: 0.01 },
    minimumIncrement: { type: Number, required: true, min: 0.01 },
    closingAt: { type: Date, required: true },
    status: { type: String, enum: ['ACTIVE', 'PENDING_APPROVAL', 'RESERVED', 'UNSOLD', 'CANCELLED'], default: 'ACTIVE' },
    currentBid: { type: Number, min: 0, default: 0 },
    currentBidderId: { type: String, default: null },
    provisionalWinnerId: { type: String, default: null },
    sellerDecision: { type: String, default: 'pending' },
    bidHistory: [{
      id: { type: String, required: true },
      bidderId: String,
      amount: { type: Number, min: 0.01, required: true },
      createdAt: Date,
    }],
    lastClosingSoonNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true, autoIndex: false }
);

module.exports = mongoose.models.Listing || mongoose.model('Listing', listingSchema);
