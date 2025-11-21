const logger = require('../utils/logger');
const ADBWrapper = require('./adb-wrapper');
const { DateTime } = require('luxon');

/**
 * MercadoLivre website handler
 */
class MercadoLivreHandler {
    /**
     * Create a new MercadoLivre handler
     * @param {object} page - The Playwright page object
     */
    constructor(page) {
        this.page = page;
        this.domain = 'www.mercadolivre.com.br';
        logger.info('MercadoLivre handler created');
    }

    /**
     * Buy an item on MercadoLivre
     * @param {string} item - The item to buy
     */
    async buyItem(item) {
        logger.info(`Attempting to buy item: ${item} on MercadoLivre`);
        const adb = new ADBWrapper();

        try {
            await adb.autoConnect();
            logger.info('🌐 Opening MercadoLivre URL...', item);
            await adb.openUrl(item);
            await adb.wait(5000);

            await adb.tap(1, 1);
            await adb.swipe(500, 1000, 500, 200, 300);
            await adb.wait(5000);

            await adb.tap(500, 1011);
            await adb.wait(5000);

            await adb.tap(500, 550);
            await adb.wait(5000);

            await adb.tap(500, 2050);
            await adb.wait(8000);

            await adb.tap(500, 1080);
            await adb.wait(3000);

            await adb.tap(500, 640);
            await adb.wait(3000);

            await adb.tap(500, 850);
            await adb.wait(8000);
            await adb.takeScreenshot(`mercadolivre-item-${DateTime.now().toMillis()}.png`);
            logger.info('Item purchase process completed on MercadoLivre');
        }
        catch (error) {
            logger.error(`Failed to buy item: ${error.message}`);
        }

    }
}

module.exports = MercadoLivreHandler;
