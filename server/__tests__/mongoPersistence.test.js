require('dotenv').config({ quiet: true });

const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../index');
const { initializeDatabase, updateListing } = require('../store');
const { closeExpiredAuctions } = require('../services/auctionService');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Sale = require('../models/Sale');
const AutoBid = require('../models/AutoBid');
const Notification = require('../models/Notification');
const SavedSearch = require('../models/SavedSearch');

const integrationEnabled = process.env.RUN_MONGO_INTEGRATION_TESTS === '1';
const persistenceSuite = integrationEnabled ? describe : describe.skip;
const suffix = `mongo-test-${Date.now()}`;
const emails = [`seller.${suffix}@campus.edu`, `buyer.${suffix}@campus.edu`, `rival.${suffix}@campus.edu`];
const listingIds = [];
let userIds = [];

const authorization = (token) => ({ Authorization: `Bearer ${token}` });
const registerStudent = async (name, email) => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'secure123' });

  expect(response.status).toBe(201);
  return response.body;
};

persistenceSuite('MongoDB persistence (requires Atlas or another replica set)', () => {
  beforeAll(async () => {
    if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in the private environment before enabling this suite.');
    await mongoose.connect(process.env.MONGO_URI);
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') {
      throw new Error('MongoDB persistence tests require a replica set or mongos for transactions.');
    }
    await initializeDatabase();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await Promise.all([
        User.deleteMany({ email: { $in: emails } }),
        Listing.deleteMany({ id: { $in: listingIds } }),
        Bid.deleteMany({ listingId: { $in: listingIds } }),
        Sale.deleteMany({ listingId: { $in: listingIds } }),
        AutoBid.deleteMany({ listingId: { $in: listingIds } }),
        SavedSearch.deleteMany({ userId: { $in: userIds } }),
        Notification.deleteMany({
          $or: [{ userId: { $in: userIds } }, { relatedListingId: { $in: listingIds } }],
        }),
      ]);
      await mongoose.disconnect();
    }
  });

  test('persists account, auction, bid, sale, notification, auto-bid, and saved-search data across restart', async () => {
    const seller = await registerStudent('Mongo Seller', emails[0]);
    const buyer = await registerStudent('Mongo Buyer', emails[1]);
    const rival = await registerStudent('Mongo Rival', emails[2]);
    userIds = [seller.user.id, buyer.user.id, rival.user.id];

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: emails[0], password: 'secure123' });
    expect(login.status).toBe(200);

    const savedSearch = await request(app)
      .post('/api/saved-searches')
      .set(authorization(buyer.token))
      .send({
        name: `Persistence ${suffix}`,
        filters: { query: suffix, category: 'Stationery', maxPrice: 3000 },
      });
    expect(savedSearch.status).toBe(201);

    const createdListing = await request(app)
      .post('/api/listings')
      .set(authorization(seller.token))
      .send({
        title: `Persistence item ${suffix}`,
        category: 'Stationery',
        description: 'MongoDB persistence integration test.',
        condition: 'Good',
        startingPrice: 1000,
        minimumIncrement: 100,
        closingAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    expect(createdListing.status).toBe(201);
    const listingId = createdListing.body.listing.id;
    listingIds.push(listingId);

    const createdAutoBid = await request(app)
      .post(`/api/listings/${listingId}/auto-bid`)
      .set(authorization(buyer.token))
      .send({ maxAmount: 2000, confirmed: true });
    expect(createdAutoBid.status).toBe(201);

    const bid = await request(app)
      .post(`/api/listings/${listingId}/bid`)
      .set(authorization(rival.token))
      .send({ amount: 1200 });
    expect(bid.status).toBe(201);
    expect(bid.body.listing.currentBid).toBe(1300);

    const beforeRestartNotifications = await request(app)
      .get('/api/notifications')
      .set(authorization(buyer.token));
    expect(beforeRestartNotifications.body.notifications.some((item) => item.type === 'NEW_MATCHING_LISTING')).toBe(true);

    await updateListing(listingId, { closingAt: new Date(Date.now() - 1000).toISOString() });
    await closeExpiredAuctions();
    const approval = await request(app)
      .patch(`/api/seller/listings/${listingId}/decision`)
      .set(authorization(seller.token))
      .send({ approved: true });
    expect(approval.status).toBe(200);

    const handover = await request(app)
      .patch(`/api/seller/listings/${listingId}/handover`)
      .set(authorization(seller.token))
      .send({ status: 'CONFIRMED' });
    expect(handover.status).toBe(200);

    await mongoose.disconnect();
    await mongoose.connect(process.env.MONGO_URI);
    await initializeDatabase();

    const persistedListing = await request(app).get(`/api/listings/${listingId}`);
    expect(persistedListing.status).toBe(200);
    expect(persistedListing.body.listing.status).toBe('RESERVED');

    const persistedSavedSearches = await request(app)
      .get('/api/saved-searches')
      .set(authorization(buyer.token));
    expect(persistedSavedSearches.body.savedSearches.some((item) => item.id === savedSearch.body.savedSearch.id)).toBe(true);

    const persistedAutoBid = await request(app)
      .get(`/api/listings/${listingId}/auto-bid`)
      .set(authorization(buyer.token));
    expect(persistedAutoBid.body.instruction.maxAmount).toBe(2000);

    const persistedSales = await request(app)
      .get('/api/seller/overview')
      .set(authorization(seller.token));
    expect(persistedSales.body.soldItems.some((item) => item.listingId === listingId)).toBe(true);

    const persistedNotifications = await request(app)
      .get('/api/notifications')
      .set(authorization(buyer.token));
    expect(persistedNotifications.body.notifications.length).toBeGreaterThan(0);
    expect(await Bid.countDocuments({ listingId })).toBeGreaterThanOrEqual(2);
  });
});
