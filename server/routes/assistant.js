const express = require('express');
const { authMiddleware } = require('../utils');
const { createAssistantSearchResult, getAiProviderAvailability, executeAiBid } = require('../services/aiAssistantService');

const router = express.Router();

router.get('/status', (req, res) => {
  return res.json(getAiProviderAvailability());
});

router.post('/search', async (req, res) => {
  try {
    const query = req.body?.query || '';
    const result = await createAssistantSearchResult({ query });
    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'Assistant search failed.' });
  }
});

router.post('/bid', authMiddleware, async (req, res) => {
  try {
    const { listingId, proposedAmount, budgetLimit, confirmed = false } = req.body || {};
    const result = await executeAiBid({
      listingId,
      buyerId: req.user.id,
      proposedAmount,
      budgetLimit,
      confirmed,
    });

    return res.status(201).json({
      ...result,
      providerAvailable: Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
      fallbackUsed: !Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || 'AI-assisted bidding failed.' });
  }
});

module.exports = router;
