"use strict";

const sitemapController = require("../controllers/sitemap");

// Get the configuration of the WCM
const config = require("@wcm/module-helper").getConfig();
const compression = require("compression");


// Building the baseUrl based on the configuration. Every API call needs to be located after the api/ route
const baseUrl = "/" + config.api.prefix + config.api.version + "sitemap";

module.exports = (app) => {
	app.route(baseUrl).get(compression(), sitemapController.stream);
}
