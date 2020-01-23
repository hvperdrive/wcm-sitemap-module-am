"use strict";

const path = require("path");
const xmlBuilder = require("xmlbuilder");
const R = require("ramda");

const sitemapGenerator = require("../helpers/sitemapGenerator");
const gridFSHelper = require(path.join(process.cwd(), "app/helpers/gridfs"));

module.exports.stream = (req, res) => {
    const website = (R.path(["params", "website"])(req));

    res.set("content-type", "application/xml");
    gridFSHelper.getStreamById(sitemapGenerator.getSitemapId(website)).pipe(res);
};
