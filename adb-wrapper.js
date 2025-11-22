// adb-wrapper.js
const { exec } = require('child_process');
const { promisify } = require('util');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

/**
 * Custom error class for ADB-specific errors
 */
class ADBError extends Error {
    constructor(message, command, originalError) {
        super(message);
        this.name = 'ADBError';
        this.command = command;
        this.originalError = originalError;
    }
}

/**
 * Validates that a value is a positive number
 */
function validatePositiveNumber(value, name) {
    if (typeof value !== 'number' || value < 0 || !isFinite(value)) {
        throw new Error(`${name} must be a positive number`);
    }
}

/**
 * Validates coordinate values
 */
function validateCoordinate(x, y) {
    validatePositiveNumber(x, 'x coordinate');
    validatePositiveNumber(y, 'y coordinate');
}

/**
 * Sanitizes shell command arguments to prevent injection
 */
function sanitizeShellArg(arg) {
    if (typeof arg !== 'string') {
        throw new Error('Argument must be a string');
    }
    // Escape single quotes by replacing them with '\'' and wrap in single quotes
    return `'${arg.replace(/'/g, "'\\''")}';`;
}

/**
 * Validates package name format
 */
function validatePackageName(packageName) {
    if (typeof packageName !== 'string' || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/i.test(packageName)) {
        throw new Error('Invalid package name format');
    }
}

/**
 * ADB Wrapper class for Android Debug Bridge operations
 * @extends EventEmitter
 * @fires ADBWrapper#command_executed
 * @fires ADBWrapper#warning
 * @fires ADBWrapper#error
 * @fires ADBWrapper#connected
 */
class ADBWrapper extends EventEmitter {
    /**
     * Creates an ADB wrapper instance
     * @param {string|null} deviceId - Optional device ID to target
     * @param {Object} options - Configuration options
     * @param {number} options.timeout - Command timeout in milliseconds (default: 30000)
     * @param {string} options.screenshotDir - Directory for screenshots (default: './screenshots')
     */
    constructor(deviceId = null, options = {}) {
        super();
        this.deviceId = deviceId;
        this.screenSize = null;
        this.timeout = options.timeout || 30000;
        this.screenshotDir = options.screenshotDir || './screenshots';
    }

    /**
     * Executes an ADB command
     * @param {string} command - The ADB command to execute
     * @returns {Promise<string>} Command output
     * @throws {ADBError}
     */
    async executeCommand(command) {
        try {
            const fullCommand = this.deviceId ?
                `adb -s ${this.deviceId} ${command}` :
                `adb ${command}`;

            this.emit('command_executed', { command: fullCommand });

            const { stdout, stderr } = await execAsync(fullCommand, {
                timeout: this.timeout,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
            });

            if (stderr && !stderr.includes('WARNING')) {
                this.emit('warning', stderr);
            }

            return stdout.trim();
        } catch (error) {
            const adbError = new ADBError(
                `Failed to execute ADB command: ${error.message}`,
                command,
                error
            );
            this.emit('error', adbError);
            throw adbError;
        }
    }

    /**
     * Executes a shell command on the device
     * @param {string} command - The shell command to execute
     * @returns {Promise<string>} Command output
     */
    async executeShell(command) {
        // Use safer single-quote escaping
        const sanitized = sanitizeShellArg(command);
        return this.executeCommand(`shell ${sanitized}`);
    }

    // Device management
    /**
     * Gets list of connected devices
     * @returns {Promise<Array<{id: string, status: string}>>} Array of device objects
     */
    async getDevices() {
        const output = await this.executeCommand('devices');
        const lines = output.split('\n').slice(1);

        return lines
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('\t').map(p => p.trim());
                return { id: parts[0], status: parts[1] || 'unknown' };
            });
    }

    /**
     * Gets device information
     * @returns {Promise<Object>} Device information object
     */
    async getDeviceInfo() {
        const [manufacturer, model, androidVersion, sdkVersion] = await Promise.all([
            this.executeShell('getprop ro.product.manufacturer').catch(() => 'unknown'),
            this.executeShell('getprop ro.product.model').catch(() => 'unknown'),
            this.executeShell('getprop ro.build.version.release').catch(() => 'unknown'),
            this.executeShell('getprop ro.build.version.sdk').catch(() => 'unknown')
        ]);

        return {
            manufacturer: manufacturer.trim(),
            model: model.trim(),
            androidVersion: androidVersion.trim(),
            sdkVersion: parseInt(sdkVersion) || 0,
            deviceId: this.deviceId
        };
    }

    /**
     * Automatically connects to the first available device
     * @returns {Promise<string>} The connected device ID
     * @throws {Error} If no devices are found or authorized
     */
    async autoConnect() {
        const devices = await this.getDevices();
        if (devices.length === 0) {
            throw new Error('No devices found');
        }

        const activeDevice = devices.find(d => d.status === 'device');
        if (activeDevice) {
            this.deviceId = activeDevice.id;
            this.emit('connected', this.deviceId);
            return this.deviceId;
        }

        throw new Error('No authorized devices found');
    }

    // Screen operations
    /**
     * Gets the device screen size
     * @param {boolean} refresh - Force refresh cached value
     * @returns {Promise<{width: number, height: number}>} Screen dimensions
     */
    async getScreenSize(refresh = false) {
        if (this.screenSize && !refresh) return this.screenSize;

        const output = await this.executeShell('wm size');
        const match = output.match(/(\d+)x(\d+)/);

        if (match) {
            this.screenSize = {
                width: parseInt(match[1]),
                height: parseInt(match[2])
            };
        } else {
            throw new Error('Failed to parse screen size');
        }

        return this.screenSize;
    }

    /**
     * Simulates a tap at the specified coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Promise<string>}
     */
    async tap(x, y) {
        validateCoordinate(x, y);
        return this.executeShell(`input tap ${Math.floor(x)} ${Math.floor(y)}`);
    }

    /**
     * Simulates a swipe gesture
     * @param {number} x1 - Start X coordinate
     * @param {number} y1 - Start Y coordinate
     * @param {number} x2 - End X coordinate
     * @param {number} y2 - End Y coordinate
     * @param {number} duration - Duration in milliseconds (default: 300)
     * @returns {Promise<string>}
     */
    async swipe(x1, y1, x2, y2, duration = 300) {
        validateCoordinate(x1, y1);
        validateCoordinate(x2, y2);
        validatePositiveNumber(duration, 'duration');

        const cmd = `input swipe ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(duration)}`;
        return this.executeShell(cmd);
    }

    /**
     * Scrolls down on the screen
     * @param {number} duration - Swipe duration in milliseconds (default: 400)
     * @returns {Promise<string>}
     */
    async scrollDown(duration = 400) {
        const screen = await this.getScreenSize();
        const startY = Math.floor(screen.height * 0.8);
        const endY = Math.floor(screen.height * 0.2);
        const centerX = Math.floor(screen.width / 2);

        return this.swipe(centerX, startY, centerX, endY, duration);
    }

    /**
     * Scrolls up on the screen
     * @param {number} duration - Swipe duration in milliseconds (default: 400)
     * @returns {Promise<string>}
     */
    async scrollUp(duration = 400) {
        const screen = await this.getScreenSize();
        const startY = Math.floor(screen.height * 0.2);
        const endY = Math.floor(screen.height * 0.8);
        const centerX = Math.floor(screen.width / 2);

        return this.swipe(centerX, startY, centerX, endY, duration);
    }

    // App management
    /**
     * Opens a URL in the default browser
     * @param {string} url - URL to open
     * @returns {Promise<string>}
     */
    async openUrl(url) {
        if (typeof url !== 'string' || !url.trim()) {
            throw new Error('URL must be a non-empty string');
        }
        return this.executeShell(`am start -a android.intent.action.VIEW -d ${sanitizeShellArg(url)}`);
    }

    /**
     * Force stops an application
     * @param {string} packageName - Package name to stop
     * @returns {Promise<string>}
     */
    async forceStop(packageName) {
        validatePackageName(packageName);
        return this.executeShell(`am force-stop ${packageName}`);
    }

    /**
     * Launches an application by package name
     * @param {string} packageName - Package name to launch
     * @returns {Promise<string>}
     */
    async launchApp(packageName) {
        validatePackageName(packageName);
        return this.executeShell(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
    }

    /**
     * Clears app data and cache
     * @param {string} packageName - Package name to clear
     * @returns {Promise<string>}
     */
    async clearAppData(packageName) {
        validatePackageName(packageName);
        return this.executeShell(`pm clear ${packageName}`);
    }

    /**
     * Gets the currently focused package name
     * @returns {Promise<string|null>} Current package name or null
     */
    async getCurrentPackage() {
        try {
            // More reliable approach using dumpsys activity
            const output = await this.executeShell('dumpsys activity activities | grep mResumedActivity');
            const match = output.match(/[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+/);
            return match ? match[0] : null;
        } catch (error) {
            // Fallback to window focus method
            try {
                const output = await this.executeShell('dumpsys window | grep mCurrentFocus');
                const match = output.match(/[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+/);
                return match ? match[0] : null;
            } catch {
                return null;
            }
        }
    }

    // Key events

    /**
     * Simulates pressing the back button
     * @returns {Promise<string>}
     */
    async arrowDown() {
        return this.executeShell('input keyevent KEYCODE_DPAD_DOWN');
    }

    /**
     * Simulates pressing the back button
     * @returns {Promise<string>}
     */
    async back() {
        return this.executeShell('input keyevent KEYCODE_BACK');
    }

    /**
     * Simulates pressing the home button
     * @returns {Promise<string>}
     */
    async home() {
        return this.executeShell('input keyevent KEYCODE_HOME');
    }

    /**
     * Simulates pressing the recent apps button
     * @returns {Promise<string>}
     */
    async recentApps() {
        return this.executeShell('input keyevent KEYCODE_APP_SWITCH');
    }

    /**
     * Simulates pressing the power button
     * @returns {Promise<string>}
     */
    async power() {
        return this.executeShell('input keyevent KEYCODE_POWER');
    }

    /**
     * Types text on the device
     * @param {string} text - Text to type (spaces will be converted to %s)
     * @returns {Promise<string>}
     */
    async typeText(text) {
        if (typeof text !== 'string') {
            throw new Error('Text must be a string');
        }
        // Replace spaces with %s for shell input
        const escapedText = text.replace(/ /g, '%s');
        return this.executeShell(`input text ${sanitizeShellArg(escapedText)}`);
    }

    /**
     * Waits for a specified duration
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise<void>}
     */
    async wait(ms) {
        validatePositiveNumber(ms, 'wait time');
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Screenshot and file operations
    /**
     * Takes a screenshot and saves it locally
     * @param {string} filename - Optional filename (default: screenshot_timestamp.png)
     * @param {boolean} cleanup - Whether to delete remote file after pulling (default: true)
     * @returns {Promise<string>} Local path to the screenshot
     */
    async takeScreenshot(filename = `screenshot_${Date.now()}.png`, cleanup = true) {
        // Ensure screenshot directory exists
        await fs.mkdir(this.screenshotDir, { recursive: true });

        const remotePath = `/sdcard/${filename}`;
        const localPath = path.join(this.screenshotDir, filename);

        try {
            await this.executeShell(`screencap -p ${remotePath}`);
            await this.executeCommand(`pull ${remotePath} ${localPath}`);

            // Clean up remote file
            if (cleanup) {
                await this.executeShell(`rm ${remotePath}`).catch(() => {
                    // Ignore errors if file doesn't exist
                });
            }

            return localPath;
        } catch (error) {
            throw new ADBError('Failed to take screenshot', 'screencap', error);
        }
    }

    /**
     * Pulls a file from the device
     * @param {string} remotePath - Path on the device
     * @param {string} localPath - Local destination path
     * @returns {Promise<string>} Local path
     */
    async pullFile(remotePath, localPath) {
        if (!remotePath || !localPath) {
            throw new Error('Both remotePath and localPath are required');
        }

        // Ensure directory exists
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await this.executeCommand(`pull ${sanitizeShellArg(remotePath)} ${sanitizeShellArg(localPath)}`);
        return localPath;
    }

    /**
     * Pushes a file to the device
     * @param {string} localPath - Local file path
     * @param {string} remotePath - Destination path on device
     * @returns {Promise<string>}
     */
    async pushFile(localPath, remotePath) {
        if (!localPath || !remotePath) {
            throw new Error('Both localPath and remotePath are required');
        }

        // Check if file exists
        await fs.access(localPath);
        return this.executeCommand(`push ${sanitizeShellArg(localPath)} ${sanitizeShellArg(remotePath)}`);
    }

    /**
     * Gets device battery information
     * @returns {Promise<Object>} Battery information
     */
    async getBatteryInfo() {
        const output = await this.executeShell('dumpsys battery');
        const level = output.match(/level: (\d+)/)?.[1];
        const status = output.match(/status: (\d+)/)?.[1];
        const health = output.match(/health: (\d+)/)?.[1];
        const temperature = output.match(/temperature: (\d+)/)?.[1];

        return {
            level: level ? parseInt(level) : null,
            status: status ? parseInt(status) : null,
            health: health ? parseInt(health) : null,
            temperature: temperature ? parseInt(temperature) / 10 : null // Convert to Celsius
        };
    }

    /**
     * Reboots the device
     * @returns {Promise<string>}
     */
    async reboot() {
        return this.executeCommand('reboot');
    }

    /**
     * Gets installed packages
     * @param {boolean} thirdPartyOnly - Only return third-party apps (default: false)
     * @returns {Promise<string[]>} Array of package names
     */
    async getInstalledPackages(thirdPartyOnly = false) {
        const flag = thirdPartyOnly ? '-3' : '';
        const output = await this.executeShell(`pm list packages ${flag}`);
        return output.split('\n')
            .filter(line => line.startsWith('package:'))
            .map(line => line.replace('package:', '').trim())
            .filter(Boolean);
    }
}

module.exports = ADBWrapper;
module.exports.ADBError = ADBError;
