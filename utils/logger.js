const { createLogger, format, transports } = require('winston');
const timezoned = () => { return new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }); };

const consoleFormat = format.combine(
    format.label({ label: "buypal" }),
    format.colorize(),
    format.timestamp({ format: timezoned }),
    format.align(),
    format.splat(),
    format.printf((info) => {
        if (typeof info.message === 'object') {
            info.message = JSON.stringify(info.message, null, 3)
        }
        return `${info.timestamp} - ${info.level} [${info.label}]: ${info.message}`
    })
)

module.exports = createLogger({ format: consoleFormat, transports: [new transports.Console()] });