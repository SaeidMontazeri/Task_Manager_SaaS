const Express = require("express");
const Mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const swaggerUi = require("swagger-ui-express");
require("dotenv").config();
// const serviceAccount = require("./src/utils/serviceAccountKey.json");
const admin = require("firebase-admin");
const YAML = require("yamljs");
const allroutes = require("./src/routes");
const path = require("path");
const { morganMiddleware, logger } = require("./src/utils/logger");

global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;

class Application {
  constructor() {
    this.app = Express();
  }

  async init() {
    await this.setupDataBase();
    // await this.setupRedis();
    // await this.setupFirebase();
    this.setupSwagger();
    await this.setupStaticFiles();
    this.setupMiddlewares();
    this.setupTemplateRendering();
    this.setupRoutes();
    this.setupErrors();
    // this.setupCronJob();

    return this.app;
  }
  setupCronJob() {
    // require("./jobs/checkExpiredInvoices.job")();
    logger.info("⏰ Invoice checker cron job loaded");
  }

  async setupDataBase() {
    Mongoose.set("strictQuery", false);
    const db =
      process.env.ISTEST == "true"
        ? process.env.DB_LOCAL
        : process.env.DB_PUBLIC;

    Mongoose.connect(db)
      .then(() => {
        logger.info("Database connected successfully.");
      })
      .catch((error) => {
        logger.error(`Error connecting to database :\n${error}`);
      });
    Mongoose.Promise = global.Promise;
  }

  setupSwagger() {
    try {
      const swaggerDocument = YAML.load("./swagger.yaml");
      const swaggerOptions = {
        swaggerOptions: {
          docExpansion: "none",
          tagsSorter: "alpha",
          operationsSorter: "alpha",
        },
      };
      this.app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerDocument, swaggerOptions),
      );
      logger.info("Swagger docs loaded successfully at /api-docs");
    } catch (err) {
      logger.error("Error loading Swagger documentation:", err);
    }
  }

  // async setupRedis() {
  //   if (process.env.ISTEST != "true") {
  //     require("./src/utils/redisClient");
  //   }
  // }

  setupTemplateRendering() {
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(__dirname, "views"));
  }

  async setupStaticFiles() {
    this.app.use(Express.static("uploads"));
  }

  setupErrors() {
    const isDev = process.env.NODE_ENV !== "production";

    function shutdown() {
      logger.info("Shutting down the server...");
      process.exit(1);
    }

    // Middleware: هندل مسیرهای اشتباه
    this.app.use((req, res, next) => {
      logger.warn(`404 Not Found - ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        message: "Resource not found",
        ...(isDev && { url: req.originalUrl }),
      });
    });

    // Middleware: هندل ارورهای داخلی
    this.app.use((err, req, res, next) => {
      logger.error(`Express error: ${err.message}`, { stack: err.stack });

      if (res.headersSent) {
        return next(err);
      }

      const status = err.status || 500;
      res.status(status).json({
        message: status === 500 ? "Internal Server Error" : err.message,
        ...(isDev && { error: err.message, stack: err.stack }),
      });
    });

    // هندل خطاهای بدون هندل (uncaught)
    process.on("uncaughtException", (error) => {
      logger.error(`Uncaught Exception: ${error.message}`, {
        stack: error.stack,
      });
      shutdown();
    });

    // هندل پرامیس‌های بدون هندل (unhandled)
    // process.on("unhandledRejection", (reason, promise) => {
    //   logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    //   shutdown();
    // });

    logger.info("✅ Error handlers setup completed.");
  }

  setupRoutes() {
    this.app.use("/api", allroutes);
    logger.info("Setup all routes.");
  }

  async setupFirebase() {
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        logger.info("🔥 Firebase connected successfully.");
      } else {
        logger.info("✅ Firebase already initialized.");
      }
    } catch (error) {
      logger.error("❌ Error connecting to Firebase:", error);
    }
  }

  setupMiddlewares() {
    this.app.use(Express.urlencoded({ extended: false }));
    this.app.use(Express.json());

    this.app.use(helmet());
    this.app.use(cookieParser());
    // this.app.use(csrf({ cookie: true }));
    this.app.use(
      rateLimit({
        windowMs: 60000,
        max: 300,
        message: {
          date: new Date(),
          success: false,
          statusCode: 429,
          message: "We have received too many requests from you.",
        },
        validate: { xForwardedForHeader: false },
      }),
    );
    // this.app.use((req, res, next) => {
    //   if (Number(res.statusCode) >= 500) {
    //     return res.status(500).json({
    //       date: new Date(),
    //       success: false,
    //       statusCode: 500,
    //       message: "An error occurred on the server side.",
    //     });
    //   }
    //   next();
    // });

    this.app.use(compression());
    this.app.use((req, res, next) => {
      // Sanitize body
      if (req.body) mongoSanitize.sanitize(req.body);

      // Sanitize params
      if (req.params) mongoSanitize.sanitize(req.params);

      // Clone query, sanitize, and reassign
      if (req.query) {
        const sanitizedQuery = JSON.parse(JSON.stringify(req.query));
        mongoSanitize.sanitize(sanitizedQuery);
        req.query = sanitizedQuery; // overwrite safely
      }

      next();
    });
    this.app.use(hpp());
    this.app.use(cors());

    this.app.disable("x-powered-by");

    this.app.use(function (req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept",
      );
      next();
    });
    this.app.use(morganMiddleware);
    this.app.use(
      session({
        secret: process.env.SESSION_SECRET,
        cookie: { maxAge: 60 * 60 * 1000 },
        resave: false,
        saveUninitialized: false,
      }),
    );

    this.app.use((req, res, next) => {
      res.setHeader("X-Server-Time", new Date().toISOString());
      next();
    });

    logger.info("Setup all middlewares.");
  }
}

module.exports = Application;
