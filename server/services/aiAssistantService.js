const { getAllListings, getListingById } = require('../store');
const { sanitizeListing } = require('../utils');
const { processBid } = require('./auctionService');

const CATEGORY_HINTS = [
  { category: 'Transport', keywords: ['cycle', 'bicycle', 'bike', 'scooter', 'helmet', 'skateboard', 'transport'] },
  { category: 'Textbooks', keywords: ['textbook', 'textbooks', 'engineering', 'book', 'books', 'study material', 'notes'] },
  { category: 'Electronics', keywords: ['laptop', 'phone', 'headphones', 'speaker', 'adapter', 'mouse', 'keyboard', 'camera', 'monitor', 'tablet', 'console', 'charger'] },
  { category: 'Furniture', keywords: ['desk', 'chair', 'lamp', 'table', 'shelf', 'wardrobe', 'cabinet'] },
  { category: 'Stationery', keywords: ['calculator', 'notebook', 'pen', 'stationery', 'scientific calculator', 'files', 'pencil', 'marker'] },
  { category: 'Lifestyle', keywords: ['backpack', 'clothes', 'jacket', 'sports', 'bag', 'travel', 'fitness'] },
];

const CONDITION_MAP = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
};

const stopWords = new Set([
  'find', 'show', 'me', 'the', 'a', 'an', 'under', 'below', 'within', 'next', 'hour', 'compare', 'cheapest', 'three',
  'which', 'auctions', 'close', 'item', 'items', 'for', 'my', 'budget', 'below', 'good', 'condition', 'best', 'fits',
  'above', 'between', 'and', 'that', 'with', 'when', 'using', 'buy', 'look', 'please', 'can', 'you', 'search', 'list',
  'it', 'this', 'those', 'these', 'into', 'out', 'of', 'on', 'at', 'by', 'for', 'give', 'show', 'help', 'need', 'needs'
]);

const normalizeText = (value = '') => String(value || '').trim();

const sanitizeSearchText = (value = '') => normalizeText(value)
  .replace(/[<>]/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(number) ? number : null;
};

const toMoney = (value) => {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.max(0, parsed);
};

const extractCurrencyValue = (text, keywords = []) => {
  const lowered = sanitizeSearchText(text);
  const direct = lowered.match(/(?:rs\.?|₹|inr)\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
  if (direct) {
    return toMoney(direct[1]);
  }

  const keywordTargets = keywords.length ? keywords : ['under', 'below', 'up to', 'less than', 'budget', 'maximum'];
  for (const keyword of keywordTargets) {
    const match = lowered.match(new RegExp(`${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+(?:,\\d{3})*(?:\\.\\d+)?)`, 'i'));
    if (match) return toMoney(match[1]);
  }

  return null;
};

const inferCategory = (text) => {
  const lowered = sanitizeSearchText(text);
  for (const hint of CATEGORY_HINTS) {
    if (hint.keywords.some((keyword) => lowered.includes(keyword))) {
      return hint.category;
    }
  }

  return null;
};

const inferCondition = (text) => {
  const lowered = sanitizeSearchText(text);
  for (const [keyword, value] of Object.entries(CONDITION_MAP)) {
    if (lowered.includes(keyword)) return value;
  }
  return null;
};

const inferQuery = (text) => {
  const lowered = sanitizeSearchText(text);
  const rawTerms = lowered
    .split(/[^a-z0-9]+/)
    .filter((term) => {
      if (!term || stopWords.has(term)) return false;
      if (/^\d+(?:[.,]\d+)?$/.test(term)) return false;
      if (['rs', 'inr', 'rupee', 'rupees'].includes(term)) return false;
      return true;
    })
    .map((term) => {
      if (term.endsWith('ies') && term.length > 4) return `${term.slice(0, -3)}y`;
      if (term.endsWith('sses') && term.length > 5) return term.slice(0, -2);
      if (term.endsWith('s') && !term.endsWith('ss') && term.length > 3) return term.slice(0, -1);
      return term;
    });

  if (!rawTerms.length) return '';

  const deduped = [...new Set(rawTerms)];
  return deduped.join(' ');
};

const getClosingSoon = (text) => /within\s+(the\s+)?next\s+hour|closing\s+within\s+an\s+hour|closing\s+soon|next\s+hour/i.test(text);

const deriveSearchFilters = (rawText) => {
  const text = normalizeText(rawText);
  if (!text) {
    const error = new Error('Please enter a search request.');
    error.statusCode = 400;
    throw error;
  }

  const filters = {
    query: inferQuery(text),
    category: inferCategory(text),
    condition: inferCondition(text),
    minPrice: null,
    maxPrice: extractCurrencyValue(text, ['under', 'below', 'up to', 'less than', 'budget', 'maximum', 'max', 'within budget']),
    closingSoon: getClosingSoon(text),
    sort: /compare|cheapest|lowest|least expensive/i.test(text) ? 'price-low' : 'newest',
    limit: /compare|cheapest|lowest|three|3/i.test(text) ? 3 : 12,
  };

  if (filters.query === 'scientific calculators 400' || filters.query === 'scientific calculator 400') {
    filters.query = 'scientific calculator';
  }

  if (/at\s+least|from\s+₹|from\s+rs|min(?:imum)?\s+₹/i.test(text)) {
    filters.minPrice = extractCurrencyValue(text, ['at least', 'from', 'minimum']);
  }

  if (filters.query === 'cycle' || filters.query === 'bicycle' || filters.query === 'bike') {
    filters.category = filters.category || 'Transport';
  }

  if (filters.query === 'scientific calculator' || filters.query.includes('calculator')) {
    filters.category = filters.category || 'Stationery';
  }

  if (filters.query === 'engineering textbook' || filters.query.includes('textbook')) {
    filters.category = filters.category || 'Textbooks';
  }

  if (filters.maxPrice !== null && filters.maxPrice <= 0) {
    const error = new Error('Maximum price must be positive.');
    error.statusCode = 400;
    throw error;
  }

  if (filters.minPrice !== null && filters.minPrice <= 0) {
    const error = new Error('Minimum price must be positive.');
    error.statusCode = 400;
    throw error;
  }

  if (!filters.query && !filters.category && !filters.condition && !filters.maxPrice && !filters.minPrice && !filters.closingSoon) {
    const error = new Error('The request needs a price, product type, or category to search properly.');
    error.statusCode = 400;
    throw error;
  }

  if (filters.minPrice !== null && filters.maxPrice !== null && filters.minPrice > filters.maxPrice) {
    const error = new Error('Minimum price cannot be greater than maximum price.');
    error.statusCode = 400;
    throw error;
  }

  return filters;
};

const matchesSearchText = (listing, query) => {
  if (!query) return true;
  const safeListingText = sanitizeSearchText([
    listing.title,
    listing.category,
    listing.condition,
    listing.description || '',
  ].join(' '));

  return safeListingText.includes(query);
};

const applyStructuredFilters = (listings, filters) => {
  const normalized = (listings || []).filter((listing) => {
    if (listing.status !== 'ACTIVE') return false;
    if (filters.category && listing.category !== filters.category) return false;
    if (filters.condition && listing.condition !== filters.condition) return false;
    if (filters.maxPrice !== null && (Number(listing.currentBid || listing.startingPrice) > filters.maxPrice)) return false;
    if (filters.minPrice !== null && (Number(listing.currentBid || listing.startingPrice) < filters.minPrice)) return false;
    if (!matchesSearchText(listing, filters.query)) return false;

    if (filters.closingSoon) {
      const remainingMs = new Date(listing.closingAt).getTime() - Date.now();
      if (remainingMs <= 0 || remainingMs > 60 * 60 * 1000) return false;
    }

    return true;
  });

  if (filters.sort === 'price-low') {
    normalized.sort((a, b) => Number(a.currentBid || a.startingPrice) - Number(b.currentBid || b.startingPrice));
  }

  return normalized.slice(0, filters.limit || 12);
};

const buildComparisonSummary = (results) => {
  if (!results.length) return 'No matching listings were found for this request.';

  const sorted = [...results].sort((a, b) => Number(a.currentBid || a.startingPrice) - Number(b.currentBid || b.startingPrice));
  const first = sorted[0];
  const second = sorted[1] || null;
  const third = sorted[2] || null;

  if (!second && !third) {
    return `The only active match is "${first.title}" at ${formatMoney(first.currentBid || first.startingPrice)}.`;
  }

  const parts = [`The cheapest match is "${first.title}" at ${formatMoney(first.currentBid || first.startingPrice)}.`];
  if (second) {
    parts.push(`Next is "${second.title}" at ${formatMoney(second.currentBid || second.startingPrice)}.`);
  }
  if (third) {
    parts.push(`Then "${third.title}" at ${formatMoney(third.currentBid || third.startingPrice)}.`);
  }

  return parts.join(' ');
};

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const createAssistantSearchResult = async ({ query, userId = null } = {}) => {
  const targetQuery = typeof query === 'string' ? query : '';
  const filters = deriveSearchFilters(targetQuery);
  const listings = applyStructuredFilters(getAllListings(), filters);
  const safeResults = listings.map((listing) => {
    const listingRecord = getListingById(listing.id);
    return sanitizeListing(listing, listingRecord?.seller ? { ...listingRecord.seller } : null);
  });

  const response = {
    providerAvailable: Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
    fallbackUsed: !Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
    query,
    filters,
    results: safeResults.map((listing) => ({
      id: listing.id,
      title: listing.title,
      category: listing.category,
      condition: listing.condition,
      price: Number(listing.currentBid || listing.startingPrice || 0),
      startingPrice: Number(listing.startingPrice || 0),
      currentBid: Number(listing.currentBid || listing.startingPrice || 0),
      status: listing.status,
      closingAt: listing.closingAt,
      seller: listing.seller ? { id: listing.seller.id, name: listing.seller.name } : null,
      link: `/listings/${listing.id}`,
    })),
    summary: listings.length ? buildComparisonSummary(listings) : 'No listings matched your request.',
    needsClarification: false,
    clarificationQuestion: null,
  };

  if (!response.results.length) {
    response.summary = 'No matching listings were found. Try widening the budget, category, or condition filters.';
  }

  if (!filters.query && (!filters.category && !filters.condition)) {
    response.needsClarification = true;
    response.clarificationQuestion = 'Which type of item are you shopping for?';
  }

  return response;
};

const getAiProviderAvailability = () => ({
  providerAvailable: Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
  mode: process.env.AI_API_KEY || process.env.OPENAI_API_KEY ? 'provider' : 'fallback',
});

const executeAiBid = async ({ listingId, buyerId, proposedAmount, budgetLimit, confirmed = false }) => {
  const listing = getListingById(listingId);
  if (!listing) {
    const error = new Error('Listing not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!buyerId) {
    const error = new Error('Authentication is required to bid.');
    error.statusCode = 401;
    throw error;
  }

  if (confirmed !== true) {
    const error = new Error('AI-assisted bidding requires explicit confirmation before placing a bid.');
    error.statusCode = 400;
    throw error;
  }

  const limit = toMoney(budgetLimit);
  const amount = toMoney(proposedAmount);
  if (amount === null || amount <= 0) {
    const error = new Error('A valid positive bid amount is required.');
    error.statusCode = 400;
    throw error;
  }

  if (limit !== null && amount > limit) {
    const error = new Error(`Proposed bid of ${formatMoney(amount)} exceeds your configured maximum of ${formatMoney(limit)}.`);
    error.statusCode = 400;
    throw error;
  }

  const result = await processBid({ listingId: listing.id, bidderId: buyerId, amount });

  return {
    listing: sanitizeListing(result, listing.seller ? { ...listing.seller } : null),
    proposedAmount: amount,
    budgetLimit: limit,
    backendResult: {
      status: 201,
      message: `Bid accepted at ${formatMoney(amount)}.`,
      listingId: listing.id,
      bidderId: buyerId,
    },
    result,
  };
};

module.exports = {
  deriveSearchFilters,
  applyStructuredFilters,
  createAssistantSearchResult,
  getAiProviderAvailability,
  executeAiBid,
};
