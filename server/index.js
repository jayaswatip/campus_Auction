require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { getUserById, getAllListings, initializeDatabase, setTransactionSupport } = require('./store');
const { closeExpiredAuctions } = require('./services/auctionService');
const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const bidRoutes = require('./routes/bids');
const autoBidRoutes = require('./routes/autoBids');
const assistantRoutes = require('./routes/assistant');
const notificationRoutes = require('./routes/notifications');
const sellerRoutes = require('./routes/seller');
const savedSearchRoutes = require('./routes/savedSearches');
const { notifyMatchingSavedSearchesForListing } = require('./services/savedSearchService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/listings', bidRoutes);
app.use('/api/listings', autoBidRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/seller', sellerRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable',
    name: 'CampusBid API',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use((err, req, res, next) => {
  console.error('Request failed:', err.message);
  if (err.code === 11000) {
    return res.status(409).json({ message: 'A record with the same unique value already exists.' });
  }
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ message: 'The submitted data is invalid.' });
  }
  return res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Server error.' });
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new Error('Authentication required for sockets.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campusbidding-secret');
    const user = await getUserById(decoded.userId);
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

const emitAllAuctionUpdates = async () => {
  const listings = await getAllListings();
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

app.locals.io = io;

let backgroundJobs = [];
const startBackgroundJobs = () => {
  let closingRunActive = false;
  const auctionMonitor = setInterval(async () => {
    if (closingRunActive) return;
    closingRunActive = true;
    try {
      const changed = await closeExpiredAuctions();
      if (changed.length > 0) await emitAllAuctionUpdates();
    } catch (error) {
      console.error('Auction monitor failed:', error.message);
    } finally {
      closingRunActive = false;
    }
  }, 15000);

  let savedSearchRunActive = false;
  const savedSearchMonitor = setInterval(async () => {
    if (savedSearchRunActive) return;
    savedSearchRunActive = true;
    try {
      const listings = await getAllListings();
      for (const listing of listings) await notifyMatchingSavedSearchesForListing(listing);
    } catch (error) {
      console.error('Saved-search monitor failed:', error.message);
    } finally {
      savedSearchRunActive = false;
    }
  }, 60000);

  auctionMonitor.unref();
  savedSearchMonitor.unref();
  backgroundJobs = [auctionMonitor, savedSearchMonitor];
};

const startServer = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be configured before CampusBid can start.');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    const supportsTransactions = Boolean(topology.setName || topology.msg === 'isdbgrid');
    setTransactionSupport(supportsTransactions);
    if (!supportsTransactions) {
      console.warn('MongoDB is running standalone; multi-document auction operations will not be transactional.');
    }
    await initializeDatabase();
  } catch (error) {
    setTransactionSupport(false);
    await mongoose.disconnect().catch(() => {});
    throw new Error(`MongoDB startup failed (${error.name}). Check the private MONGO_URI, network access, and database permissions.`);
  }

  startBackgroundJobs();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        server.removeListener('error', reject);
        console.log(`CampusBid server running on http://localhost:${port}`);
        resolve();
      });
    });
  } catch (error) {
    backgroundJobs.forEach(clearInterval);
    backgroundJobs = [];
    await mongoose.disconnect();
    throw error;
  }
  return server;
};

const stopServer = async () => {
  backgroundJobs.forEach(clearInterval);
  backgroundJobs = [];
  if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, server, io, emitAllAuctionUpdates, startServer, stopServer };
