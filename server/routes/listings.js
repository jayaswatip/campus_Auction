const express = require('express');
const { getAllListings, getListingById, createListing, updateListing, getUserById, createNotification } = require('../store');
const { sanitizeListing, authMiddleware } = require('../utils');
const { closeExpiredAuctions } = require('../services/auctionService');
const { notifyMatchingSavedSearchesForListing } = require('../services/savedSearchService');

const router = express.Router();

const normalizeFilters = (req) => ({
  q: String(req.query.q || '').trim().toLowerCase(),
  category: req.query.category || 'all',
  condition: req.query.condition || 'all',
  minPrice: Number(req.query.minPrice || 0),
  maxPrice: Number(req.query.maxPrice || Number.MAX_SAFE_INTEGER),
  closingSoon: req.query.closingSoon === 'true',
  sort: req.query.sort || 'newest',
});

router.get('/', (req, res) => {
  const rawListings = closeExpiredAuctions();
  let listings = rawListings.length ? getAllListings().filter((listing) => rawListings.includes(listing.id) || true) : getAllListings();

  const { q, category, condition, minPrice, maxPrice, closingSoon, sort } = normalizeFilters(req);

  listings = listings.filter((listing) => {
    const matchesQuery = !q || [listing.title, listing.description, listing.category].join(' ').toLowerCase().includes(q);
    const matchesCategory = category === 'all' || listing.category === category;
    const matchesCondition = condition === 'all' || listing.condition === condition;
    const matchesMin = Number(listing.currentBid || listing.startingPrice) >= minPrice;
    const matchesMax = Number(listing.currentBid || listing.startingPrice) <= maxPrice;
    const isClosingSoon = !closingSoon || new Date(listing.closingAt).getTime() - Date.now() < 1000 * 60 * 60 * 24;

    return matchesQuery && matchesCategory && matchesCondition && matchesMin && matchesMax && isClosingSoon;
  });

  switch (sort) {
    case 'price-low':
      listings.sort((a, b) => (Number(a.currentBid || a.startingPrice) - Number(b.currentBid || b.startingPrice)));
      break;
    case 'price-high':
      listings.sort((a, b) => (Number(b.currentBid || b.startingPrice) - Number(a.currentBid || a.startingPrice)));
      break;
    case 'closing-soon':
      listings.sort((a, b) => new Date(a.closingAt) - new Date(b.closingAt));
      break;
    default:
      listings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const response = listings.map((listing) => {
    const seller = getUserById(listing.sellerId);
    return sanitizeListing(listing, seller);
  });

  return res.json({ listings: response });
});

router.get('/:id', (req, res) => {
  const listing = getListingById(req.params.id);
  if (!listing) {
    return res.status(404).json({ message: 'Listing not found.' });
  }

  const seller = getUserById(listing.sellerId);
  return res.json({ listing: sanitizeListing(listing, seller) });
});

router.post('/', authMiddleware, (req, res) => {
  const { title, category, description, condition, imageUrls, startingPrice, minimumIncrement, closingAt } = req.body || {};

  if (!title || !category || !description || !condition || !startingPrice || !minimumIncrement || !closingAt) {
    return res.status(400).json({ message: 'Please fill in all required listing fields.' });
  }

  const listing = createListing({
    sellerId: req.user.id,
    title: String(title).trim(),
    category: String(category).trim(),
    description: String(description).trim(),
    condition: String(condition).trim(),
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    startingPrice: Number(startingPrice),
    minimumIncrement: Number(minimumIncrement),
    closingAt,
    status: 'ACTIVE',
  });

  createNotification({
    userId: req.user.id,
    type: 'LISTING_CREATED',
    message: `Your listing "${title}" is live on CampusBid.`,
    relatedListingId: listing.id,
  });

  notifyMatchingSavedSearchesForListing(listing);

  return res.status(201).json({ listing: sanitizeListing(listing, req.user) });
});

router.put('/:id', authMiddleware, (req, res) => {
  const listing = getListingById(req.params.id);
  if (!listing) {
    return res.status(404).json({ message: 'Listing not found.' });
  }

  if (listing.sellerId !== req.user.id) {
    return res.status(403).json({ message: 'You can only edit your own listings.' });
  }

  if (listing.status !== 'ACTIVE') {
    return res.status(400).json({ message: 'Only active listings can be edited.' });
  }

  const updates = {
    title: req.body.title || listing.title,
    category: req.body.category || listing.category,
    description: req.body.description || listing.description,
    condition: req.body.condition || listing.condition,
    imageUrls: Array.isArray(req.body.imageUrls) ? req.body.imageUrls : listing.imageUrls,
    startingPrice: Number(req.body.startingPrice || listing.startingPrice),
    minimumIncrement: Number(req.body.minimumIncrement || listing.minimumIncrement),
    closingAt: req.body.closingAt || listing.closingAt,
  };

  const updated = updateListing(listing.id, updates);
  notifyMatchingSavedSearchesForListing(updated);
  return res.json({ listing: sanitizeListing(updated, req.user) });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const listing = getListingById(req.params.id);
  if (!listing) {
    return res.status(404).json({ message: 'Listing not found.' });
  }

  if (listing.sellerId !== req.user.id) {
    return res.status(403).json({ message: 'You can only cancel your own listings.' });
  }

  if (listing.status === 'PENDING_APPROVAL' || listing.status === 'RESERVED' || listing.status === 'UNSOLD' || listing.status === 'CANCELLED') {
    return res.status(400).json({ message: 'This listing cannot be cancelled at this stage.' });
  }

  updateListing(listing.id, { status: 'CANCELLED' });
  createNotification({
    userId: req.user.id,
    type: 'LISTING_CANCELLED',
    message: `Your auction "${listing.title}" was cancelled.`,
    relatedListingId: listing.id,
  });

  return res.json({ message: 'Listing cancelled successfully.' });
});

module.exports = router;
