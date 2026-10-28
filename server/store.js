const crypto = require('crypto');

const state = {
  users: [],
  listings: [],
  notifications: [],
  sales: [],
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
  return listing;
};

const getAllListings = () => [...state.listings];
const getListingById = (id) => state.listings.find((listing) => listing.id === id) || null;

const updateListing = (listingId, changes) => {
  const listing = getListingById(listingId);
  if (!listing) return null;

  Object.assign(listing, changes, { updatedAt: new Date().toISOString() });
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

const createNotification = ({ userId, type, message, relatedListingId = null, relatedUserId = null }) => {
  const notification = {
    id: uid('notification'),
    userId,
    type,
    message,
    relatedListingId,
    relatedUserId,
    read: false,
    createdAt: new Date().toISOString(),
  };

  state.notifications.push(notification);
  return notification;
};

const getNotificationsForUser = (userId) => state.notifications.filter((notification) => notification.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
  createSale,
  getSalesForUser,
  getSaleByListingId,
  updateSale,
  ensureSeedData,
};
