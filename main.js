require('dotenv').config();

const bodyParser = require('body-parser');
const express = require('express');
const logger = require('./utils/logger');

/* Import the website factory */
const WebsiteFactory = require('./websites/index');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));
const port = 3000;

// In-memory storage for URLs and timers
let urls = [];
let activeTimers = {};

logger.info('Starting main application...');

(async () => {
    try {
        logger.info('BP application initializing...');

        // Helper function to trigger purchase
        async function triggerPurchase(index) {
            if (!urls[index]) {
                logger.warn(`No URL found at index ${index}`);
                return;
            }

            const item = urls[index];
            const url = item.url;

            logger.info(`Triggering purchase for: ${url}`);

            try {
                const domain = new URL(url).hostname;
                const handler = WebsiteFactory.getHandler(domain);

                if (handler) {
                    logger.info(`Using ${domain} handler to buy ${url}`);
                    const success = await handler.buyItem(url);

                    if (success) {
                        logger.info(`Successfully processed purchase for ${url}`);
                        urls[index].status = 'purchased';
                    } else {
                        logger.warn(`Could not complete purchase for ${url}`);
                        urls[index].status = 'failed';
                    }
                } else {
                    logger.warn(`No handler available for ${domain}`);
                    urls[index].status = 'no-handler';
                }
            } catch (error) {
                logger.error(`Error in purchase process for ${url}: ${error.message}`);
                urls[index].status = 'error';
            }
        }

        // Schedule auto-purchase with timer
        function scheduleAutoPurchase(index, delayMs) {
            if (activeTimers[index]) {
                clearTimeout(activeTimers[index]);
            }

            logger.info(`Scheduling purchase for URL index ${index} in ${Math.ceil(delayMs / 60000)} minutes`);

            activeTimers[index] = setTimeout(async () => {
                await triggerPurchase(index);
                delete activeTimers[index];
            }, delayMs);
        }

        app.get('/config', function (req, res) {
            res.json({
                autoBuyEnabled: process.env.AUTO_BUY_ENABLED === 'true',
                autoBuyMinDelay: parseInt(process.env.AUTO_BUY_MIN_DELAY) || 3,
                autoBuyMaxDelay: parseInt(process.env.AUTO_BUY_MAX_DELAY) || 11
            });
        });

        // Get all URLs
        app.get('/urls', function (req, res) {
            res.json(urls);
        });

        // Add new URL
        app.post('/urls', function (req, res) {
            const { url } = req.body;

            if (!url) {
                return res.status(400).json({ success: false, message: 'URL is required' });
            }

            try {
                new URL(url); // Validate URL format

                // Check if URL already exists in the list
                const existingIndex = urls.findIndex(item => item.url === url);
                if (existingIndex !== -1) {
                    return res.json({
                        success: true,
                        message: 'URL already in list',
                        item: urls[existingIndex],
                        index: existingIndex
                    });
                }

                const autoBuyEnabled = process.env.AUTO_BUY_ENABLED === 'true';
                const minDelay = parseInt(process.env.AUTO_BUY_MIN_DELAY) || 3;
                const maxDelay = parseInt(process.env.AUTO_BUY_MAX_DELAY) || 11;

                let item, delayMs, randomMinutes;

                if (autoBuyEnabled) {
                    const range = maxDelay - minDelay;
                    randomMinutes = Math.floor(Math.random() * (range + 1)) + minDelay;
                    delayMs = randomMinutes * 60 * 1000;

                    item = {
                        url: url,
                        triggerTime: Date.now() + delayMs,
                        delayMinutes: randomMinutes,
                        status: 'pending',
                        addedAt: new Date().toISOString()
                    };
                } else {
                    item = {
                        url: url,
                        triggerTime: null,
                        delayMinutes: null,
                        status: 'ready',
                        addedAt: new Date().toISOString()
                    };
                }

                const index = urls.length;
                urls.push(item);

                if (autoBuyEnabled) {
                    scheduleAutoPurchase(index, delayMs);
                    logger.info(`URL added with timer: ${url}`);
                    res.json({
                        success: true,
                        message: 'URL added successfully',
                        item: item,
                        index: index
                    });
                } else {
                    logger.info(`URL added without timer: ${url}`);
                    res.json({
                        success: true,
                        message: 'URL added successfully',
                        item: item,
                        index: index
                    });
                }
            } catch (e) {
                res.status(400).json({ success: false, message: 'Invalid URL format' });
            }
        });

        // Delete URL
        app.delete('/urls/:index', function (req, res) {
            const index = parseInt(req.params.index);

            if (index < 0 || index >= urls.length) {
                return res.status(404).json({ success: false, message: 'URL not found' });
            }

            // Cancel timer if exists
            if (activeTimers[index]) {
                clearTimeout(activeTimers[index]);
                delete activeTimers[index];
            }

            urls.splice(index, 1);
            res.json({ success: true, message: 'URL removed' });
        });

        // Manually trigger purchase
        app.post('/urls/:index/buy', async function (req, res) {
            const index = parseInt(req.params.index);

            if (index < 0 || index >= urls.length) {
                return res.status(404).json({ success: false, message: 'URL not found' });
            }

            // Cancel timer if exists
            if (activeTimers[index]) {
                clearTimeout(activeTimers[index]);
                delete activeTimers[index];
            }

            res.json({ success: true, message: 'Purchase initiated' });

            // Trigger purchase in background
            triggerPurchase(index);
        });

        app.get('/buy/:item', async function (req, res) {
            const item = req.params.item;
            const domain = new URL(item).hostname;
            const url = domain.includes('.') ? `https://${domain}` : `https://${domain}.com`;

            logger.info(`Buying item: ${item} on domain: ${domain}`);
            logger.info(`Navigating to domain: ${domain} (URL: ${url})`);

            try {
                res.json({
                    success: true,
                    message: `Purchase process initiated for ${item} on ${domain}`,
                    hasHandler: WebsiteFactory.hasHandler(domain)
                });

                const handler = WebsiteFactory.getHandler(domain);

                if (handler) {
                    logger.info(`Using ${domain} handler to buy ${item}`);
                    handler.buyItem(item).then(success => {
                        if (success) {
                            logger.info(`Successfully processed purchase for ${item} on ${domain}`);
                        } else {
                            logger.warn(`Could not complete purchase for ${item} on ${domain}`);
                        }
                    }).catch(error => {
                        logger.error(`Error in purchase process: ${error.message}`);
                    });
                } else {
                    logger.warn(`No handler available for ${domain}, manual interaction required`);
                }

            } catch (error) {
                logger.error(`Error processing buy request: ${error.message}`);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: `Error initiating purchase: ${error.message}`
                    });
                }
            }
        });

        app.listen(port, () => {
            logger.info(`Server listening on port ${port}`);
        });
    } catch (error) {
        logger.error('Error starting application:', error);
    }
})();
