const setupRoutes = require("./routes");
const hooksController = require("./controllers/hooks");
const cron = require("./controllers/cron");
const variablesHelper = require("./helpers/variables");

module.exports = (app, hooks, moduleInfo) => {
	// Handle hooks
	hooksController.handleHooks(hooks);

	// Get variables & setup cron
	variablesHelper.reload(moduleInfo)
		.then(() => {
			cron.init();
			cron.start();
		});

	// Setup routes
	setupRoutes(app, moduleInfo);
};
