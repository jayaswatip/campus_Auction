const { getListingById, updateListing, createNotification, createSale, getSaleByListingId, updateSale } = require('../store');

const withListingLock = async (listingId, callback) => {
  const key = `listing:${listingId}`;
  if (!global.__campusBidLocks) {
    global.__campusBidLocks = {};
  }

  const previous = global.__campusBidLocks[key] || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });

  global.__campusBidLocks[key] = previous.then(() => next);

  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
};

const processBid = async ({ listingId, bidderId, amount }) => {
  const bidValue = Number(amount);

  return withListingLock(listingId, async () => {
    const listing = getListingById(listingId);
    if (!listing) {
      const error = new Error('Listing not found.');
      error.statusCode = 404;
      throw error;
    }

    if (listing.status !== 'ACTIVE') {
      const error = new Error('This auction is no longer accepting bids.');
      error.statusCode = 400;
      throw error;
    }

    if (listing.sellerId === bidderId) {
      const error = new Error('Sellers cannot bid on their own listings.');
      error.statusCode = 403;
      throw error;
    }

    const closingAt = new Date(listing.closingAt).getTime();
    if (Date.now() > closingAt) {
      const error = new Error('The auction is closed.');
      error.statusCode = 400;
      throw error;
    }

    const currentBid = Number(listing.currentBid || 0);
    const minimumBid = currentBid === 0 ? Number(listing.startingPrice) : Number(currentBid + listing.minimumIncrement);
    if (bidValue < minimumBid) {
      const error = new Error(`Bid must be at least ₹${minimumBid}.`);
      error.statusCode = 400;
      throw error;
    }

    const updated = updateListing(listingId, {
      currentBid: bidValue,
      currentBidderId: bidderId,
      bidHistory: [
        ...listing.bidHistory,
        {
          id: `bid_${Date.now()}`,
          bidderId,
          amount: bidValue,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    createNotification({
      userId: listing.sellerId,
      type: 'NEW_BID',
      message: `A new valid bid of ₹${bidValue} was placed on ${listing.title}.`,
      relatedListingId: listing.id,
      relatedUserId: bidderId,
    });

    return updated;
  });
};

const closeExpiredAuctions = () => {
  const now = Date.now();

  const affected = [];
  const listings = require('../store').getAllListings();

  listings.forEach((listing) => {
    if (listing.status !== 'ACTIVE') return;
    if (new Date(listing.closingAt).getTime() > now) return;

    const existingSale = getSaleByListingId(listing.id);
    if (existingSale && existingSale.status === 'PENDING_APPROVAL') {
      return;
    }

    const highestBid = listing.bidHistory.length
      ? [...listing.bidHistory].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
      : null;

    if (!highestBid) {
      updateListing(listing.id, { status: 'UNSOLD' });
      createNotification({ userId: listing.sellerId, type: 'AUCTION_CLOSED', message: `Your listing "${listing.title}" closed without bids and is marked unsold.`, relatedListingId: listing.id });
      affected.push(listing.id);
      return;
    }

    if (existingSale) {
      updateListing(listing.id, {
        status: 'PENDING_APPROVAL',
        provisionalWinnerId: highestBid.bidderId,
        sellerDecision: 'pending',
      });
      affected.push({ listingId: listing.id, saleId: existingSale.id });
      return;
    }

    const sale = createSale({
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: highestBid.bidderId,
      winningBidId: highestBid.id,
      price: highestBid.amount,
      status: 'PENDING_APPROVAL',
    });

    updateListing(listing.id, {
      status: 'PENDING_APPROVAL',
      provisionalWinnerId: highestBid.bidderId,
      sellerDecision: 'pending',
    });

    createNotification({
      userId: listing.sellerId,
      type: 'PROVISIONAL_WIN',
      message: `The provisional winning bid for "${listing.title}" is ₹${highestBid.amount}. Review and approve or reject it.`,
      relatedListingId: listing.id,
      relatedUserId: highestBid.bidderId,
    });

    createNotification({
      userId: highestBid.bidderId,
      type: 'PROVISIONAL_WIN',
      message: `You are the provisional winner of "${listing.title}". Please wait for the seller's decision.`,
      relatedListingId: listing.id,
      relatedUserId: listing.sellerId,
    });

    affected.push({ listingId: listing.id, saleId: sale.id });
  });

  return affected;
};

const approveWinner = ({ listingId, sellerId, approved }) => {
  const listing = getListingById(listingId);
  if (!listing) {
    const error = new Error('Listing not found.');
    error.statusCode = 404;
    throw error;
  }

  if (listing.sellerId !== sellerId) {
    const error = new Error('Only the listing owner may approve or reject the sale.');
    error.statusCode = 403;
    throw error;
  }

  if (listing.status !== 'PENDING_APPROVAL') {
    const error = new Error('This listing is no longer awaiting a seller decision.');
    error.statusCode = 400;
    throw error;
  }

  const sale = getSaleByListingId(listingId);
  if (!sale) {
    const error = new Error('No provisional sale record exists for this listing.');
    error.statusCode = 404;
    throw error;
  }

  const nextStatus = approved ? 'RESERVED' : 'REJECTED';
  updateListing(listingId, {
    status: approved ? 'RESERVED' : 'CANCELLED',
    sellerDecision: approved ? 'approved' : 'rejected',
  });

  updateSale(sale.id, { status: nextStatus });

  if (approved) {
    createNotification({
      userId: listing.provisionalWinnerId,
      type: 'SALE_APPROVED',
      message: `The seller approved your bid for "${listing.title}". Please complete the handover plan.`,
      relatedListingId: listing.id,
      relatedUserId: sellerId,
    });
  } else {
    createNotification({
      userId: listing.provisionalWinnerId,
      type: 'SALE_REJECTED',
      message: `The seller rejected the provisional sale for "${listing.title}". The item remains available for new bids or review.`,
      relatedListingId: listing.id,
      relatedUserId: sellerId,
    });
  }

  return { listing, sale };
};

module.exports = {
  processBid,
  closeExpiredAuctions,
  approveWinner,
};
