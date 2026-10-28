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

const persistListing = (listing) => {
  if (!listing || mongoose.connection.readyState !== 1) {
    return null;
  }

  const ListingModel = require('./models/Listing');
  return ListingModel.findOneAndUpdate(
    { sellerId: listing.sellerId, title: listing.title, createdAt: listing.createdAt },
    {
      sellerId: listing.sellerId,
      title: listing.title,
      category: listing.category,
      description: listing.description,
      condition: listing.condition,
      imageUrls: listing.imageUrls,
      startingPrice: listing.startingPrice,
      minimumIncrement: listing.minimumIncrement,
      closingAt: listing.closingAt,
      status: listing.status,
      currentBid: listing.currentBid,
      currentBidderId: listing.currentBidderId,
      provisionalWinnerId: listing.provisionalWinnerId,
      sellerDecision: listing.sellerDecision,
      bidHistory: listing.bidHistory,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
};

const persistNotification = (notification) => {
  if (!notification || mongoose.connection.readyState !== 1) {
    return null;
  }

  const NotificationModel = require('./models/Notification');
  return NotificationModel.findOneAndUpdate(
    { dedupeKey: notification.dedupeKey },
    {
      userId: notification.userId,
      type: notification.type,
      message: notification.message,
      relatedListingId: notification.relatedListingId,
      relatedUserId: notification.relatedUserId,
      read: notification.read,
      dedupeKey: notification.dedupeKey,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
};

const persistSavedSearch = (savedSearch) => {
  if (!savedSearch || mongoose.connection.readyState !== 1) {
    return null;
  }

  const SavedSearchModel = require('./models/SavedSearch');
  return SavedSearchModel.findOneAndUpdate(
    { userId: savedSearch.userId, name: savedSearch.name },
    {
      userId: savedSearch.userId,
      name: savedSearch.name,
      filters: savedSearch.filters,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
};

const resetState = () => {
  state.users = [];
  state.listings = [];
  state.notifications = [];
  state.sales = [];
  state.autoBids = [];
  state.savedSearches = [];
  ensureSeedData();
};

const ensureSeedData = () => {
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

  state.users.push(user);
  return user;
};

const getUserById = (id) => state.users.find((user) => user.id === id) || null;
const getUserByEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return state.users.find((user) => user.email.toLowerCase() === normalizedEmail) || null;
};
const getAllUsers = () => [...state.users];

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

  state.listings.push(listing);
  persistListing(listing);

  try {
    const { notifyMatchingSavedSearchesForListing } = require('./services/savedSearchService');
    notifyMatchingSavedSearchesForListing(listing);
  } catch (error) {
    // Saved-search notifications are best-effort; duplicated or missing notifications are ignored.
  }

  return listing;
};

const getAllListings = () => [...state.listings];
const getListingById = (id) => state.listings.find((listing) => listing.id === id) || null;

const updateListing = (listingId, changes) => {
  const listing = getListingById(listingId);
  if (!listing) return null;

  Object.assign(listing, changes, { updatedAt: new Date().toISOString() });
  persistListing(listing);

  try {
    const { notifyMatchingSavedSearchesForListing } = require('./services/savedSearchService');
    notifyMatchingSavedSearchesForListing(listing);
  } catch (error) {
    // Saved-search notifications are best-effort; duplicated or missing notifications are ignored.
  }

  return listing;
};

const createBid = ({ listingId, bidderId, amount }) => {
  const bid = {
    id: uid('bid'),
    listingId,
    bidderId,
    amount: Number(amount),
    createdAt: new Date().toISOString(),
  };

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
  persistNotification(notification);
  return notification;
};

const getNotificationsForUser = (userId) => state.notifications
  .filter((notification) => notification.userId === userId)
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const markNotificationAsRead = (notificationId, userId = null) => {
  const notification = state.notifications.find((item) => item.id === notificationId && (!userId || item.userId === userId));
  if (!notification) return null;
  notification.read = true;
  return notification;
};

const markAllNotificationsAsRead = (userId) => {
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

  state.sales.push(sale);
  return sale;
};

const getSalesForUser = (userId) => state.sales.filter((sale) => sale.sellerId === userId || sale.buyerId === userId);
const getSaleByListingId = (listingId) => state.sales.find((sale) => sale.listingId === listingId) || null;

const updateSale = (saleId, changes) => {
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale) return null;

  Object.assign(sale, changes, { updatedAt: new Date().toISOString() });
  return sale;
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

  state.autoBids.push(instruction);
  return instruction;
};

const getAutoBidsForListing = (listingId) => state.autoBids.filter((instruction) => instruction.listingId === listingId);
const getAutoBidForListingAndBuyer = (listingId, buyerId) => state.autoBids.find((instruction) => instruction.listingId === listingId && instruction.buyerId === buyerId) || null;
const getAutoBidsForUser = (buyerId) => state.autoBids.filter((instruction) => instruction.buyerId === buyerId);

const updateAutoBid = (instructionId, changes) => {
  const instruction = state.autoBids.find((item) => item.id === instructionId);
  if (!instruction) return null;

  Object.assign(instruction, changes, { updatedAt: new Date().toISOString() });
  return instruction;
};

const deleteAutoBid = (instructionId) => {
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

  state.savedSearches.push(savedSearch);
  persistSavedSearch(savedSearch);
  return savedSearch;
};

const getSavedSearchesForUser = (userId) => state.savedSearches
  .filter((search) => search.userId === userId)
  .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

const getSavedSearchById = (id) => state.savedSearches.find((search) => search.id === id) || null;
const getAllSavedSearches = () => [...state.savedSearches];

const updateSavedSearch = (savedSearchId, changes) => {
  const savedSearch = state.savedSearches.find((item) => item.id === savedSearchId);
  if (!savedSearch) return null;

  Object.assign(savedSearch, changes, { updatedAt: new Date().toISOString() });
  persistSavedSearch(savedSearch);
  return savedSearch;
};

const deleteSavedSearch = (savedSearchId) => {
  const index = state.savedSearches.findIndex((item) => item.id === savedSearchId);
  if (index === -1) return null;
  const [deleted] = state.savedSearches.splice(index, 1);
  return deleted;
};

ensureSeedData();

module.exports = {
  state,
  uid,
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
