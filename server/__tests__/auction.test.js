const request = require('supertest');
const { app } = require('../index');
const { state, updateListing, resetState, getListingById } = require('../store');
const { closeExpiredAuctions, processBid } = require('../services/auctionService');

beforeEach(() => {
  resetState();
});

const createStudent = async (name, email, password) => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password });

  expect(response.status).toBe(201);
  return response.body;
};

describe('CampusBid API', () => {
  test('registers and logs in a valid student', async () => {
    const first = await createStudent('Aisha Singh', 'aisha.test@campus.edu', 'secret123');
    expect(first.user.email).toBe('aisha.test@campus.edu');
    expect(first.token).toBeTruthy();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'aisha.test@campus.edu', password: 'secret123' });

    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test('creates a listing and enforces bid rules', async () => {
    const seller = await createStudent('Rohan Gupta', 'rohan.test@campus.edu', 'password123');
    const buyer = await createStudent('Mira Shah', 'mira.test@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Used MacBook Air',
        category: 'Electronics',
        description: 'Great battery and no visible damage',
        condition: 'Good',
        startingPrice: 25000,
        minimumIncrement: 500,
        closingAt: new Date(Date.now() + 3600000).toISOString(),
      });

    expect(listingResponse.status).toBe(201);
    const listing = listingResponse.body.listing;

    const belowStarting = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 20000 });
    expect(belowStarting.status).toBe(400);

    const firstValid = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 26000 });
    expect(firstValid.status).toBe(201);

    const sellerBid = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ amount: 27000 });
    expect(sellerBid.status).toBe(403);

    const invalidIncrement = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 26400 });
    expect(invalidIncrement.status).toBe(400);

    const validSecond = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 26500 });
    expect(validSecond.status).toBe(201);
  });

  test('hides seller emails from public listing responses but exposes them to the account owner', async () => {
    const seller = await createStudent('Leah Thomas', 'leah.public@campus.edu', 'password123');
    const buyer = await createStudent('Noah Kumar', 'noah.buyer@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Campus bicycle',
        category: 'Transport',
        description: 'Reliable and well maintained.',
        condition: 'Good',
        startingPrice: 6000,
        minimumIncrement: 300,
        closingAt: new Date(Date.now() + 3600000).toISOString(),
      });

    const listing = listingResponse.body.listing;
    const publicView = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${buyer.token}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.listing.seller.email).toBeUndefined();

    const ownProfile = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${seller.token}`);
    expect(ownProfile.status).toBe(200);
    expect(ownProfile.body.user.email).toBe('leah.public@campus.edu');
  });

  test('rejects unauthorized listing updates and prevents duplicate closure sales', async () => {
    const seller = await createStudent('Pranav Shah', 'pranav.seller@campus.edu', 'password123');
    const buyer = await createStudent('Kabir Das', 'kabir.buyer@campus.edu', 'password123');
    const other = await createStudent('Ishita Rao', 'ishita.other@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Study desk',
        category: 'Furniture',
        description: 'Compact desk with storage.',
        condition: 'Excellent',
        startingPrice: 5000,
        minimumIncrement: 250,
        closingAt: new Date(Date.now() - 1000).toISOString(),
      });

    const listing = listingResponse.body.listing;

    const unauthorizedUpdate = await request(app)
      .put(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ title: 'Hacked desk' });
    expect(unauthorizedUpdate.status).toBe(403);

    const bidResponse = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 5200 });
    expect(bidResponse.status).toBe(400);

    const firstClosure = closeExpiredAuctions();
    const secondClosure = closeExpiredAuctions();
    expect(firstClosure.length).toBeGreaterThanOrEqual(0);
    expect(secondClosure.length).toBeGreaterThanOrEqual(0);

    const matchingSales = state.sales.filter((sale) => sale.listingId === listing.id);
    expect(matchingSales.length).toBeLessThanOrEqual(1);
  });

  test('allows the seller to approve or reject the provisional winner once', async () => {
    const seller = await createStudent('Aditi Menon', 'aditi.menon@campus.edu', 'password123');
    const buyer = await createStudent('Vikram Nair', 'vikram.nair@campus.edu', 'password123');

    const approvalListing = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Headphones',
        category: 'Electronics',
        description: 'Used lightly and in great condition.',
        condition: 'Good',
        startingPrice: 2000,
        minimumIncrement: 200,
        closingAt: new Date(Date.now() + 600000).toISOString(),
      });

    const approvalItem = approvalListing.body.listing;
    const validBid = await request(app)
      .post(`/api/listings/${approvalItem.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 2300 });

    expect(validBid.status).toBe(201);
    updateListing(approvalItem.id, { closingAt: new Date(Date.now() - 1000).toISOString() });
    closeExpiredAuctions();

    const approval = await request(app)
      .patch(`/api/seller/listings/${approvalItem.id}/decision`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ approved: true });

    expect(approval.status).toBe(200);
    expect(approval.body.listing.status).toBe('RESERVED');

    const rejectedListing = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Camera tripod',
        category: 'Electronics',
        description: 'Sturdy and compact for travel shoots.',
        condition: 'Excellent',
        startingPrice: 1800,
        minimumIncrement: 150,
        closingAt: new Date(Date.now() + 600000).toISOString(),
      });

    const rejectItem = rejectedListing.body.listing;
    const validRejectBid = await request(app)
      .post(`/api/listings/${rejectItem.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 2100 });

    expect(validRejectBid.status).toBe(201);
    updateListing(rejectItem.id, { closingAt: new Date(Date.now() - 1000).toISOString() });
    closeExpiredAuctions();

    const rejection = await request(app)
      .patch(`/api/seller/listings/${rejectItem.id}/decision`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ approved: false });

    expect(rejection.status).toBe(200);
    expect(rejection.body.listing.status).toBe('CANCELLED');
  });

  test('extends a valid bid in the final 30 seconds by 60 seconds and rejects late invalid bids', async () => {
    const seller = await createStudent('Aman Singh', 'aman.test@campus.edu', 'password123');
    const buyer = await createStudent('Ira Sen', 'ira.test@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Desk lamp',
        category: 'Furniture',
        description: 'Bright LED desk lamp',
        condition: 'Good',
        startingPrice: 1500,
        minimumIncrement: 100,
        closingAt: new Date(Date.now() + 31 * 1000).toISOString(),
      });

    const listing = listingResponse.body.listing;
    const invalidBid = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 1400 });
    expect(invalidBid.status).toBe(400);
    expect(new Date(getListingById(listing.id).closingAt).getTime()).toBe(new Date(listing.closingAt).getTime());

    const closingAt = new Date(Date.now() + 30 * 1000).toISOString();
    updateListing(listing.id, { closingAt });

    const validBid = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 1700 });

    expect(validBid.status).toBe(201);
    const updated = getListingById(listing.id);
    expect(updated.currentBid).toBe(1700);
    expect(new Date(updated.closingAt).getTime() - Date.now()).toBeGreaterThanOrEqual(59 * 1000);
  });

  test('does not extend a bid when it lands more than 30 seconds before close', async () => {
    const seller = await createStudent('Nisha Roy', 'nisha.test@campus.edu', 'password123');
    const buyer = await createStudent('Dev Patel', 'dev.test@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Calculator',
        category: 'Stationery',
        description: 'Scientific calculator in great shape',
        condition: 'Excellent',
        startingPrice: 800,
        minimumIncrement: 50,
        closingAt: new Date(Date.now() + 31 * 1000).toISOString(),
      });

    const listing = listingResponse.body.listing;
    const response = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 900 });

    expect(response.status).toBe(201);
    const saved = getListingById(listing.id);
    expect(new Date(saved.closingAt).getTime()).toBe(new Date(listing.closingAt).getTime());
  });

  test('blocks bids after auction closure and does not extend the expired auction', async () => {
    const seller = await createStudent('Priyanka Jain', 'priyanka.test@campus.edu', 'password123');
    const buyer = await createStudent('Ritwik Rao', 'ritwik.test@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Portable speaker',
        category: 'Electronics',
        description: 'Small speaker with rich bass',
        condition: 'Good',
        startingPrice: 1800,
        minimumIncrement: 100,
        closingAt: new Date(Date.now() - 1000).toISOString(),
      });

    const listing = listingResponse.body.listing;
    const response = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 2000 });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/closed|no longer accepting/i);
    const saved = getListingById(listing.id);
    expect(saved.status).toBe('ACTIVE');
    expect(new Date(saved.closingAt).getTime()).toBeLessThan(Date.now());
  });

  test('allows repeated extensions for consecutive valid late bids', async () => {
    const seller = await createStudent('Ritika Shah', 'ritika.test@campus.edu', 'password123');
    const buyer = await createStudent('Aditya Kumar', 'aditya.test@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Bluetooth mouse',
        category: 'Electronics',
        description: 'Wireless mouse, near new',
        condition: 'Excellent',
        startingPrice: 1200,
        minimumIncrement: 100,
        closingAt: new Date(Date.now() + 15 * 1000).toISOString(),
      });

    const listing = listingResponse.body.listing;
    const first = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 1300 });
    expect(first.status).toBe(201);

    const afterFirst = getListingById(listing.id);
    expect(new Date(afterFirst.closingAt).getTime() - Date.now()).toBeGreaterThanOrEqual(59 * 1000);

    updateListing(listing.id, { closingAt: new Date(Date.now() + 15 * 1000).toISOString() });
    const second = await request(app)
      .post(`/api/listings/${listing.id}/bid`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ amount: 1400 });

    expect(second.status).toBe(201);
    const afterSecond = getListingById(listing.id);
    expect(new Date(afterSecond.closingAt).getTime() - Date.now()).toBeGreaterThanOrEqual(59 * 1000);
    expect(afterSecond.currentBid).toBe(1400);
  });

  test('handles concurrent late bids safely and keeps the auction state consistent', async () => {
    const seller = await createStudent('Mehul Verma', 'mehul.test@campus.edu', 'password123');
    const buyerA = await createStudent('Sana Qureshi', 'sana.test@campus.edu', 'password123');
    const buyerB = await createStudent('Karan Malhotra', 'karan.test@campus.edu', 'password123');

    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: 'Study chair',
        category: 'Furniture',
        description: 'Comfortable ergonomic chair',
        condition: 'Good',
        startingPrice: 2000,
        minimumIncrement: 100,
        closingAt: new Date(Date.now() + 20 * 1000).toISOString(),
      });

    const listing = listingResponse.body.listing;
    const [first, second] = await Promise.all([
      request(app).post(`/api/listings/${listing.id}/bid`).set('Authorization', `Bearer ${buyerA.token}`).send({ amount: 2100 }),
      request(app).post(`/api/listings/${listing.id}/bid`).set('Authorization', `Bearer ${buyerB.token}`).send({ amount: 2200 }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const saved = getListingById(listing.id);
    expect(saved.currentBid).toBe(2200);
    expect(new Date(saved.closingAt).getTime() - Date.now()).toBeGreaterThanOrEqual(59 * 1000);
  });
});
