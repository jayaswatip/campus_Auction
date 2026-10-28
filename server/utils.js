const jwt = require('jsonwebtoken');
const { getUserById } = require('./store');

const sanitizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campusbidding-secret');
    const user = getUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User session is invalid.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token is invalid or expired.' });
  }
};

const sanitizeUser = (user, publicOnly = false) => ({
  id: user.id,
  name: sanitizeText(user.name),
  ...(publicOnly ? {} : { email: sanitizeText(user.email) }),
  createdAt: user.createdAt,
  profileImage: user.profileImage || null,
});

const sanitizeListing = (listing, user) => ({
  id: listing.id,
  title: sanitizeText(listing.title),
  description: sanitizeText(listing.description),
  category: sanitizeText(listing.category),
  condition: sanitizeText(listing.condition),
  imageUrls: Array.isArray(listing.imageUrls) ? listing.imageUrls.map((image) => sanitizeText(image)) : [],
  startingPrice: listing.startingPrice,
  minimumIncrement: listing.minimumIncrement,
  closingAt: listing.closingAt,
  currentBid: listing.currentBid || 0,
  currentBidder: listing.currentBidder ? sanitizeUser(listing.currentBidder, true) : null,
  seller: user ? sanitizeUser(user, true) : null,
  status: listing.status,
  createdAt: listing.createdAt,
  updatedAt: listing.updatedAt,
  provisionalWinnerId: listing.provisionalWinnerId || null,
  sellerDecision: listing.sellerDecision || 'pending',
  bidHistory: (listing.bidHistory || []).map((bid) => ({
    id: bid.id,
    bidder: bid.bidder ? sanitizeUser(bid.bidder, true) : null,
    amount: bid.amount,
    createdAt: bid.createdAt,
  })),
});

module.exports = {
  authMiddleware,
  sanitizeUser,
  sanitizeListing,
  sanitizeText,
};
