const {
  getListingById,
  getAllListings,
  updateListing,
  createNotification,
  createSale,
  getSaleByListingId,
  updateSale,
  createAutoBid,
  getAutoBidForListingAndBuyer,
  getAutoBidsForListing,
  updateAutoBid,
  deleteAutoBid,
  isDatabaseConnected,
  placeBidAtomically,
  closeExpiredListingAtomically,
  decideSaleAtomically,
} = require('../store');

const LAST_MINUTE_EXTENSION_WINDOW_MS = 30 * 1000;
const LAST_MINUTE_EXTENSION_LENGTH_MS = 60 * 1000;

const getRemainingAuctionTime = (listing, now = Date.now()) => {
  if (!listing) return 0;
  return Math.max(0, new Date(listing.closingAt).getTime() - now);
};

const shouldExtendClosingTime = (listing, now = Date.now()) => {
  if (!listing || listing.status !== 'ACTIVE') {
    return false;
  }

  const remainingMs = getRemainingAuctionTime(listing, now);
  return remainingMs > 0 && remainingMs <= LAST_MINUTE_EXTENSION_WINDOW_MS;
};

const getExtendedClosingAt = (listing, now = Date.now()) => {
  if (!shouldExtendClosingTime(listing, now)) {
    return listing?.closingAt || null;
  }

  return new Date(now + LAST_MINUTE_EXTENSION_LENGTH_MS).toISOString();
};

const emitAuctionUpdate = (listing) => {
  if (global.__campusBidSocketEmitter && listing) {
    global.__campusBidSocketEmitter(listing);
  }
};

const getAutoBidTieBreakRank = (instruction) => ({
  maxAmount: Number(instruction.maxAmount || 0),
  createdAt: new Date(instruction.createdAt || 0).getTime(),
  id: String(instruction.id || ''),
});

const sortAutoBidsByPriority = (instructions) => [...instructions].sort((a, b) => {
  const aRank = getAutoBidTieBreakRank(a);
  const bRank = getAutoBidTieBreakRank(b);

  if (bRank.maxAmount !== aRank.maxAmount) return bRank.maxAmount - aRank.maxAmount;
  if (aRank.createdAt !== bRank.createdAt) return aRank.createdAt - bRank.createdAt;
  return aRank.id.localeCompare(bRank.id);
});

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

  const queued = previous.then(() => next);
  global.__campusBidLocks[key] = queued;

  await previous;
  try {
    return await callback();
  } finally {
    if (release) {
      release();
    }
    if (global.__campusBidLocks[key] === queued) delete global.__campusBidLocks[key];
  }
};

const notifyAutoBidStatus = async (listing, previousBidderId = null) => {
  const currentBidderId = listing.currentBidderId;
  const currentBid = Number(listing.currentBid || 0);

  for (const instruction of await getAutoBidsForListing(listing.id)) {
    if (!instruction.active || !instruction.confirmed) continue;

    const reachedLimit = currentBidderId === instruction.buyerId && currentBid >= Number(instruction.maxAmount || 0);
    if (reachedLimit) {
      await createNotification({
        userId: instruction.buyerId,
        type: 'AUTO_BID_LIMIT',
        message: `Your automatic bid for "${listing.title}" has reached its maximum authorized amount.`,
        relatedListingId: listing.id,
        dedupeKey: `auto-bid-limit:${listing.id}:${instruction.buyerId}`,
      });
    }

    const wasOutbid = previousBidderId === instruction.buyerId && currentBidderId !== instruction.buyerId;
    if (wasOutbid) {
      await createNotification({
        userId: instruction.buyerId,
        type: 'AUTO_BID_OUTBID',
        message: `You were outbid on "${listing.title}". Your automatic bidding instruction is still active.`,
        relatedListingId: listing.id,
        relatedUserId: currentBidderId,
        dedupeKey: `auto-bid-outbid:${listing.id}:${instruction.buyerId}`,
      });
    }
  }
};

const notifyClosingSoonIfDue = async (listing) => {
  if (!listing || listing.status !== 'ACTIVE') return false;

  const remainingMs = getRemainingAuctionTime(listing, Date.now());
  if (remainingMs <= 0 || remainingMs > 60 * 60 * 1000) return false;

  const lastAlert = listing.lastClosingSoonNotifiedAt ? new Date(listing.lastClosingSoonNotifiedAt).getTime() : null;
  if (lastAlert && Date.now() - lastAlert < 30 * 60 * 1000) return false;

  await createNotification({
    userId: listing.sellerId,
    type: 'AUCTION_CLOSING_SOON',
    message: `Your listing "${listing.title}" is closing soon. Consider reviewing the current bid and final terms.`,
    relatedListingId: listing.id,
    dedupeKey: `closing-soon:seller:${listing.id}`,
  });

  if (listing.currentBidderId) {
    await createNotification({
      userId: listing.currentBidderId,
      type: 'AUCTION_CLOSING_SOON',
      message: `The auction for "${listing.title}" is closing soon. Consider placing your final bid before the timer ends.`,
      relatedListingId: listing.id,
      relatedUserId: listing.sellerId,
      dedupeKey: `closing-soon:bidder:${listing.id}:${listing.currentBidderId}`,
    });
  }

  await updateListing(listing.id, { lastClosingSoonNotifiedAt: new Date().toISOString() });
  return true;
};

const resolveAutoBidsForListingLocked = async (listingId) => {
  const listing = await getListingById(listingId);
  if (!listing || listing.status !== 'ACTIVE') {
    return null;
  }

  const now = Date.now();
  if (now > new Date(listing.closingAt).getTime()) {
    return null;
  }

  const activeInstructions = (await getAutoBidsForListing(listingId)).filter((instruction) => instruction.active && instruction.confirmed);
  if (activeInstructions.length === 0) {
    return null;
  }

  const sortedInstructions = sortAutoBidsByPriority(activeInstructions);
  const leader = sortedInstructions[0];
  if (!leader) {
    return null;
  }

  const currentBid = Number(listing.currentBid || 0);
  const nextMinimumBid = currentBid === 0 ? Number(listing.startingPrice) : Number(currentBid + Number(listing.minimumIncrement));
  const leaderMax = Number(leader.maxAmount || 0);

  if (leaderMax < nextMinimumBid) {
    return null;
  }

  if (listing.currentBidderId === leader.buyerId) {
    return null;
  }

  const previousBidderId = listing.currentBidderId;
  const nextAmount = Math.min(leaderMax, nextMinimumBid);
  const extensionTarget = getExtendedClosingAt(listing, now);
  let updated;
  let previousBidder = previousBidderId;
  let extended = extensionTarget && extensionTarget !== listing.closingAt;
  if (isDatabaseConnected()) {
    try {
      const commit = await placeBidAtomically({
        listingId,
        bidderId: leader.buyerId,
        amount: nextAmount,
        now,
        extensionWindowMs: LAST_MINUTE_EXTENSION_WINDOW_MS,
        extensionLengthMs: LAST_MINUTE_EXTENSION_LENGTH_MS,
      });
      updated = commit.listing;
      previousBidder = commit.previousBidderId;
      extended = commit.extended;
    } catch (error) {
      if (error.statusCode === 400 && /Bid must be at least/.test(error.message)) return null;
      throw error;
    }
  } else {
    updated = updateListing(listingId, {
      currentBid: nextAmount,
      currentBidderId: leader.buyerId,
      closingAt: extensionTarget === listing.closingAt ? listing.closingAt : extensionTarget,
      bidHistory: [
        ...listing.bidHistory,
        {
          id: `bid_${Date.now()}`,
          bidderId: leader.buyerId,
          amount: nextAmount,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  if (extended) {
    await createNotification({
      userId: listing.sellerId,
      type: 'AUCTION_EXTENDED',
      message: `The auction for "${listing.title}" was extended by a final-minute automatic bid and will now close in 60 seconds.`,
      relatedListingId: listing.id,
      relatedUserId: leader.buyerId,
    });
  }

  await createNotification({
    userId: listing.sellerId,
    type: 'NEW_BID',
    message: `A new automatic bid of ₹${nextAmount} was placed on ${listing.title}.`,
    relatedListingId: listing.id,
    relatedUserId: leader.buyerId,
  });

  await notifyAutoBidStatus(updated, previousBidder);
  emitAuctionUpdate(updated);
  return updated;
};

const resolveAutoBidsForListing = async (listingId) => {
  return withListingLock(listingId, async () => resolveAutoBidsForListingLocked(listingId));
};

const createAutoBidInstruction = async ({ listingId, buyerId, maxAmount, confirmed = false, active = true }) => {
  const listing = await getListingById(listingId);
  if (!listing) {
    const error = new Error('Listing not found.');
    error.statusCode = 404;
    throw error;
  }

  if (listing.status !== 'ACTIVE' || new Date(listing.closingAt).getTime() <= Date.now()) {
    const error = new Error('Automatic bidding is only available while the auction is active.');
    error.statusCode = 400;
    throw error;
  }

  if (listing.sellerId === buyerId) {
    const error = new Error('Sellers cannot enable automatic bidding on their own listings.');
    error.statusCode = 403;
    throw error;
  }

  const parsedMax = Number(maxAmount);
  if (!Number.isFinite(parsedMax) || parsedMax <= 0) {
    const error = new Error('Automatic bid maximum must be a valid positive amount.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await getAutoBidForListingAndBuyer(listingId, buyerId);
  if (existing) {
    if (active === true && confirmed !== true && existing.confirmed !== true) {
      const error = new Error('You must explicitly confirm automatic bidding before activating it.');
      error.statusCode = 400;
      throw error;
    }

    const updates = {};
    if (Number.isFinite(parsedMax)) updates.maxAmount = parsedMax;
    if (confirmed === true) updates.confirmed = true;
    if (active === false) updates.active = false;
    if (active === true) updates.active = true;
    if (Object.keys(updates).length === 0) updates.confirmed = true;
    const updated = await updateAutoBid(existing.id, updates);
    return updated;
  }

  if (confirmed !== true) {
    const error = new Error('You must explicitly confirm automatic bidding before activating it.');
    error.statusCode = 400;
    throw error;
  }

  const instruction = await createAutoBid({
    listingId,
    buyerId,
    maxAmount: parsedMax,
    active: Boolean(active),
    confirmed: true,
  });

  return instruction;
};

const getAutoBidInstruction = async ({ listingId, buyerId }) => {
  const instruction = await getAutoBidForListingAndBuyer(listingId, buyerId);
  if (!instruction) {
    return null;
  }

  return instruction;
};

const updateAutoBidInstruction = async ({ listingId, buyerId, maxAmount, active, confirmed = false }) => {
  const listing = await getListingById(listingId);
  if (!listing) {
    const error = new Error('Listing not found.');
    error.statusCode = 404;
    throw error;
  }

  const instruction = await getAutoBidForListingAndBuyer(listingId, buyerId);
  if (!instruction) {
    const error = new Error('Automatic bidding instruction not found.');
    error.statusCode = 404;
    throw error;
  }

  if (listing.status !== 'ACTIVE' || new Date(listing.closingAt).getTime() <= Date.now()) {
    const error = new Error('Automatic bidding updates are only available while the auction is active.');
    error.statusCode = 400;
    throw error;
  }

  if (typeof active === 'boolean' && active === true && confirmed !== true && instruction.confirmed !== true) {
    const error = new Error('You must explicitly confirm automatic bidding before activating it.');
    error.statusCode = 400;
    throw error;
  }

  const nextState = {
    ...(Number.isFinite(Number(maxAmount)) ? { maxAmount: Number(maxAmount) } : {}),
    ...(typeof active === 'boolean' ? { active } : {}),
    ...(confirmed === true ? { confirmed: true } : {}),
  };

  if (Object.keys(nextState).length === 0) {
    return instruction;
  }

  return updateAutoBid(instruction.id, nextState);
};

const deactivateAutoBidInstruction = async ({ listingId, buyerId }) => {
  const listing = await getListingById(listingId);
  if (!listing) {
    const error = new Error('Listing not found.');
    error.statusCode = 404;
    throw error;
  }

  const instruction = await getAutoBidForListingAndBuyer(listingId, buyerId);
  if (!instruction) {
    const error = new Error('Automatic bidding instruction not found.');
    error.statusCode = 404;
    throw error;
  }

  if (listing.status !== 'ACTIVE' || new Date(listing.closingAt).getTime() <= Date.now()) {
    const error = new Error('Automatic bidding cannot be deactivated after the auction has closed.');
    error.statusCode = 400;
    throw error;
  }

  return updateAutoBid(instruction.id, { active: false });
};

const processBid = async ({ listingId, bidderId, amount }) => {
  const bidValue = Number(amount);

  return withListingLock(listingId, async () => {
    const listing = await getListingById(listingId);
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

    const now = Date.now();
    const closingAt = new Date(listing.closingAt).getTime();
    if (now > closingAt) {
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

    let updated;
    let previousBidderId = listing.currentBidderId;
    let extensionApplied = false;
    if (isDatabaseConnected()) {
      const commit = await placeBidAtomically({
        listingId,
        bidderId,
        amount: bidValue,
        now,
        extensionWindowMs: LAST_MINUTE_EXTENSION_WINDOW_MS,
        extensionLengthMs: LAST_MINUTE_EXTENSION_LENGTH_MS,
      });
      updated = commit.listing;
      previousBidderId = commit.previousBidderId;
      extensionApplied = commit.extended;
    } else {
      const extensionTarget = getExtendedClosingAt(listing, now);
      extensionApplied = extensionTarget && extensionTarget !== listing.closingAt;
      updated = updateListing(listingId, {
        currentBid: bidValue,
        currentBidderId: bidderId,
        closingAt: extensionApplied ? extensionTarget : listing.closingAt,
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
    }

    if (previousBidderId && previousBidderId !== bidderId) {
      await createNotification({
        userId: previousBidderId,
        type: 'HIGHER_BID',
        message: `A higher competing bid was placed on "${listing.title}".`,
        relatedListingId: listing.id,
        relatedUserId: bidderId,
        dedupeKey: `higher-bid:${listing.id}:${previousBidderId}`,
      });
    }

    if (extensionApplied) {
      await createNotification({
        userId: listing.sellerId,
        type: 'AUCTION_EXTENDED',
        message: `The auction for "${listing.title}" was extended by a final-minute bid and will now close in 60 seconds.`,
        relatedListingId: listing.id,
        relatedUserId: bidderId,
        dedupeKey: `auction-extended:${listing.id}`,
      });
      emitAuctionUpdate(updated);
    }

    await createNotification({
      userId: listing.sellerId,
      type: 'NEW_BID',
      message: `A new valid bid of ₹${bidValue} was placed on ${listing.title}.`,
      relatedListingId: listing.id,
      relatedUserId: bidderId,
      dedupeKey: `new-bid:${listing.id}:${bidderId}:${bidValue}`,
    });

    await notifyAutoBidStatus(updated, previousBidderId);
    emitAuctionUpdate(updated);

    return (await resolveAutoBidsForListingLocked(listingId)) || updated;
  });
};

const closeExpiredAuctions = async () => {
  const now = Date.now();
  const affected = [];
  const listings = await getAllListings();

  for (const candidate of listings) {
    await withListingLock(candidate.id, async () => {
      const listing = await getListingById(candidate.id);
      if (!listing || listing.status !== 'ACTIVE') return;
      await notifyClosingSoonIfDue(listing);
      if (new Date(listing.closingAt).getTime() > now) return;

      let closure;
      if (isDatabaseConnected()) {
        closure = await closeExpiredListingAtomically(candidate.id, new Date(now));
      } else {
        const existingSale = await getSaleByListingId(candidate.id);
        if (existingSale) return;
        const highestBid = listing.bidHistory.length
          ? [...listing.bidHistory].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
          : null;

        if (!highestBid) {
          closure = { listing: await updateListing(candidate.id, { status: 'UNSOLD' }), sale: null, highestBid: null };
        } else {
          const sale = await createSale({
            listingId: listing.id,
            sellerId: listing.sellerId,
            buyerId: highestBid.bidderId,
            winningBidId: highestBid.id,
            price: highestBid.amount,
            status: 'PENDING_APPROVAL',
          });
          const updated = await updateListing(candidate.id, {
            status: 'PENDING_APPROVAL',
            provisionalWinnerId: highestBid.bidderId,
            sellerDecision: 'pending',
          });
          closure = { listing: updated, sale, highestBid };
        }
      }

      if (!closure) return;
      emitAuctionUpdate(closure.listing);

      if (!closure.highestBid) {
        await createNotification({
          userId: listing.sellerId,
          type: 'AUCTION_CLOSED',
          message: `Your listing "${listing.title}" closed without bids and is marked unsold.`,
          relatedListingId: listing.id,
          dedupeKey: `auction-closed:${listing.id}`,
        });
        affected.push(listing.id);
        return;
      }

      const winningBid = closure.highestBid;
      await createNotification({
        userId: listing.sellerId,
        type: 'PROVISIONAL_WIN',
        message: `The provisional winning bid for "${listing.title}" is ₹${winningBid.amount}. Review and approve or reject it.`,
        relatedListingId: listing.id,
        relatedUserId: winningBid.bidderId,
        dedupeKey: `provisional-win:seller:${listing.id}`,
      });
      await createNotification({
        userId: winningBid.bidderId,
        type: 'PROVISIONAL_WIN',
        message: `You are the provisional winner of "${listing.title}". Please wait for the seller's decision.`,
        relatedListingId: listing.id,
        relatedUserId: listing.sellerId,
        dedupeKey: `provisional-win:buyer:${listing.id}:${winningBid.bidderId}`,
      });
      affected.push({ listingId: listing.id, saleId: closure.sale.id });
    });
  }
  return affected;
};

const approveWinnerLocked = async ({ listingId, sellerId, approved }) => {
  const listing = await getListingById(listingId);
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

  const sale = await getSaleByListingId(listingId);
  if (!sale) {
    const error = new Error('No provisional sale record exists for this listing.');
    error.statusCode = 404;
    throw error;
  }

  let updated;
  let decidedSale;
  if (isDatabaseConnected()) {
    const result = await decideSaleAtomically({ listingId, sellerId, approved });
    if (!result) {
      const error = new Error('No provisional sale record exists for this listing.');
      error.statusCode = 404;
      throw error;
    }
    updated = result.listing;
    decidedSale = result.sale;
  } else {
    const nextStatus = approved ? 'RESERVED' : 'REJECTED';
    updated = await updateListing(listingId, {
      status: approved ? 'RESERVED' : 'CANCELLED',
      sellerDecision: approved ? 'approved' : 'rejected',
    });
    decidedSale = await updateSale(sale.id, { status: nextStatus });
  }
  emitAuctionUpdate(updated);

  if (approved) {
    await createNotification({
      userId: listing.provisionalWinnerId,
      type: 'SALE_APPROVED',
      message: `The seller approved your bid for "${listing.title}". Please complete the handover plan.`,
      relatedListingId: listing.id,
      relatedUserId: sellerId,
      dedupeKey: `sale-approved:${listing.id}:${listing.provisionalWinnerId}`,
    });
    await createNotification({
      userId: sellerId,
      type: 'BID_ACCEPTED',
      message: `You accepted the winning bid for "${listing.title}".`,
      relatedListingId: listing.id,
      relatedUserId: listing.provisionalWinnerId,
      dedupeKey: `bid-accepted:${listing.id}:${sellerId}`,
    });
  } else {
    await createNotification({
      userId: listing.provisionalWinnerId,
      type: 'SALE_REJECTED',
      message: `The seller rejected the provisional sale for "${listing.title}". The item remains available for new bids or review.`,
      relatedListingId: listing.id,
      relatedUserId: sellerId,
      dedupeKey: `sale-rejected:${listing.id}:${listing.provisionalWinnerId}`,
    });
    await createNotification({
      userId: sellerId,
      type: 'BID_REJECTED',
      message: `You rejected the provisional bid for "${listing.title}".`,
      relatedListingId: listing.id,
      relatedUserId: listing.provisionalWinnerId,
      dedupeKey: `bid-rejected:${listing.id}:${sellerId}`,
    });
  }

  return { listing: updated, sale: decidedSale };
};

const approveWinner = ({ listingId, sellerId, approved }) => withListingLock(
  listingId,
  () => approveWinnerLocked({ listingId, sellerId, approved })
);

module.exports = {
  LAST_MINUTE_EXTENSION_WINDOW_MS,
  LAST_MINUTE_EXTENSION_LENGTH_MS,
  getRemainingAuctionTime,
  shouldExtendClosingTime,
  getExtendedClosingAt,
  createAutoBidInstruction,
  getAutoBidInstruction,
  updateAutoBidInstruction,
  deactivateAutoBidInstruction,
  resolveAutoBidsForListing,
  processBid,
  closeExpiredAuctions,
  approveWinner,
  notifyClosingSoonIfDue,
};
