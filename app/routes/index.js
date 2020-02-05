"use strict";

const R = require("ramda");
const path = require("path");
const glob = require("glob");

module.exports = (app, info) => {
	// Load all routes
	const routes = glob(path.join("./", info.location, "/app/routes/**/*.js"), {
		sync: true
	});

	// Require each route
	R.forEach((route) => {
		// Exclude current file
		if (route !== path.join(info.location, "/app/routes/index.js").substring(1)) {
			// Remove `./` from route before requiring it
			require(route)(app, info);
		}
	})(routes);
};
