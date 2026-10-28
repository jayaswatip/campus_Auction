const express = require('express');
const { authMiddleware } = require('../utils');
const { getListingById } = require('../store');
const {
  createAutoBidInstruction,
  getAutoBidInstruction,
  updateAutoBidInstruction,
  deactivateAutoBidInstruction,
} = require('../services/auctionService');

const router = express.Router();

const ensureListingAccess = (req) => {
  const listing = getListingById(req.params.id);
  if (!listing) {
    const error = new Error('Listing not found.');
    error.statusCode = 404;
    throw error;
  }

  if (listing.sellerId === req.user.id) {
    const error = new Error('The seller cannot manage automatic bids on their own listing.');
    error.statusCode = 403;
    throw error;
  }

  return listing;
};

router.get('/:id/auto-bid', authMiddleware, (req, res) => {
  try {
    const listing = ensureListingAccess(req);
    const instruction = getAutoBidInstruction({ listingId: listing.id, buyerId: req.user.id });
    return res.json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to load automatic bidding instruction.' });
  }
});

router.get('/:id/auto-bids', authMiddleware, (req, res) => {
  try {
    const listing = ensureListingAccess(req);
    const instruction = getAutoBidInstruction({ listingId: listing.id, buyerId: req.user.id });
    return res.json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to load automatic bidding instruction.' });
  }
});

router.post('/:id/auto-bid', authMiddleware, (req, res) => {
  const { maxAmount, confirmed = false, active = true } = req.body || {};
  try {
    const listing = ensureListingAccess(req);
    const instruction = createAutoBidInstruction({
      listingId: listing.id,
      buyerId: req.user.id,
      maxAmount,
      confirmed,
      active,
    });
    return res.status(201).json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to create automatic bidding instruction.' });
  }
});

router.post('/:id/auto-bids', authMiddleware, (req, res) => {
  const { maxAmount, confirmed = false, active = true } = req.body || {};
  try {
    const listing = ensureListingAccess(req);
    const instruction = createAutoBidInstruction({
      listingId: listing.id,
      buyerId: req.user.id,
      maxAmount,
      confirmed,
      active,
    });
    return res.status(201).json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to create automatic bidding instruction.' });
  }
});

router.patch('/:id/auto-bid', authMiddleware, (req, res) => {
  const { maxAmount, active, confirmed } = req.body || {};
  try {
    const listing = ensureListingAccess(req);
    const instruction = updateAutoBidInstruction({
      listingId: listing.id,
      buyerId: req.user.id,
      maxAmount,
      active,
      confirmed,
    });
    return res.json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to update automatic bidding instruction.' });
  }
});

router.patch('/:id/auto-bids', authMiddleware, (req, res) => {
  const { maxAmount, active, confirmed } = req.body || {};
  try {
    const listing = ensureListingAccess(req);
    const instruction = updateAutoBidInstruction({
      listingId: listing.id,
      buyerId: req.user.id,
      maxAmount,
      active,
      confirmed,
    });
    return res.json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to update automatic bidding instruction.' });
  }
});

router.delete('/:id/auto-bid', authMiddleware, (req, res) => {
  try {
    const listing = ensureListingAccess(req);
    const instruction = deactivateAutoBidInstruction({ listingId: listing.id, buyerId: req.user.id });
    return res.json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to deactivate automatic bidding.' });
  }
});

router.delete('/:id/auto-bids', authMiddleware, (req, res) => {
  try {
    const listing = ensureListingAccess(req);
    const instruction = deactivateAutoBidInstruction({ listingId: listing.id, buyerId: req.user.id });
    return res.json({ instruction });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to deactivate automatic bidding.' });
  }
});

module.exports = router;
