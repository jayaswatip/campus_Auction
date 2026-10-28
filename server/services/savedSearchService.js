const normalizeText = (value = '') => String(value || '').trim();

const getStore = () => require('../store');

const matchesSavedSearch = (listing, savedSearch) => {
  if (!listing || !savedSearch) return false;
  if (listing.status !== 'ACTIVE') return false;

  const filters = savedSearch.filters || {};
  const currentPrice = Number(listing.currentBid || listing.startingPrice || 0);

  if (filters.category && listing.category !== filters.category) return false;
  if (filters.condition && listing.condition !== filters.condition) return false;
  if (filters.minPrice !== null && filters.minPrice !== undefined && currentPrice < Number(filters.minPrice)) return false;
  if (filters.maxPrice !== null && filters.maxPrice !== undefined && currentPrice > Number(filters.maxPrice)) return false;

  if (filters.query) {
    const query = String(filters.query).toLowerCase();
    const haystack = `${listing.title || ''} ${listing.description || ''} ${listing.category || ''} ${listing.condition || ''}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (filters.closingSoon === true) {
    const remainingMs = new Date(listing.closingAt).getTime() - Date.now();
    if (remainingMs <= 0 || remainingMs > 60 * 60 * 1000) return false;
  }

  return true;
};

const notifyMatchingSavedSearchesForListing = (listing) => {
  if (!listing) return [];

  const store = getStore();
  const dispatch = (savedSearch) => store.createNotification({
    userId: savedSearch.userId,
    type: 'NEW_MATCHING_LISTING',
    message: `A new listing matched your saved search for "${savedSearch.name || 'saved search'}": ${listing.title}.`,
    relatedListingId: listing.id,
    relatedUserId: listing.sellerId,
    dedupeKey: `saved-search:${savedSearch.id}:${listing.id}`,
  });

  if (!store.isDatabaseConnected()) {
    const notifications = [];
    for (const savedSearch of store.getAllSavedSearches()) {
      if (!matchesSavedSearch(listing, savedSearch) || savedSearch.userId === listing.sellerId) continue;
      const dedupeKey = `saved-search:${savedSearch.id}:${listing.id}`;
      if (store.state.notifications.some((notification) => notification.dedupeKey === dedupeKey)) continue;
      const notification = dispatch(savedSearch);
      if (notification) notifications.push(notification);
    }
    return notifications;
  }

  return store.getAllSavedSearches().then(async (savedSearches) => {
    const notifications = [];
    for (const savedSearch of savedSearches) {
      if (!matchesSavedSearch(listing, savedSearch) || savedSearch.userId === listing.sellerId) continue;
      const notification = await dispatch(savedSearch);
      if (notification) notifications.push(notification);
    }
    return notifications;
  });
};

const buildSavedSearchFilters = (payload = {}) => ({
  query: normalizeText(payload.query),
  category: payload.category || null,
  condition: payload.condition || null,
  minPrice: payload.minPrice !== undefined && payload.minPrice !== null && payload.minPrice !== '' ? Number(payload.minPrice) : null,
  maxPrice: payload.maxPrice !== undefined && payload.maxPrice !== null && payload.maxPrice !== '' ? Number(payload.maxPrice) : null,
  closingSoon: Boolean(payload.closingSoon),
});

const validateSavedSearchFilters = (filters = {}) => {
  const next = buildSavedSearchFilters(filters);
  if (next.minPrice !== null && next.minPrice < 0) {
    const error = new Error('Minimum price cannot be negative.');
    error.statusCode = 400;
    throw error;
  }

  if (next.maxPrice !== null && next.maxPrice <= 0) {
    const error = new Error('Maximum price must be positive.');
    error.statusCode = 400;
    throw error;
  }

  if (next.minPrice !== null && next.maxPrice !== null && next.minPrice > next.maxPrice) {
    const error = new Error('Minimum price cannot be greater than maximum price.');
    error.statusCode = 400;
    throw error;
  }

  return next;
};

module.exports = {
  matchesSavedSearch,
  notifyMatchingSavedSearchesForListing,
  buildSavedSearchFilters,
  validateSavedSearchFilters,
};
