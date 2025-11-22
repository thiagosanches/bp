const logger = require('../utils/logger');
const ADBWrapper = require('../adb-wrapper');
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
            await adb.wait(5000);

            await adb.forceStop('com.mercadolibre');
            await adb.wait(5000);

            logger.info('Opening MercadoLivre URL...', item);
            await adb.openUrl(item);
            await adb.wait(20000);

            // Close any popup/modal
            await adb.tap(540, 100);
            await adb.wait(5000);

            // Try to select 127V or 127/220V voltage if available
            logger.info('Checking for voltage option (127V/127-220V)...');
            let voltageOption = await adb.findElementByText('127/220', { caseInsensitive: true });

            if (!voltageOption) {
                voltageOption = await adb.findElementByText('127', { caseInsensitive: true });
            }

            if (voltageOption) {
                await adb.tap(540, 100);
                logger.info(`Found voltage option at (${voltageOption.bounds.centerX}, ${voltageOption.bounds.centerY})`);
                await adb.tap(voltageOption.bounds.centerX, voltageOption.bounds.centerY);
                await adb.wait(2000);
            } else {
                logger.info('No voltage selection needed or found');
            }

            // Find and scroll to the Buy button using UI automation
            logger.info('Looking for Buy button...');
            const buyButton = await adb.scrollToElement('Comprar agora', {
                maxAttempts: 5,
                scrollDuration: 1000
            });

            if (!buyButton) {
                logger.error('Could not find Buy button after scrolling');
                throw new Error('Buy button not found');
            }

            logger.info(`Found Buy button at (${buyButton.bounds.centerX}, ${buyButton.bounds.centerY})`);
            await adb.wait(2000);

            logger.info('Tapping Buy Now button...');
            await adb.tap(buyButton.bounds.centerX, buyButton.bounds.centerY);
            await adb.wait(11000);

            // Check for insurance option
            logger.info('Checking for insurance option ...');
            const insuranceOption = await adb.findElementByText('12 meses de garantia estendida', { caseInsensitive: true });

            if (insuranceOption) {
                logger.info(`Found insurance option at (${insuranceOption.bounds.centerX}, ${insuranceOption.bounds.centerY})`);
                await adb.tap(insuranceOption.bounds.centerX, insuranceOption.bounds.centerY);
                await adb.wait(2000);
                const insuranceButton = await adb.findElementByText('Adicionar', { caseInsensitive: true });
                logger.info(`Tapping Add Insurance button at (${insuranceButton.bounds.centerX}, ${insuranceButton.bounds.centerY})`);
                await adb.tap(insuranceButton.bounds.centerX, insuranceButton.bounds.centerY);
                await adb.wait(2000);
            } else {
                logger.info('No insurance option found');
            }

            logger.info('Tapping Address Selection...');
            await adb.tap(540, 550);
            await adb.wait(11000);

            logger.info('Tapping Continue button...');
            await adb.tap(540, 2050);
            await adb.wait(11000);

            logger.info('Tapping Credit Card Selection...');
            await adb.tap(540, 1080);
            await adb.wait(11000);

            logger.info('Tapping 1x Installment option...');
            await adb.tap(540, 640);
            await adb.wait(11000);

            logger.info('Tapping Confirm Purchase button...');
            await adb.tap(540, 850);
            await adb.wait(8000);
            await adb.takeScreenshot(`mercadolivre-item-${DateTime.now().toMillis()}.png`);
            logger.info('Item purchase process completed on MercadoLivre');
            return true;
        }
        catch (error) {
            logger.error(`Failed to buy item: ${error.message}`);
            return false;
        }

    }
}

module.exports = MercadoLivreHandler;
