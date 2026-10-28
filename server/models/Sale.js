const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    listingId: { type: String, required: true },
    sellerId: { type: String, required: true },
    buyerId: { type: String, required: true },
    winningBidId: { type: String, required: true },
    price: { type: Number, required: true },
    status: { type: String, default: 'PENDING_APPROVAL' },
    handoverStatus: { type: String, default: 'PENDING' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
