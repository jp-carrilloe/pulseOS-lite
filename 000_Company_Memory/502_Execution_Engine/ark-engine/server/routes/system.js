const express = require('express');
const router = express.Router();

/**
 * Basic health check endpoint
 */
router.get('/api/system/health', (req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

module.exports = router;
