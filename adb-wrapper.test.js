// adb-wrapper.test.js
const ADBWrapper = require('./adb-wrapper');
const { ADBError } = require('./adb-wrapper');
const { exec } = require('child_process');
const fs = require('fs').promises;

// Mock child_process and fs
jest.mock('child_process');
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        access: jest.fn()
    }
}));

describe('ADBWrapper', () => {
    let adb;
    let mockExec;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Setup exec mock
        mockExec = jest.fn((cmd, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            // Default success response
            callback(null, { stdout: '', stderr: '' });
        });
        exec.mockImplementation(mockExec);

        adb = new ADBWrapper();
    });

    describe('Constructor', () => {
        test('should create instance with default options', () => {
            expect(adb.deviceId).toBeNull();
            expect(adb.screenSize).toBeNull();
            expect(adb.timeout).toBe(30000);
            expect(adb.screenshotDir).toBe('./screenshots');
        });

        test('should create instance with custom options', () => {
            const customAdb = new ADBWrapper('device123', {
                timeout: 5000,
                screenshotDir: '/tmp/screens'
            });
            expect(customAdb.deviceId).toBe('device123');
            expect(customAdb.timeout).toBe(5000);
            expect(customAdb.screenshotDir).toBe('/tmp/screens');
        });

        test('should extend EventEmitter', () => {
            expect(adb.on).toBeDefined();
            expect(adb.emit).toBeDefined();
        });
    });

    describe('executeCommand', () => {
        test('should execute command without device ID', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'output', stderr: '' });
            });

            const result = await adb.executeCommand('devices');
            
            expect(mockExec).toHaveBeenCalledWith(
                'adb devices',
                expect.objectContaining({ timeout: 30000 }),
                expect.any(Function)
            );
            expect(result).toBe('output');
        });

        test('should execute command with device ID', async () => {
            adb.deviceId = 'device123';
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'output', stderr: '' });
            });

            await adb.executeCommand('shell ls');
            
            expect(mockExec).toHaveBeenCalledWith(
                'adb -s device123 shell ls',
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should emit command_executed event', async () => {
            const spy = jest.fn();
            adb.on('command_executed', spy);

            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.executeCommand('devices');
            
            expect(spy).toHaveBeenCalledWith({ command: 'adb devices' });
        });

        test('should emit warning on stderr', async () => {
            const spy = jest.fn();
            adb.on('warning', spy);

            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: 'some error' });
            });

            await adb.executeCommand('devices');
            
            expect(spy).toHaveBeenCalledWith('some error');
        });

        test('should throw ADBError on command failure', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(new Error('Command failed'), { stdout: '', stderr: '' });
            });

            await expect(adb.executeCommand('invalid'))
                .rejects.toThrow('Failed to execute ADB command');
        });

        test('should emit error event on failure', async () => {
            const spy = jest.fn();
            adb.on('error', spy);

            mockExec.mockImplementation((cmd, options, callback) => {
                callback(new Error('Command failed'), { stdout: '', stderr: '' });
            });

            await expect(adb.executeCommand('invalid')).rejects.toThrow();
            expect(spy).toHaveBeenCalled();
        });

        test('should use custom timeout', async () => {
            const customAdb = new ADBWrapper(null, { timeout: 5000 });
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await customAdb.executeCommand('devices');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ timeout: 5000 }),
                expect.any(Function)
            );
        });
    });

    describe('executeShell', () => {
        test('should execute shell command with sanitization', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'result', stderr: '' });
            });

            await adb.executeShell('ls -la');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('shell'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should handle single quotes in command', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'result', stderr: '' });
            });

            await adb.executeShell("echo 'test'");
            
            // Should escape single quotes properly
            expect(mockExec).toHaveBeenCalled();
        });
    });

    describe('getDevices', () => {
        test('should parse device list correctly', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                const output = 'List of devices attached\ndevice1\tdevice\ndevice2\toffline';
                callback(null, { stdout: output, stderr: '' });
            });

            const devices = await adb.getDevices();
            
            expect(devices).toEqual([
                { id: 'device1', status: 'device' },
                { id: 'device2', status: 'offline' }
            ]);
        });

        test('should return empty array when no devices', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'List of devices attached\n', stderr: '' });
            });

            const devices = await adb.getDevices();
            expect(devices).toEqual([]);
        });
    });

    describe('getDeviceInfo', () => {
        test('should retrieve device information', async () => {
            let callCount = 0;
            mockExec.mockImplementation((cmd, options, callback) => {
                const responses = ['Samsung', 'Galaxy S21', '13', '33'];
                callback(null, { stdout: responses[callCount++] || 'unknown', stderr: '' });
            });

            const info = await adb.getDeviceInfo();
            
            expect(info).toMatchObject({
                manufacturer: 'Samsung',
                model: 'Galaxy S21',
                androidVersion: '13',
                sdkVersion: 33
            });
        });

        test('should handle missing properties gracefully', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(new Error('Failed'), { stdout: '', stderr: '' });
            });

            const info = await adb.getDeviceInfo();
            
            expect(info.manufacturer).toBe('unknown');
            expect(info.model).toBe('unknown');
        });
    });

    describe('autoConnect', () => {
        test('should connect to first available device', async () => {
            const spy = jest.fn();
            adb.on('connected', spy);

            mockExec.mockImplementation((cmd, options, callback) => {
                const output = 'List of devices attached\ndevice123\tdevice';
                callback(null, { stdout: output, stderr: '' });
            });

            const deviceId = await adb.autoConnect();
            
            expect(deviceId).toBe('device123');
            expect(adb.deviceId).toBe('device123');
            expect(spy).toHaveBeenCalledWith('device123');
        });

        test('should throw error when no devices found', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'List of devices attached\n', stderr: '' });
            });

            await expect(adb.autoConnect())
                .rejects.toThrow('No devices found');
        });

        test('should throw error when no authorized devices', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                const output = 'List of devices attached\ndevice1\tunauthorized';
                callback(null, { stdout: output, stderr: '' });
            });

            await expect(adb.autoConnect())
                .rejects.toThrow('No authorized devices found');
        });
    });

    describe('getScreenSize', () => {
        test('should get and cache screen size', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'Physical size: 1080x1920', stderr: '' });
            });

            const size = await adb.getScreenSize();
            
            expect(size).toEqual({ width: 1080, height: 1920 });
            expect(adb.screenSize).toEqual({ width: 1080, height: 1920 });
        });

        test('should use cached value on subsequent calls', async () => {
            adb.screenSize = { width: 1080, height: 1920 };

            const size = await adb.getScreenSize();
            
            expect(size).toEqual({ width: 1080, height: 1920 });
            expect(mockExec).not.toHaveBeenCalled();
        });

        test('should refresh when requested', async () => {
            adb.screenSize = { width: 720, height: 1280 };
            
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'Physical size: 1080x1920', stderr: '' });
            });

            const size = await adb.getScreenSize(true);
            
            expect(size).toEqual({ width: 1080, height: 1920 });
            expect(mockExec).toHaveBeenCalled();
        });

        test('should throw error on parse failure', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'invalid format', stderr: '' });
            });

            await expect(adb.getScreenSize())
                .rejects.toThrow('Failed to parse screen size');
        });
    });

    describe('tap', () => {
        test('should execute tap command with valid coordinates', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.tap(100, 200);
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('input tap 100 200'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should floor decimal coordinates', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.tap(100.7, 200.9);
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('input tap 100 200'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should throw error on invalid coordinates', async () => {
            await expect(adb.tap(-1, 100)).rejects.toThrow();
            await expect(adb.tap(100, -1)).rejects.toThrow();
            await expect(adb.tap('100', 200)).rejects.toThrow();
            await expect(adb.tap(100, NaN)).rejects.toThrow();
        });
    });

    describe('swipe', () => {
        test('should execute swipe command', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.swipe(100, 200, 300, 400, 500);
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('input touchscreen swipe 100 200 300 400 500'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should use default duration', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.swipe(100, 200, 300, 400);
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('300'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should validate all coordinates and duration', async () => {
            await expect(adb.swipe(-1, 0, 100, 100)).rejects.toThrow();
            await expect(adb.swipe(0, -1, 100, 100)).rejects.toThrow();
            await expect(adb.swipe(0, 0, -1, 100)).rejects.toThrow();
            await expect(adb.swipe(0, 0, 100, -1)).rejects.toThrow();
            await expect(adb.swipe(0, 0, 100, 100, -1)).rejects.toThrow();
        });
    });

    describe('scrollDown and scrollUp', () => {
        beforeEach(() => {
            adb.screenSize = { width: 1080, height: 1920 };
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });
        });

        test('should scroll down from 80% to 20% of screen height', async () => {
            await adb.scrollDown();
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('input touchscreen swipe 540 1536 540 384'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should scroll up from 20% to 80% of screen height', async () => {
            await adb.scrollUp();
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('input touchscreen swipe 540 384 540 1536'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should use custom duration', async () => {
            await adb.scrollDown(1000);
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('1000'),
                expect.any(Object),
                expect.any(Function)
            );
        });
    });

    describe('openUrl', () => {
        test('should open URL with intent', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.openUrl('https://example.com');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('am start -a android.intent.action.VIEW'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should throw error on invalid URL', async () => {
            await expect(adb.openUrl('')).rejects.toThrow();
            await expect(adb.openUrl(null)).rejects.toThrow();
        });
    });

    describe('forceStop', () => {
        test('should force stop valid package', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.forceStop('com.example.app');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('am force-stop com.example.app'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should validate package name format', async () => {
            await expect(adb.forceStop('invalid')).rejects.toThrow();
            await expect(adb.forceStop('123invalid')).rejects.toThrow();
            await expect(adb.forceStop('')).rejects.toThrow();
        });
    });

    describe('launchApp', () => {
        test('should launch app by package name', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.launchApp('com.example.app');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('monkey -p com.example.app'),
                expect.any(Object),
                expect.any(Function)
            );
        });
    });

    describe('clearAppData', () => {
        test('should clear app data', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'Success', stderr: '' });
            });

            await adb.clearAppData('com.example.app');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('pm clear com.example.app'),
                expect.any(Object),
                expect.any(Function)
            );
        });
    });

    describe('getCurrentPackage', () => {
        test('should get current package from activity dump', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                const output = 'mResumedActivity: com.example.app/.MainActivity';
                callback(null, { stdout: output, stderr: '' });
            });

            const pkg = await adb.getCurrentPackage();
            expect(pkg).toBe('com.example.app');
        });

        test('should fallback to window focus method', async () => {
            let callCount = 0;
            mockExec.mockImplementation((cmd, options, callback) => {
                if (callCount++ === 0) {
                    callback(new Error('First method failed'), { stdout: '', stderr: '' });
                } else {
                    callback(null, { stdout: 'mCurrentFocus: com.example.app', stderr: '' });
                }
            });

            const pkg = await adb.getCurrentPackage();
            expect(pkg).toBe('com.example.app');
        });

        test('should return null when package not found', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(new Error('Failed'), { stdout: '', stderr: '' });
            });

            const pkg = await adb.getCurrentPackage();
            expect(pkg).toBeNull();
        });
    });

    describe('Key events', () => {
        beforeEach(() => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });
        });

        test('should press back button', async () => {
            await adb.back();
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('KEYCODE_BACK'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should press home button', async () => {
            await adb.home();
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('KEYCODE_HOME'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should press recent apps button', async () => {
            await adb.recentApps();
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('KEYCODE_APP_SWITCH'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should press power button', async () => {
            await adb.power();
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('KEYCODE_POWER'),
                expect.any(Object),
                expect.any(Function)
            );
        });
    });

    describe('typeText', () => {
        test('should type text with spaces converted', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.typeText('hello world');
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('hello%sworld'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should throw error on non-string input', async () => {
            await expect(adb.typeText(123)).rejects.toThrow();
            await expect(adb.typeText(null)).rejects.toThrow();
        });
    });

    describe('wait', () => {
        test('should wait for specified duration', async () => {
            jest.useFakeTimers();
            
            const promise = adb.wait(1000);
            jest.advanceTimersByTime(1000);
            
            await promise;
            
            jest.useRealTimers();
        });

        test('should validate wait time', async () => {
            await expect(adb.wait(-1)).rejects.toThrow();
            await expect(adb.wait('100')).rejects.toThrow();
        });
    });

    describe('takeScreenshot', () => {
        beforeEach(() => {
            fs.mkdir.mockResolvedValue();
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });
        });

        test('should take screenshot and create directory', async () => {
            const path = await adb.takeScreenshot('test.png');
            
            expect(fs.mkdir).toHaveBeenCalledWith('./screenshots', { recursive: true });
            expect(path).toContain('test.png');
        });

        test('should use timestamp in filename by default', async () => {
            const path = await adb.takeScreenshot();
            
            expect(path).toMatch(/screenshot_\d+\.png/);
        });

        test('should cleanup remote file by default', async () => {
            await adb.takeScreenshot('test.png');
            
            // Check that rm command was attempted (in the calls)
            const calls = mockExec.mock.calls;
            const hasCleanup = calls.some(call => 
                call[0].includes('rm') && call[0].includes('/sdcard/')
            );
            expect(hasCleanup).toBe(true);
        });

        test('should not cleanup when cleanup=false', async () => {
            await adb.takeScreenshot('test.png', false);
            
            const calls = mockExec.mock.calls;
            const hasCleanup = calls.some(call => 
                call[0].includes('rm') && call[0].includes('/sdcard/')
            );
            expect(hasCleanup).toBe(false);
        });
    });

    describe('pullFile', () => {
        beforeEach(() => {
            fs.mkdir.mockResolvedValue();
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });
        });

        test('should pull file from device', async () => {
            await adb.pullFile('/sdcard/test.txt', '/tmp/test.txt');
            
            expect(fs.mkdir).toHaveBeenCalled();
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('pull'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should throw error on missing paths', async () => {
            await expect(adb.pullFile('', '/tmp/test.txt')).rejects.toThrow();
            await expect(adb.pullFile('/sdcard/test.txt', '')).rejects.toThrow();
        });
    });

    describe('pushFile', () => {
        beforeEach(() => {
            fs.access.mockResolvedValue();
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });
        });

        test('should push file to device', async () => {
            await adb.pushFile('/tmp/test.txt', '/sdcard/test.txt');
            
            expect(fs.access).toHaveBeenCalledWith('/tmp/test.txt');
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('push'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should throw error on missing paths', async () => {
            await expect(adb.pushFile('', '/sdcard/test.txt')).rejects.toThrow();
            await expect(adb.pushFile('/tmp/test.txt', '')).rejects.toThrow();
        });
    });

    describe('getBatteryInfo', () => {
        test('should parse battery information', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                const output = `
                    level: 85
                    status: 2
                    health: 2
                    temperature: 250
                `;
                callback(null, { stdout: output, stderr: '' });
            });

            const battery = await adb.getBatteryInfo();
            
            expect(battery).toEqual({
                level: 85,
                status: 2,
                health: 2,
                temperature: 25
            });
        });

        test('should handle missing battery data', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'invalid data', stderr: '' });
            });

            const battery = await adb.getBatteryInfo();
            
            expect(battery.level).toBeNull();
            expect(battery.status).toBeNull();
        });
    });

    describe('getInstalledPackages', () => {
        test('should get all packages', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                const output = 'package:com.android.chrome\npackage:com.example.app\n';
                callback(null, { stdout: output, stderr: '' });
            });

            const packages = await adb.getInstalledPackages();
            
            expect(packages).toEqual(['com.android.chrome', 'com.example.app']);
        });

        test('should get third-party packages only', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: 'package:com.example.app\n', stderr: '' });
            });

            await adb.getInstalledPackages(true);
            
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('pm list packages -3'),
                expect.any(Object),
                expect.any(Function)
            );
        });
    });

    describe('reboot', () => {
        test('should reboot device', async () => {
            mockExec.mockImplementation((cmd, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });

            await adb.reboot();
            
            expect(mockExec).toHaveBeenCalledWith(
                'adb reboot',
                expect.any(Object),
                expect.any(Function)
            );
        });
    });
});

describe('ADBError', () => {
    test('should create error with command and original error', () => {
        const originalError = new Error('Original');
        const adbError = new ADBError('Test error', 'test command', originalError);

        expect(adbError.message).toBe('Test error');
        expect(adbError.name).toBe('ADBError');
        expect(adbError.command).toBe('test command');
        expect(adbError.originalError).toBe(originalError);
    });

    test('should be instanceof Error', () => {
        const adbError = new ADBError('Test', 'cmd', null);
        expect(adbError instanceof Error).toBe(true);
    });
});
