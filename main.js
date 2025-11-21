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

logger.info('Starting main application...');

(async () => {
    try {
        logger.info('BP application initializing...');

        app.get('/buy/:item', async function (req, res) {
            const item = req.params.item;
            const domain = new URL(item).hostname;
            const url = domain.includes('.') ? `https://${domain}` : `https://${domain}.com`;

            logger.info(`Buying item: ${item} on domain: ${domain}`);
            logger.info(`Navigating to domain: ${domain} (URL: ${url})`);

            try {
                const page = await currentContext.newPage();

                res.json({
                    success: true,
                    message: `Purchase process initiated for ${item} on ${domain}`,
                    hasHandler: WebsiteFactory.hasHandler(domain)
                });

                await page.goto(item);
                const handler = WebsiteFactory.getHandler(domain, page);

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
