const request = require('supertest');
const { app } = require('../index');
const { resetState, createUser, createListing, getListingById } = require('../store');

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

describe('CampusBid AI assistant', () => {
  test('converts natural-language requests into validated structured filters and returns real listings', async () => {
    const seller = await createStudent('Aisha', 'aisha.assistant@campus.edu', 'secret123');
    const buyer = await createStudent('Dev', 'dev.assistant@campus.edu', 'secret123');

    const listing = createListing({
      sellerId: seller.user.id,
      title: 'Scientific calculator',
      category: 'Stationery',
      description: 'Perfect for engineering exam prep.',
      condition: 'Good',
      startingPrice: 300,
      minimumIncrement: 50,
      closingAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
    });

    const response = await request(app)
      .post('/api/assistant/search')
      .send({ query: 'Show scientific calculators below ₹400.' });

    expect(response.status).toBe(200);
    expect(response.body.filters.category).toBe('Stationery');
    expect(response.body.filters.maxPrice).toBe(400);
    expect(response.body.results[0].id).toBe(listing.id);
    expect(response.body.results[0].link).toBe(`/listings/${listing.id}`);
  });

  test('rejects invalid filters', async () => {
    const response = await request(app)
      .post('/api/assistant/search')
      .send({ query: 'Find items under ₹0.' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/positive/i);
  });

  test('returns a no-match summary when there are no listings', async () => {
    const response = await request(app)
      .post('/api/assistant/search')
      .send({ query: 'Find a cycle under ₹2000.' });

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(0);
    expect(response.body.summary).toMatch(/No matching listings/i);
  });

  test('reports when AI provider credentials are missing and uses a non-AI fallback path', async () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const response = await request(app)
      .get('/api/assistant/status');

    expect(response.status).toBe(200);
    expect(response.body.providerAvailable).toBe(false);
    expect(response.body.mode).toBe('fallback');
  });

  test('requires authentication for AI-assisted bids and blocks unauthorized actions', async () => {
    const seller = await createStudent('Seller', 'seller.ai@campus.edu', 'secret123');
    const listing = createListing({
      sellerId: seller.user.id,
      title: 'Mechanical pencil set',
      category: 'Stationery',
      description: 'Sharp and ready.',
      condition: 'Good',
      startingPrice: 150,
      minimumIncrement: 25,
      closingAt: new Date(Date.now() + 60 * 1000).toISOString(),
      status: 'ACTIVE',
    });

    const unauthenticated = await request(app)
      .post('/api/assistant/bid')
      .send({ listingId: listing.id, proposedAmount: 200, confirmed: true });

    expect(unauthenticated.status).toBe(401);
  });

  test('requires explicit confirmation before placing an AI-initiated bid', async () => {
    const seller = await createStudent('Seller', 'seller2.ai@campus.edu', 'secret123');
    const buyer = await createStudent('Buyer', 'buyer2.ai@campus.edu', 'secret123');
    const listing = createListing({
      sellerId: seller.user.id,
      title: 'Desk lamp',
      category: 'Furniture',
      description: 'Perfect for study desks.',
      condition: 'Good',
      startingPrice: 1000,
      minimumIncrement: 100,
      closingAt: new Date(Date.now() + 60 * 1000).toISOString(),
      status: 'ACTIVE',
    });

    const response = await request(app)
      .post('/api/assistant/bid')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ listingId: listing.id, proposedAmount: 1100, confirmed: false });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/confirmation/i);
  });

  test('runs a confirmed AI-assisted bid through the existing backend API and reports the actual result', async () => {
    const seller = await createStudent('Seller', 'seller3.ai@campus.edu', 'secret123');
    const buyer = await createStudent('Buyer', 'buyer3.ai@campus.edu', 'secret123');
    const listing = createListing({
      sellerId: seller.user.id,
      title: 'Wireless mouse',
      category: 'Electronics',
      description: 'Used lightly and reliable.',
      condition: 'Excellent',
      startingPrice: 1000,
      minimumIncrement: 100,
      closingAt: new Date(Date.now() + 60 * 1000).toISOString(),
      status: 'ACTIVE',
    });

    const response = await request(app)
      .post('/api/assistant/bid')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ listingId: listing.id, proposedAmount: 1200, budgetLimit: 2000, confirmed: true });

    expect(response.status).toBe(201);
    expect(response.body.result.currentBid).toBe(1200);
    expect(response.body.result.currentBidderId).toBe(buyer.user.id);
    expect(response.body.proposedAmount).toBe(1200);
  });
});
