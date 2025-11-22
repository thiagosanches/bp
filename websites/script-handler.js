const logger = require('../utils/logger');
const ScriptParser = require('../script-parser');
const ScriptManager = require('../script-manager');
const ADBWrapper = require('../adb-wrapper');

/**
 * Generic script-based website handler
 * Executes automation scripts for any domain
 */
class ScriptHandler {
    /**
     * Create a script handler
     * @param {string} domain - The domain this handler is for
     */
    constructor(domain) {
        this.domain = domain;
        this.scriptManager = new ScriptManager();
        logger.info(`Script handler created for domain: ${domain}`);
    }

    /**
     * Execute automation for an item using stored script
     * @param {string} itemUrl - The URL of the item
     * @returns {Promise<boolean>} Success status
     */
    async buyItem(itemUrl) {
        logger.info(`Attempting to execute script for ${this.domain} with URL: ${itemUrl}`);
        
        try {
            // Load script for this domain
            const script = await this.scriptManager.loadScript(this.domain);
            
            if (!script) {
                logger.error(`No script found for domain: ${this.domain}`);
                throw new Error(`No automation script configured for ${this.domain}`);
            }
            
            // Initialize ADB
            const adb = new ADBWrapper();
            await adb.autoConnect();
            await adb.wait(5000);
            
            // Create parser with variables
            const parser = new ScriptParser(adb, {
                PRODUCT_URL: itemUrl,
                DOMAIN: this.domain
            });
            
            // Execute script
            await parser.execute(script);
            
            logger.info(`Script execution completed for ${this.domain}`);
            return true;
            
        } catch (error) {
            logger.error(`Script execution failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate the script for this domain
     * @returns {Promise<Object>} Validation result
     */
    async validateScript() {
        const script = await this.scriptManager.loadScript(this.domain);
        
        if (!script) {
            return {
                valid: false,
                errors: ['No script found for this domain']
            };
        }
        
        const parser = new ScriptParser();
        return parser.validate(script);
    }
}

module.exports = ScriptHandler;
