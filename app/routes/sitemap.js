"use strict";

const R = require("ramda");

const sitemapController = require("../controllers/sitemap");

// Get the configuration of the WCM
const config = require("@wcm/module-helper").getConfig();
const compression = require("compression");

const availableWebsites = ["am", "dgv"];

// Building the baseUrl based on the configuration. Every API call needs to be located after the api/ route
const baseUrl = "/" + config.api.prefix + config.api.version;

const sitemapGuard = (req, res, next) => {
    const website = (R.path(["params", "website"])(req));

    if (availableWebsites.indexOf(website) > -1) {
        return next();
    }
    return res.status(500).send("No sitemap found for the given URL!");
};

module.exports = (app) => {
    app.route(`${baseUrl}:website/sitemap`).get(sitemapGuard, compression(), sitemapController.stream);
};
