const request = require('supertest');
const { app } = require('../index');
const { resetState, createListing, getNotificationsForUser, createNotification } = require('../store');
const { notifyMatchingSavedSearchesForListing } = require('../services/savedSearchService');

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

describe('Saved searches and notifications', () => {
  test('creates a saved search and notifies the user when a matching listing is published without duplicate delivery', async () => {
    const watcher = await createStudent('Zoya', 'zoya.saved@campus.edu', 'secret123');
    const seller = await createStudent('Rahul', 'rahul.saved@campus.edu', 'secret123');

    const savedSearchResponse = await request(app)
      .post('/api/saved-searches')
      .set('Authorization', `Bearer ${watcher.token}`)
      .send({
        name: 'Study calculators',
        filters: {
          category: 'Stationery',
          query: 'calculator',
          maxPrice: 400,
        },
      });

    expect(savedSearchResponse.status).toBe(201);

    const listing = createListing({
      sellerId: seller.user.id,
      title: 'Scientific calculator',
      category: 'Stationery',
      description: 'Very handy for engineering work.',
      condition: 'Good',
      startingPrice: 320,
      minimumIncrement: 50,
      closingAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
    });

    const matchingNotifications = getNotificationsForUser(watcher.user.id).filter((notification) => notification.type === 'NEW_MATCHING_LISTING');
    expect(matchingNotifications).toHaveLength(1);
    expect(matchingNotifications[0].relatedListingId).toBe(listing.id);

    const retryResults = notifyMatchingSavedSearchesForListing(listing);
    expect(retryResults).toHaveLength(0);
  });

  test('supports editing and deleting saved searches and marking notifications as read', async () => {
    const user = await createStudent('Isha', 'isha.saved@campus.edu', 'secret123');

    const created = await request(app)
      .post('/api/saved-searches')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Textbooks', filters: { category: 'Textbooks', maxPrice: 1500 } });

    const savedSearchId = created.body.savedSearch.id;

    const updated = await request(app)
      .put(`/api/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Textbooks under ₹1200', filters: { category: 'Textbooks', maxPrice: 1200 } });

    expect(updated.status).toBe(200);
    expect(updated.body.savedSearch.filters.maxPrice).toBe(1200);

    createNotification({
      userId: user.user.id,
      type: 'TEST_NOTIFICATION',
      message: 'A test notification for saved search read tracking.',
      dedupeKey: `saved-search-test:${user.user.id}`,
    });

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`);

    expect(notifications.status).toBe(200);
    expect(notifications.body.notifications.length).toBeGreaterThan(0);

    const firstNotificationId = notifications.body.notifications[0]?.id;
    expect(firstNotificationId).toBeDefined();

    const marked = await request(app)
      .patch(`/api/notifications/${firstNotificationId}/read`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(marked.status).toBe(200);
    expect(marked.body.notification.read).toBe(true);

    const removed = await request(app)
      .delete(`/api/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(removed.status).toBe(200);
  });
});
