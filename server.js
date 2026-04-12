const { logger } = require("./utilities/logger");
const Application = require("./app");

(async () => {
  const appInstance = new Application();
  const app = await appInstance.init();
  const port = process.env.PORT || 3000;
  app.listen(port, (error) => {
    if (error) {
      logger.error(`Error running the application :\n${error}`);
    } else {
      logger.info(`Application running on port ${port}.`);
    }
  });
})();
