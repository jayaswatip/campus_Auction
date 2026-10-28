const express = require('express');
const { getListingById } = require('../store');
const { processBid } = require('../services/auctionService');
const { authMiddleware } = require('../utils');

const router = express.Router();

router.post('/:id/bid', authMiddleware, async (req, res) => {
  try {
    const listing = getListingById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Bid amount must be a valid positive number.' });
    }

    const updatedListing = await processBid({ listingId: listing.id, bidderId: req.user.id, amount });
    return res.status(201).json({ listing: updatedListing });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Bid could not be processed.' });
  }
});

module.exports = router;
