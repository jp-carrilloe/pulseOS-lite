const express = require('express');
const router = express.Router();
const config = require('../config');

/**
 * Get internal system and integration statuses
 */
router.get('/api/system/status', (req, res) => {
    res.json({
        openai: !!config.openaiApiKey,
        apollo: !!config.apolloApiKey,
        attio: !!config.attioApiKey,
        perplexity: !!config.perplexityApiKey,
        exa: !!config.exaApiKey,
        clickup: !!config.clickupToken
    });
});

module.exports = router;
