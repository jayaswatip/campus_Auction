const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    listingId: { type: String, required: true },
    sellerId: { type: String, required: true },
    buyerId: { type: String, required: true },
    winningBidId: { type: String, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ['PENDING_APPROVAL', 'RESERVED', 'REJECTED', 'COMPLETED'], default: 'PENDING_APPROVAL' },
    handoverStatus: { type: String, enum: ['PENDING', 'CONFIRMED', 'REJECTED'], default: 'PENDING' },
  },
  { timestamps: true, autoIndex: false }
);

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
