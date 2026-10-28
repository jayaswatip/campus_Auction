const express = require('express');
const { authMiddleware } = require('../utils');
const { getSavedSearchesForUser, createSavedSearch, getSavedSearchById, updateSavedSearch, deleteSavedSearch } = require('../store');
const { validateSavedSearchFilters } = require('../services/savedSearchService');

const router = express.Router();

const ensureOwner = (userId, savedSearch) => {
  if (!savedSearch) {
    const error = new Error('Saved search not found.');
    error.statusCode = 404;
    throw error;
  }

  if (savedSearch.userId !== userId) {
    const error = new Error('You can only manage your own saved searches.');
    error.statusCode = 403;
    throw error;
  }
};

router.get('/', authMiddleware, (req, res) => {
  const savedSearches = getSavedSearchesForUser(req.user.id);
  return res.json({ savedSearches });
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const payload = req.body || {};
    const name = String(payload.name || 'Saved search').trim() || 'Saved search';
    const filters = validateSavedSearchFilters(payload.filters || payload);

    if (!filters.query && !filters.category && !filters.condition && filters.minPrice === null && filters.maxPrice === null && !filters.closingSoon) {
      const error = new Error('Saved search requires at least one filter such as a keyword, category, condition, or price.');
      error.statusCode = 400;
      throw error;
    }

    const savedSearch = createSavedSearch({
      userId: req.user.id,
      name,
      filters,
    });

    return res.status(201).json({ savedSearch });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Saved search could not be created.' });
  }
});

router.put('/:id', authMiddleware, (req, res) => {
  try {
    const savedSearch = getSavedSearchById(req.params.id);
    ensureOwner(req.user.id, savedSearch);

    const payload = req.body || {};
    const nextFilters = validateSavedSearchFilters({
      ...(savedSearch.filters || {}),
      ...(payload.filters || payload),
    });

    const updated = updateSavedSearch(savedSearch.id, {
      name: payload.name ? String(payload.name).trim() || savedSearch.name : savedSearch.name,
      filters: nextFilters,
    });

    return res.json({ savedSearch: updated });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Saved search could not be updated.' });
  }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const savedSearch = getSavedSearchById(req.params.id);
    ensureOwner(req.user.id, savedSearch);

    const deleted = deleteSavedSearch(savedSearch.id);
    return res.json({ savedSearch: deleted, message: 'Saved search deleted.' });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Saved search could not be deleted.' });
  }
});

module.exports = router;
