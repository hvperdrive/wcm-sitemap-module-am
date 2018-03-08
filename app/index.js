"use strict";

const hooksController = require("./controllers/hooks");
const cron = require("./controllers/cron");

module.exports = (app, hooks, moduleInfo) => {

	// Handle hooks
	hooksController.handleHooks(hooks);

	// Start cron
	cron.start();
};
