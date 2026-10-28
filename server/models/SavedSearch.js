const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    filters: {
      query: { type: String, default: '' },
      category: { type: String, default: null },
      condition: { type: String, default: null },
      minPrice: { type: Number, min: 0, default: null },
      maxPrice: { type: Number, min: 0.01, default: null },
      closingSoon: { type: Boolean, default: false },
    },
  },
  { timestamps: true, autoIndex: false }
);

savedSearchSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.models.SavedSearch || mongoose.model('SavedSearch', savedSearchSchema);
