const { createLogger, format, transports } = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const { combine, timestamp, printf, errors, colorize } = format;
const path = require("path");
const morgan = require("morgan");

// تعریف استایل لاگ
const logFormat = printf(({ timestamp, level, message, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// ساخت لاگر
const logger = createLogger({
  level: "info", // حداقل سطح لاگ
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }), // استک خطاها رو بگیر
    logFormat
  ),
  transports: [
    // چرخش فایل لاگ روزانه برای خطاها
    new DailyRotateFile({
      filename: path.join(process.cwd(), "logs/error-%DATE%.log"), // فایل روزانه با تاریخ
      level: "error",
      datePattern: "YYYY-MM-DD", // فرمت تاریخ برای فایل‌ها
      zippedArchive: true, // فشرده‌سازی فایل‌ها
      maxSize: "20m", // حد بیشترین حجم هر فایل
      maxFiles: "14d", // نگه‌داری فایل‌های لاگ فقط برای 14 روز
    }),

    // چرخش فایل لاگ روزانه برای همه چیز
    new DailyRotateFile({
      filename: path.join(process.cwd(), "logs/combined-%DATE%.log"), // فایل روزانه با تاریخ
      datePattern: "YYYY-MM-DD", // فرمت تاریخ برای فایل‌ها
      zippedArchive: true, // فشرده‌سازی فایل‌ها
      maxSize: "20m", // حد بیشترین حجم هر فایل
      maxFiles: "14d", // نگه‌داری فایل‌های لاگ فقط برای 14 روز
    }),
  ],
});

// اگر محیط dev باشه، لاگ به کنسول هم بفرست
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: combine(colorize(), logFormat),
    })
  );
}
const morganMiddleware = morgan("combined", {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
});

module.exports = { logger, morganMiddleware };
