"use strict";

const setupRoutes = require("./routes");
const variablesHelper = require("./helpers/variables");
const hooksController = require("./controllers/hooks");

module.exports = (app, hooks, moduleInfo) => {
	// Get variables
	variablesHelper.reload(moduleInfo);

	// Handle hooks
	hooksController.handleHooks(hooks);

	// Setup routes
	setupRoutes(app, moduleInfo);
};

// Exposed API (for other modules)
module.exports.API = require("./api");
