const express = require('express');
const { getAllListings, getUserById, getSaleByListingId, getSalesForUser, updateSale, createNotification } = require('../store');
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

router.patch('/listings/:id/handover', authMiddleware, (req, res) => {
  const sale = getSaleByListingId(req.params.id);
  if (!sale) {
    return res.status(404).json({ message: 'No sale record exists for this listing.' });
  }

  if (sale.sellerId !== req.user.id && sale.buyerId !== req.user.id) {
    return res.status(403).json({ message: 'You are not authorized to update this handover status.' });
  }

  const nextStatus = ['PENDING', 'CONFIRMED', 'REJECTED'].includes(String(req.body?.status || '').toUpperCase())
    ? String(req.body.status).toUpperCase()
    : 'CONFIRMED';

  const listing = getAllListings().find((item) => item.id === sale.listingId);
  const updatedSale = updateSale(sale.id, { handoverStatus: nextStatus });
  const recipientId = req.user.id === sale.sellerId ? sale.buyerId : sale.sellerId;

  createNotification({
    userId: recipientId,
    type: 'HANDOVER_UPDATE',
    message: `Handover status for "${listing?.title || sale.listingId}" was updated to ${nextStatus}.`,
    relatedListingId: sale.listingId,
    relatedUserId: req.user.id,
    dedupeKey: `handover:${sale.id}:${nextStatus}`,
  });

  return res.json({ sale: updatedSale });
});

module.exports = router;
