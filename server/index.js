require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { getNotificationsForUser, getUserById, getAllListings } = require('./store');
const { closeExpiredAuctions } = require('./services/auctionService');
const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const bidRoutes = require('./routes/bids');
const autoBidRoutes = require('./routes/autoBids');
const assistantRoutes = require('./routes/assistant');
const notificationRoutes = require('./routes/notifications');
const sellerRoutes = require('./routes/seller');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('MongoDB connection failed:', error.message));
}

const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/listings', bidRoutes);
app.use('/api/listings', autoBidRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/seller', sellerRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'CampusBid API' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error.' });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new Error('Authentication required for sockets.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campusbidding-secret');
    const user = getUserById(decoded.userId);
    if (!user) {
      return next(new Error('Socket user not found.'));
    }
    socket.user = user;
    next();
  } catch (error) {
    return next(new Error('Invalid socket token.'));
  }
});

io.on('connection', (socket) => {
  socket.on('join-auction', (listingId) => {
    if (listingId) socket.join(`auction:${listingId}`);
  });

  socket.on('join-notifications', () => {
    socket.join(`user:${socket.user.id}`);
  });

  socket.on('disconnect', () => {
    // no-op
  });
});

const emitAllAuctionUpdates = () => {
  const listings = getAllListings();
  listings.forEach((listing) => {
    io.to(`auction:${listing.id}`).emit('auction:update', { listing });
    io.to(`auction:${listing.id}`).emit('auction:countdown', {
      listingId: listing.id,
      closingAt: listing.closingAt,
      remainingMs: Math.max(0, new Date(listing.closingAt).getTime() - Date.now()),
    });
  });
};

global.__campusBidSocketEmitter = (listing) => {
  if (!listing) return;
  io.to(`auction:${listing.id}`).emit('auction:update', { listing });
  io.to(`auction:${listing.id}`).emit('auction:countdown', {
    listingId: listing.id,
    closingAt: listing.closingAt,
    remainingMs: Math.max(0, new Date(listing.closingAt).getTime() - Date.now()),
  });
};

const auctionMonitor = setInterval(() => {
  const changed = closeExpiredAuctions();
  if (changed.length > 0) {
    emitAllAuctionUpdates();
  }
}, 15000);
auctionMonitor.unref();

app.locals.io = io;

if (require.main === module) {
  server.listen(port, () => {
    console.log(`CampusBid server running on http://localhost:${port}`);
  });
}

module.exports = { app, server, io, emitAllAuctionUpdates };
