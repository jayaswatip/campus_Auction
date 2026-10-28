const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    filters: {
      query: { type: String, default: '' },
      category: { type: String, default: null },
      condition: { type: String, default: null },
      minPrice: { type: Number, default: null },
      maxPrice: { type: Number, default: null },
      closingSoon: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SavedSearch || mongoose.model('SavedSearch', savedSearchSchema);
