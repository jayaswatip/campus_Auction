const crypto = require('crypto');
const mongoose = require('mongoose');

const state = {
  users: [],
  listings: [],
  notifications: [],
  sales: [],
  autoBids: [],
  savedSearches: [],
};

const isDatabaseConnected = () => mongoose.connection.readyState === 1;
const models = () => ({
  User: require('./models/User'),
  Listing: require('./models/Listing'),
  Bid: require('./models/Bid'),
  Notification: require('./models/Notification'),
  Sale: require('./models/Sale'),
  AutoBid: require('./models/AutoBid'),
  SavedSearch: require('./models/SavedSearch'),
});

const toRecord = (document) => {
  if (!document) return null;
  const record = typeof document.toObject === 'function' ? document.toObject() : { ...document };
  record.id = record.id || String(record._id);
  delete record._id;
  delete record.__v;
  for (const key of ['createdAt', 'updatedAt', 'closingAt', 'lastClosingSoonNotifiedAt']) {
    if (record[key] instanceof Date) record[key] = record[key].toISOString();
  }
  if (Array.isArray(record.bidHistory)) {
    record.bidHistory = record.bidHistory.map((bid) => ({
      ...bid,
      id: bid.id || String(bid._id || uid('bid')),
      createdAt: bid.createdAt instanceof Date ? bid.createdAt.toISOString() : bid.createdAt,
    })).map(({ _id, ...bid }) => bid);
  }
  return record;
};

const listingDocument = (listing) => ({
  id: listing.id,
  sellerId: listing.sellerId,
  title: listing.title,
  category: listing.category,
  description: listing.description,
  condition: listing.condition,
  imageUrls: listing.imageUrls,
  startingPrice: listing.startingPrice,
  minimumIncrement: listing.minimumIncrement,
  closingAt: new Date(listing.closingAt),
  status: listing.status,
  currentBid: listing.currentBid,
  currentBidderId: listing.currentBidderId,
  provisionalWinnerId: listing.provisionalWinnerId,
  sellerDecision: listing.sellerDecision,
  bidHistory: (listing.bidHistory || []).map((bid) => ({
    id: bid.id || uid('bid'),
    bidderId: bid.bidderId,
    amount: Number(bid.amount),
    createdAt: new Date(bid.createdAt),
  })),
  lastClosingSoonNotifiedAt: listing.lastClosingSoonNotifiedAt || null,
});

const persistNotificationRecord = ({ userId, type, message, relatedListingId = null, relatedUserId = null, dedupeKey }, session = null) => {
  const { Notification } = models();
  const notificationKey = dedupeKey || `user:${userId}|type:${type}|listing:${relatedListingId || 'none'}|other:${relatedUserId || 'none'}|message:${String(message).slice(0, 120)}`;
  return Notification.findOneAndUpdate(
    { dedupeKey: notificationKey },
    {
      $setOnInsert: {
        id: uid('notification'),
        userId,
        type,
        message,
        relatedListingId,
        relatedUserId,
        read: false,
        dedupeKey: notificationKey,
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, ...(session ? { session } : {}) }
  ).lean().then(toRecord);
};

const initializeDatabase = async () => {
  if (!isDatabaseConnected()) throw new Error('MongoDB must be connected before initializing application data.');
  const { User, Listing, Bid, Notification, Sale, AutoBid, SavedSearch } = models();

  for (const Model of [User, Listing, Bid, Notification, Sale, AutoBid, SavedSearch]) {
    const records = await Model.find({ id: { $exists: false } }).select('_id').lean();
    for (const record of records) {
      await Model.updateOne({ _id: record._id }, { $set: { id: String(record._id) } }, { runValidators: false });
    }
  }

  const legacyListings = await Listing.find({ 'bidHistory.id': { $exists: false } });
  for (const document of legacyListings) {
    let changed = false;
    for (const bid of document.bidHistory) {
      if (!bid.id) {
        bid.id = uid('bid');
        changed = true;
      }
    }
    if (changed) await document.save();
  }

  for (const Model of [User, Listing, Bid, Notification, Sale, AutoBid, SavedSearch]) {
    await Model.createIndexes();
  }
  await ensureSeedData();
};

const resetState = () => {
  if (isDatabaseConnected()) {
    throw new Error('resetState is only available for the in-memory test store.');
  }
  state.users = [];
  state.listings = [];
  state.notifications = [];
  state.sales = [];
  state.autoBids = [];
  state.savedSearches = [];
  if (!isDatabaseConnected()) ensureSeedData();
};

const ensureSeedData = async () => {
  if (isDatabaseConnected()) {
    const { User, Listing } = models();
    const seedUsers = [
      { id: 'seed_user_aarav', name: 'Aarav Mehta', email: 'aarav@campus.edu', passwordHash: 'demo-hash' },
      { id: 'seed_user_diya', name: 'Diya Nair', email: 'diya@campus.edu', passwordHash: 'demo-hash' },
    ];
    const users = [];
    for (const seed of seedUsers) {
      const user = await User.findOneAndUpdate(
        { email: seed.email },
        { $setOnInsert: seed },
        { upsert: true, returnDocument: 'after', runValidators: true }
      ).lean();
      users.push(toRecord(user));
    }

    const seedListings = [
      {
        id: 'seed_listing_vintage_trek',
        sellerId: users[0].id,
        title: 'Vintage Trek Bicycle',
        category: 'Transport',
        description: 'Well maintained hybrid bike for campus commuting and weekend rides.',
        condition: 'Good',
        imageUrls: ['https://images.unsplash.com/...'],
        startingPrice: 6500,
        minimumIncrement: 250,
        closingAt: new Date(Date.now() + 1000 * 60 * 60 * 36),
        status: 'ACTIVE',
        currentBid: 6500,
        currentBidderId: users[1].id,
        provisionalWinnerId: null,
        sellerDecision: 'pending',
        bidHistory: [],
      },
      {
        id: 'seed_listing_macbook_air',
        sellerId: users[1].id,
        title: 'MacBook Air 2021',
        category: 'Electronics',
        description: 'Battery health is strong and device has been kept in a clean pouch.',
        condition: 'Excellent',
        imageUrls: ['https://images.unsplash.com/...'],
        startingPrice: 38000,
        minimumIncrement: 1000,
        closingAt: new Date(Date.now() + 1000 * 60 * 60 * 72),
        status: 'ACTIVE',
        currentBid: 0,
        currentBidderId: null,
        provisionalWinnerId: null,
        sellerDecision: 'pending',
        bidHistory: [],
      },
    ];

    for (const seed of seedListings) {
      await Listing.findOneAndUpdate(
        { sellerId: seed.sellerId, title: seed.title },
        { $setOnInsert: seed },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );
    }
    return;
  }

  if (state.users.length > 0 || state.listings.length > 0) {
    return;
  }

  const user1 = createUser({
    name: 'Aarav Mehta',
    email: 'aarav@campus.edu',
    passwordHash: 'demo-hash',
  });

  const user2 = createUser({
    name: 'Diya Nair',
    email: 'diya@campus.edu',
    passwordHash: 'demo-hash',
  });

  createListing({
    sellerId: user1.id,
    title: 'Vintage Trek Bicycle',
    category: 'Transport',
    description: 'Well maintained hybrid bike for campus commuting and weekend rides.',
    condition: 'Good',
    imageUrls: ['https://images.unsplash.com/...'],
    startingPrice: 6500,
    minimumIncrement: 250,
    closingAt: new Date(Date.now() + 1000 * 60 * 60 * 36).toISOString(),
    currentBid: 6500,
    currentBidderId: user2.id,
  });

  createListing({
    sellerId: user2.id,
    title: 'MacBook Air 2021',
    category: 'Electronics',
    description: 'Battery health is strong and device has been kept in a clean pouch.',
    condition: 'Excellent',
    imageUrls: ['https://images.unsplash.com/...'],
    startingPrice: 38000,
    minimumIncrement: 1000,
    closingAt: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
  });
};

const uid = (prefix = 'id') => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

const createUser = ({ name, email, passwordHash, profileImage = null }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = {
    id: uid('user'),
    name: String(name || '').trim(),
    email: normalizedEmail,
    passwordHash,
    profileImage,
    createdAt: new Date().toISOString(),
  };

  if (isDatabaseConnected()) {
    const { User } = models();
    return User.create(user).then(toRecord);
  }

  state.users.push(user);
  return user;
};

const getUserById = (id) => {
  if (isDatabaseConnected()) {
    const { User } = models();
    return User.findOne({ id }).lean().then(toRecord);
  }
  return state.users.find((user) => user.id === id) || null;
};
const getUserByEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (isDatabaseConnected()) {
    const { User } = models();
    return User.findOne({ email: normalizedEmail }).lean().then(toRecord);
  }
  return state.users.find((user) => user.email.toLowerCase() === normalizedEmail) || null;
};
const getAllUsers = () => {
  if (isDatabaseConnected()) {
    const { User } = models();
    return User.find({}).sort({ createdAt: 1 }).lean().then((users) => users.map(toRecord));
  }
  return [...state.users];
};

const createListing = ({ sellerId, title, category, description, condition, imageUrls = [], startingPrice, minimumIncrement, closingAt, status = 'ACTIVE', currentBid = 0, currentBidderId = null, bidHistory = [] }) => {
  const listing = {
    id: uid('listing'),
    sellerId,
    title,
    category,
    description,
    condition,
    imageUrls,
    startingPrice: Number(startingPrice),
    minimumIncrement: Number(minimumIncrement),
    closingAt: new Date(closingAt).toISOString(),
    currentBid: Number(currentBid || 0),
    currentBidderId,
    bidHistory: bidHistory.map((bid) => ({
      ...bid,
      id: bid.id || uid('bid'),
    })),
    status,
    provisionalWinnerId: null,
    sellerDecision: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const notifyMatches = (created) => {
    const { notifyMatchingSavedSearchesForListing } = require('./services/savedSearchService');
    const result = notifyMatchingSavedSearchesForListing(created);
    return result && typeof result.then === 'function' ? result.then(() => created) : created;
  };

  if (isDatabaseConnected()) {
    const { Listing } = models();
    return Listing.create(listingDocument(listing)).then(toRecord).then(notifyMatches);
  }

  state.listings.push(listing);
  const { notifyMatchingSavedSearchesForListing } = require('./services/savedSearchService');
  notifyMatchingSavedSearchesForListing(listing);
  return listing;
};

const getAllListings = () => {
  if (isDatabaseConnected()) {
    const { Listing } = models();
    return Listing.find({}).sort({ createdAt: -1 }).lean().then((listings) => listings.map(toRecord));
  }
  return [...state.listings];
};
const getListingById = (id) => {
  if (isDatabaseConnected()) {
    const { Listing } = models();
    return Listing.findOne({ id }).lean().then(toRecord);
  }
  return state.listings.find((listing) => listing.id === id) || null;
};

const updateListing = (listingId, changes) => {
  if (isDatabaseConnected()) {
    const { Listing, Bid } = models();
    const update = { ...changes, updatedAt: new Date() };
    if (update.bidHistory) {
      update.bidHistory = update.bidHistory.map((bid) => ({
        ...bid,
        id: bid.id || uid('bid'),
        createdAt: new Date(bid.createdAt),
      }));
      return mongoose.connection.transaction(async (session) => {
        const document = await Listing.findOneAndUpdate(
          { id: listingId },
          { $set: update, $inc: { __v: 1 } },
          { returnDocument: 'after', runValidators: true, session }
        );
        if (!document) return null;
        const bids = update.bidHistory.map((bid) => ({
          updateOne: {
            filter: { id: bid.id },
            update: { $setOnInsert: { ...bid, listingId } },
            upsert: true,
          },
        }));
        if (bids.length) await Bid.bulkWrite(bids, { session, ordered: true });
        return toRecord(document);
      });
    }

    return Listing.findOneAndUpdate(
      { id: listingId },
      { $set: update, $inc: { __v: 1 } },
      { returnDocument: 'after', runValidators: true }
    ).lean().then(toRecord);
  }

  const listing = getListingById(listingId);
  if (!listing) return null;

  Object.assign(listing, changes, { updatedAt: new Date().toISOString() });
  return listing;
};

const placeBidAtomically = async ({ listingId, bidderId, amount, now, extensionWindowMs, extensionLengthMs }) => {
  const { Listing, Bid, AutoBid } = models();
  return mongoose.connection.transaction(async (session) => {
    const listing = await Listing.findOne({ id: listingId }).session(session);
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

    const nowMs = new Date(now).getTime();
    const closingMs = new Date(listing.closingAt).getTime();
    const previousBidderId = listing.currentBidderId;
    if (nowMs > closingMs) {
      const error = new Error('The auction is closed.');
      error.statusCode = 400;
      throw error;
    }
    const currentBid = Number(listing.currentBid || 0);
    const minimumBid = currentBid === 0 ? Number(listing.startingPrice) : currentBid + Number(listing.minimumIncrement);
    if (!Number.isFinite(amount) || amount < minimumBid) {
      const error = new Error(`Bid must be at least ₹${minimumBid}.`);
      error.statusCode = 400;
      throw error;
    }

    const remaining = closingMs - nowMs;
    const extended = remaining > 0 && remaining <= extensionWindowMs;
    const bid = {
      id: uid('bid'),
      listingId,
      bidderId,
      amount: Number(amount),
      createdAt: new Date(nowMs),
    };
    listing.currentBid = Number(amount);
    listing.currentBidderId = bidderId;
    if (extended) listing.closingAt = new Date(nowMs + extensionLengthMs);
    listing.bidHistory.push(bid);

    await listing.save({ session });
    await Bid.create([{ ...bid }], { session });
    if (listing.bidHistory.length > 1) {
      const previousBidderId = listing.bidHistory[listing.bidHistory.length - 2].bidderId;
      if (previousBidderId && previousBidderId !== bidderId) {
        await persistNotificationRecord({
          userId: previousBidderId,
          type: 'HIGHER_BID',
          message: `A higher competing bid was placed on "${listing.title}".`,
          relatedListingId: listing.id,
          relatedUserId: bidderId,
          dedupeKey: `higher-bid:${listing.id}:${previousBidderId}`,
        }, session);
      }
    }
    await persistNotificationRecord({
      userId: listing.sellerId,
      type: 'NEW_BID',
      message: `A new valid bid of ₹${amount} was placed on ${listing.title}.`,
      relatedListingId: listing.id,
      relatedUserId: bidderId,
      dedupeKey: `new-bid:${listing.id}:${bidderId}:${amount}`,
    }, session);
    if (extended) {
      await persistNotificationRecord({
        userId: listing.sellerId,
        type: 'AUCTION_EXTENDED',
        message: `The auction for "${listing.title}" was extended by a final-minute bid and will now close in 60 seconds.`,
        relatedListingId: listing.id,
        relatedUserId: bidderId,
        dedupeKey: `auction-extended:${listing.id}`,
      }, session);
    }
    const activeInstructions = await AutoBid.find({ listingId, active: true, confirmed: true }).session(session);
    for (const instruction of activeInstructions) {
      if (listing.currentBidderId === instruction.buyerId && amount >= instruction.maxAmount) {
        await persistNotificationRecord({
          userId: instruction.buyerId,
          type: 'AUTO_BID_LIMIT',
          message: `Your automatic bid for "${listing.title}" has reached its maximum authorized amount.`,
          relatedListingId: listing.id,
          dedupeKey: `auto-bid-limit:${listing.id}:${instruction.buyerId}`,
        }, session);
      }

      if (previousBidderId === instruction.buyerId && listing.currentBidderId !== instruction.buyerId) {
        await persistNotificationRecord({
          userId: instruction.buyerId,
          type: 'AUTO_BID_OUTBID',
          message: `You were outbid on "${listing.title}". Your automatic bidding instruction is still active.`,
          relatedListingId: listing.id,
          relatedUserId: listing.currentBidderId,
          dedupeKey: `auto-bid-outbid:${listing.id}:${instruction.buyerId}`,
        }, session);
      }
    }
    return {
      listing: toRecord(listing),
      previousBidderId,
      extended,
    };
  });
};

const closeExpiredListingAtomically = async (listingId, now = new Date()) => {
  const { Listing, Sale } = models();
  return mongoose.connection.transaction(async (session) => {
    const listing = await Listing.findOne({ id: listingId }).session(session);
    if (!listing || listing.status !== 'ACTIVE' || new Date(listing.closingAt).getTime() > new Date(now).getTime()) {
      return null;
    }

    const existingSale = await Sale.findOne({ listingId }).session(session);
    if (existingSale) return null;

    const highestBid = [...listing.bidHistory].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    if (!highestBid) {
      listing.status = 'UNSOLD';
      await listing.save({ session });
      await persistNotificationRecord({
        userId: listing.sellerId,
        type: 'AUCTION_CLOSED',
        message: `Your listing "${listing.title}" closed without bids and is marked unsold.`,
        relatedListingId: listing.id,
        dedupeKey: `auction-closed:${listing.id}`,
      }, session);
      return { listing: toRecord(listing), sale: null, highestBid: null };
    }

    const sale = {
      id: uid('sale'),
      listingId,
      sellerId: listing.sellerId,
      buyerId: highestBid.bidderId,
      winningBidId: highestBid.id,
      price: highestBid.amount,
      status: 'PENDING_APPROVAL',
      handoverStatus: 'PENDING',
    };
    const [saleDocument] = await Sale.create([sale], { session });
    listing.status = 'PENDING_APPROVAL';
    listing.provisionalWinnerId = highestBid.bidderId;
    listing.sellerDecision = 'pending';
    await listing.save({ session });
    await persistNotificationRecord({
      userId: listing.sellerId,
      type: 'PROVISIONAL_WIN',
      message: `The provisional winning bid for "${listing.title}" is ₹${highestBid.amount}. Review and approve or reject it.`,
      relatedListingId: listing.id,
      relatedUserId: highestBid.bidderId,
      dedupeKey: `provisional-win:seller:${listing.id}`,
    }, session);
    await persistNotificationRecord({
      userId: highestBid.bidderId,
      type: 'PROVISIONAL_WIN',
      message: `You are the provisional winner of "${listing.title}". Please wait for the seller's decision.`,
      relatedListingId: listing.id,
      relatedUserId: listing.sellerId,
      dedupeKey: `provisional-win:buyer:${listing.id}:${highestBid.bidderId}`,
    }, session);
    return { listing: toRecord(listing), sale: toRecord(saleDocument), highestBid: toRecord(highestBid) };
  });
};

const decideSaleAtomically = async ({ listingId, sellerId, approved }) => {
  const { Listing, Sale } = models();
  return mongoose.connection.transaction(async (session) => {
    const listing = await Listing.findOne({ id: listingId }).session(session);
    if (!listing) return null;
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

    const sale = await Sale.findOne({ listingId }).session(session);
    if (!sale) return null;
    const nextStatus = approved ? 'RESERVED' : 'REJECTED';
    listing.status = approved ? 'RESERVED' : 'CANCELLED';
    listing.sellerDecision = approved ? 'approved' : 'rejected';
    sale.status = nextStatus;
    await listing.save({ session });
    await sale.save({ session });
    const buyerType = approved ? 'SALE_APPROVED' : 'SALE_REJECTED';
    const sellerType = approved ? 'BID_ACCEPTED' : 'BID_REJECTED';
    await persistNotificationRecord({
      userId: listing.provisionalWinnerId,
      type: buyerType,
      message: approved
        ? `The seller approved your bid for "${listing.title}". Please complete the handover plan.`
        : `The seller rejected the provisional sale for "${listing.title}". The item remains available for new bids or review.`,
      relatedListingId: listing.id,
      relatedUserId: sellerId,
      dedupeKey: `${approved ? 'sale-approved' : 'sale-rejected'}:${listing.id}:${listing.provisionalWinnerId}`,
    }, session);
    await persistNotificationRecord({
      userId: sellerId,
      type: sellerType,
      message: approved
        ? `You accepted the winning bid for "${listing.title}".`
        : `You rejected the provisional bid for "${listing.title}".`,
      relatedListingId: listing.id,
      relatedUserId: listing.provisionalWinnerId,
      dedupeKey: `${approved ? 'bid-accepted' : 'bid-rejected'}:${listing.id}:${sellerId}`,
    }, session);
    return { listing: toRecord(listing), sale: toRecord(sale) };
  });
};

const createBid = ({ listingId, bidderId, amount }) => {
  const bid = {
    id: uid('bid'),
    listingId,
    bidderId,
    amount: Number(amount),
    createdAt: new Date().toISOString(),
  };

  if (isDatabaseConnected()) {
    const { Listing, Bid } = models();
    return mongoose.connection.transaction(async (session) => {
      const listing = await Listing.findOne({ id: listingId }).session(session);
      if (!listing) return null;
      listing.bidHistory.push(bid);
      listing.currentBid = Number(amount);
      listing.currentBidderId = bidderId;
      await listing.save({ session });
      await Bid.create([{ ...bid, listingId }], { session });
      return bid;
    });
  }

  const listing = getListingById(listingId);
  if (!listing) return null;

  listing.bidHistory.push(bid);
  listing.currentBid = Number(amount);
  listing.currentBidderId = bidderId;
  listing.updatedAt = new Date().toISOString();
  return bid;
};

const createNotification = ({ userId, type, message, relatedListingId = null, relatedUserId = null, dedupeKey = null }) => {
  if (!userId || !type || !message) {
    return null;
  }

  const notificationKey = dedupeKey || `user:${userId}|type:${type}|listing:${relatedListingId || 'none'}|other:${relatedUserId || 'none'}|message:${String(message).slice(0, 120)}`;
  if (isDatabaseConnected()) {
    return persistNotificationRecord({
      userId,
      type,
      message,
      relatedListingId,
      relatedUserId,
      dedupeKey: notificationKey,
    });
  }

  const existing = state.notifications.find((notification) => notification.dedupeKey === notificationKey);
  if (existing) {
    return existing;
  }

  const notification = {
    id: uid('notification'),
    userId,
    type,
    message,
    relatedListingId,
    relatedUserId,
    read: false,
    dedupeKey: notificationKey,
    createdAt: new Date().toISOString(),
  };

  state.notifications.push(notification);
  return notification;
};

const getNotificationsForUser = (userId) => {
  if (isDatabaseConnected()) {
    const { Notification } = models();
    return Notification.find({ userId }).sort({ createdAt: -1 }).lean().then((items) => items.map(toRecord));
  }
  return state.notifications
    .filter((notification) => notification.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const markNotificationAsRead = (notificationId, userId = null) => {
  if (isDatabaseConnected()) {
    const { Notification } = models();
    return Notification.findOneAndUpdate(
      { id: notificationId, ...(userId ? { userId } : {}) },
      { $set: { read: true } },
      { returnDocument: 'after', runValidators: true }
    ).lean().then(toRecord);
  }
  const notification = state.notifications.find((item) => item.id === notificationId && (!userId || item.userId === userId));
  if (!notification) return null;
  notification.read = true;
  return notification;
};

const markAllNotificationsAsRead = (userId) => {
  if (isDatabaseConnected()) {
    const { Notification } = models();
    return Notification.updateMany({ userId, read: false }, { $set: { read: true } })
      .then(() => getNotificationsForUser(userId));
  }
  const notifications = state.notifications.filter((item) => item.userId === userId);
  notifications.forEach((notification) => {
    notification.read = true;
  });
  return notifications;
};

const createSale = ({ listingId, sellerId, buyerId, winningBidId, price, status = 'PENDING_APPROVAL' }) => {
  const sale = {
    id: uid('sale'),
    listingId,
    sellerId,
    buyerId,
    winningBidId,
    price,
    status,
    handoverStatus: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isDatabaseConnected()) {
    const { Sale } = models();
    return Sale.findOneAndUpdate(
      { listingId },
      { $setOnInsert: sale },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean().then(toRecord);
  }
  state.sales.push(sale);
  return sale;
};

const getSalesForUser = (userId) => {
  if (isDatabaseConnected()) {
    const { Sale } = models();
    return Sale.find({ $or: [{ sellerId: userId }, { buyerId: userId }] }).sort({ createdAt: -1 }).lean().then((items) => items.map(toRecord));
  }
  return state.sales.filter((sale) => sale.sellerId === userId || sale.buyerId === userId);
};
const getSaleByListingId = (listingId) => {
  if (isDatabaseConnected()) {
    const { Sale } = models();
    return Sale.findOne({ listingId }).lean().then(toRecord);
  }
  return state.sales.find((sale) => sale.listingId === listingId) || null;
};

const updateSale = (saleId, changes) => {
  if (isDatabaseConnected()) {
    const { Sale } = models();
    return Sale.findOneAndUpdate(
      { id: saleId },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: 'after', runValidators: true }
    ).lean().then(toRecord);
  }
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale) return null;

  Object.assign(sale, changes, { updatedAt: new Date().toISOString() });
  return sale;
};

const updateSaleWithNotification = async (saleId, changes, notification) => {
  if (!isDatabaseConnected()) {
    const sale = updateSale(saleId, changes);
    if (!sale) return null;
    createNotification(notification);
    return sale;
  }

  const { Sale } = models();
  return mongoose.connection.transaction(async (session) => {
    const sale = await Sale.findOne({ id: saleId }).session(session);
    if (!sale) return null;
    Object.assign(sale, changes, { updatedAt: new Date() });
    await sale.save({ session });
    await persistNotificationRecord(notification, session);
    return toRecord(sale);
  });
};

const createAutoBid = ({ listingId, buyerId, maxAmount, active = true, confirmed = false }) => {
  const instruction = {
    id: uid('autobid'),
    listingId,
    buyerId,
    maxAmount: Number(maxAmount),
    active: Boolean(active),
    confirmed: Boolean(confirmed),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isDatabaseConnected()) {
    const { AutoBid } = models();
    return AutoBid.create(instruction).then(toRecord);
  }
  state.autoBids.push(instruction);
  return instruction;
};

const getAutoBidsForListing = (listingId) => {
  if (isDatabaseConnected()) {
    const { AutoBid } = models();
    return AutoBid.find({ listingId }).sort({ createdAt: 1 }).lean().then((items) => items.map(toRecord));
  }
  return state.autoBids.filter((instruction) => instruction.listingId === listingId);
};
const getAutoBidForListingAndBuyer = (listingId, buyerId) => {
  if (isDatabaseConnected()) {
    const { AutoBid } = models();
    return AutoBid.findOne({ listingId, buyerId }).lean().then(toRecord);
  }
  return state.autoBids.find((instruction) => instruction.listingId === listingId && instruction.buyerId === buyerId) || null;
};
const getAutoBidsForUser = (buyerId) => {
  if (isDatabaseConnected()) {
    const { AutoBid } = models();
    return AutoBid.find({ buyerId }).sort({ createdAt: -1 }).lean().then((items) => items.map(toRecord));
  }
  return state.autoBids.filter((instruction) => instruction.buyerId === buyerId);
};

const updateAutoBid = (instructionId, changes) => {
  if (isDatabaseConnected()) {
    const { AutoBid } = models();
    return AutoBid.findOneAndUpdate(
      { id: instructionId },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: 'after', runValidators: true }
    ).lean().then(toRecord);
  }
  const instruction = state.autoBids.find((item) => item.id === instructionId);
  if (!instruction) return null;

  Object.assign(instruction, changes, { updatedAt: new Date().toISOString() });
  return instruction;
};

const deleteAutoBid = (instructionId) => {
  if (isDatabaseConnected()) {
    const { AutoBid } = models();
    return AutoBid.findOneAndDelete({ id: instructionId }).lean().then(toRecord);
  }
  const index = state.autoBids.findIndex((item) => item.id === instructionId);
  if (index === -1) return null;
  const [instruction] = state.autoBids.splice(index, 1);
  return instruction;
};

const createSavedSearch = ({ userId, name, filters = {} }) => {
  const savedSearch = {
    id: uid('savedsearch'),
    userId,
    name: String(name || 'Saved search').trim() || 'Saved search',
    filters: {
      query: filters.query || '',
      category: filters.category || null,
      condition: filters.condition || null,
      minPrice: filters.minPrice !== undefined && filters.minPrice !== null ? Number(filters.minPrice) : null,
      maxPrice: filters.maxPrice !== undefined && filters.maxPrice !== null ? Number(filters.maxPrice) : null,
      closingSoon: Boolean(filters.closingSoon),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isDatabaseConnected()) {
    const { SavedSearch } = models();
    return SavedSearch.create(savedSearch).then(toRecord);
  }
  state.savedSearches.push(savedSearch);
  return savedSearch;
};

const getSavedSearchesForUser = (userId) => {
  if (isDatabaseConnected()) {
    const { SavedSearch } = models();
    return SavedSearch.find({ userId }).sort({ updatedAt: -1 }).lean().then((items) => items.map(toRecord));
  }
  return state.savedSearches
    .filter((search) => search.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
};

const getSavedSearchById = (id) => {
  if (isDatabaseConnected()) {
    const { SavedSearch } = models();
    return SavedSearch.findOne({ id }).lean().then(toRecord);
  }
  return state.savedSearches.find((search) => search.id === id) || null;
};
const getAllSavedSearches = () => {
  if (isDatabaseConnected()) {
    const { SavedSearch } = models();
    return SavedSearch.find({}).sort({ createdAt: 1 }).lean().then((items) => items.map(toRecord));
  }
  return [...state.savedSearches];
};

const updateSavedSearch = (savedSearchId, changes) => {
  if (isDatabaseConnected()) {
    const { SavedSearch } = models();
    return SavedSearch.findOneAndUpdate(
      { id: savedSearchId },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: 'after', runValidators: true }
    ).lean().then(toRecord);
  }
  const savedSearch = state.savedSearches.find((item) => item.id === savedSearchId);
  if (!savedSearch) return null;

  Object.assign(savedSearch, changes, { updatedAt: new Date().toISOString() });
  return savedSearch;
};

const deleteSavedSearch = (savedSearchId) => {
  if (isDatabaseConnected()) {
    const { SavedSearch } = models();
    return SavedSearch.findOneAndDelete({ id: savedSearchId }).lean().then(toRecord);
  }
  const index = state.savedSearches.findIndex((item) => item.id === savedSearchId);
  if (index === -1) return null;
  const [deleted] = state.savedSearches.splice(index, 1);
  return deleted;
};

module.exports = {
  state,
  uid,
  isDatabaseConnected,
  initializeDatabase,
  placeBidAtomically,
  closeExpiredListingAtomically,
  decideSaleAtomically,
  createUser,
  getUserById,
  getUserByEmail,
  getAllUsers,
  createListing,
  getAllListings,
  getListingById,
  updateListing,
  createBid,
  createNotification,
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createSale,
  getSalesForUser,
  getSaleByListingId,
  updateSale,
  updateSaleWithNotification,
  createAutoBid,
  getAutoBidsForListing,
  getAutoBidForListingAndBuyer,
  getAutoBidsForUser,
  updateAutoBid,
  deleteAutoBid,
  createSavedSearch,
  getSavedSearchesForUser,
  getSavedSearchById,
  getAllSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  ensureSeedData,
  resetState,
};

if (!isDatabaseConnected()) ensureSeedData();
