const express = require('express');
const { getAllListings, getUserById, getSaleByListingId, getSalesForUser } = require('../store');
const { authMiddleware, sanitizeListing } = require('../utils');
const { approveWinner } = require('../services/auctionService');

const router = express.Router();

router.get('/overview', authMiddleware, (req, res) => {
  const listings = getAllListings().filter((listing) => listing.sellerId === req.user.id);
  const sales = getSalesForUser(req.user.id);

  return res.json({
    activeListings: listings.filter((item) => item.status === 'ACTIVE').map((item) => sanitizeListing(item, req.user)),
    pendingSales: sales.filter((item) => item.status === 'PENDING_APPROVAL'),
    soldItems: sales.filter((item) => item.status === 'RESERVED' || item.status === 'COMPLETED'),
  });
});

router.patch('/listings/:id/decision', authMiddleware, (req, res) => {
  const { approved } = req.body || {};
  try {
    const result = approveWinner({
      listingId: req.params.id,
      sellerId: req.user.id,
      approved: approved === true,
    });
    return res.json({ listing: sanitizeListing(result.listing, getUserById(result.listing.sellerId)), sale: result.sale });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Unable to update the sale decision.' });
  }
});

router.get('/listings', authMiddleware, (req, res) => {
  const listings = getAllListings().filter((listing) => listing.sellerId === req.user.id);
  return res.json({ listings: listings.map((listing) => sanitizeListing(listing, req.user)) });
});

module.exports = router;
