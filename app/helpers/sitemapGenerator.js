"use strict";

const path = require("path");
const stream = require("stream");
const R = require("ramda");
const Q = require("q");
const xmlBuilder = require("xmlbuilder");
const variablesHelper = require("../helpers/variables");

const ContentModel = require(path.join(process.cwd(), "app/models/content"));
const ViewModel = require(path.join(process.cwd(), "app/models/view"));
const gridFSHelper = require(path.join(process.cwd(), "app/helpers/gridfs"));

const defaultReturnFields = {
	"meta.lastModified": 1,
    "meta.created": 1,
    "meta.slug": 1
};
const defaultContentQuery = {
	"meta.published": true,
	"meta.deleted": false,
};
const defaultFreq = "daily";

const getLastMod = (content) => R.compose(
    (date) => new Date(date).toISOString(),
    (item) => R.pathOr(null, ["meta", "lastModified"])(item) || R.pathOr(null, ["meta", "created"])(item)
)(content);
const generateCustomMap = (location, lastmod, changefreq) => {
	return { location: variablesHelper.get().baseURL + location, lastmod, changefreq };
};
const generateContentMap = (content, location) => generateCustomMap(location, getLastMod(content), defaultFreq);

const getContentAndMapIt = (cts, prefix, sufixes) => ContentModel.find(Object.assign(
    {},
	defaultContentQuery,
	{ "meta.contentType": { $in: cts } }
), defaultReturnFields)
.lean()
.exec()
.then((result) => result.reduce((acc, item) => {
	if (!Array.isArray(sufixes)) {
		acc.push(
			generateContentMap(item, (prefix + "/" + R.pathOr(false, ["meta", "slug", "nl"])(item)))
		);

		return acc;
	}

	sufixes.forEach((suf) => acc.push(
		generateContentMap(item, (prefix + "/" + R.pathOr(false, ["meta", "slug", "nl"])(item) + "/" + suf))
	));

	return acc;
}, []));

const getContentBySlugAndMapIt = (slug, paths) => ContentModel.findOne(Object.assign(
    {},
    defaultContentQuery,
    { "meta.slug": slug }
), defaultReturnFields)
.lean()
.exec()
.then((result) => paths.map((p) => generateContentMap(result, p)));

const removeOldSiteMap = (id) => {
    if (!id) {
        return;
    }

    return gridFSHelper.remove(id);
}

const generateMainPagesInfo = () => {
	const map = [];
	const promises = [];

	promises.push(
		getContentBySlugAndMapIt("home", ["", "home"]),
		getContentBySlugAndMapIt("visions-overview", ["toekomstvisies"]),
		getContentBySlugAndMapIt("participation-overview", ["doe-mee"]),
		getContentBySlugAndMapIt("contact", ["over-ons"])
	);

	map.push(
		generateCustomMap("projecten", new Date().toISOString(), defaultFreq),
		generateCustomMap("in-de-buurt", new Date().toISOString(), defaultFreq)
	);

	return Q.allSettled(promises).then((result) => R.compose(
        R.concat(map),
        R.flatten,
        R.filter((value) => value),
		R.map((item) => item.value)
	)(result));
};

const generateVisionPages = (variables) => getContentAndMapIt(
	[variables.topvisions, variables.visions],
	"projecten",
	["over", "tijdlijn", "doe-mee", "documenten"]
);

const generateProjectPages = (variables) => getContentAndMapIt(
	[variables.projects],
	"toekomstvisies",
	["over", "tijdlijn", "doe-mee", "documenten"]
);

const generateParticipationPages = (variables) => getContentAndMapIt(
	[variables.participate],
	"doe-mee",
	null
);

const generateAboutSections = (variables) => getContentAndMapIt(
	[variables.about],
	"over-ons",
	null
);

const generateXMLSitemap = (sitemapArray) => {
    const urlSet = xmlBuilder.create("urlset", { version: "1.0", encoding: "UTF-8" });
	urlSet.att("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9");
	urlSet.att("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");
	urlSet.att("xsi:schemaLocation", "http://www.sitemaps.org/schemas/sitemap/0.9");

    sitemapArray.forEach((item) => {
        if (!item || !item.location) {
            return;
        }

        const url = urlSet.ele("url");

        url.ele("loc", null, item.location);

        if (item.lastmod) {
            url.ele("lastmod", null, item.lastmod);
        }

        if (item.changefreq) {
            url.ele("changefreq", null, item.changefreq);
        }
    });

    return urlSet.end();
};

module.exports = () => {
	const variables = variablesHelper.get().ctIds.variables;

	return Q.allSettled([
        removeOldSiteMap(module.exports.currId),
		generateMainPagesInfo(variables),
		generateVisionPages(variables),
		generateProjectPages(variables),
		generateParticipationPages(variables),
		generateAboutSections(variables)
	]).then((result) => {
		const sitemapArray = R.compose(
            R.flatten,
			R.map((item) => item.value),
            R.filter((item) => !!item.value)
        )(result)

        const errors = R.compose(
            R.map((item) => item.error),
            R.filter((item) => !!item.error)
        )(result);

        if(errors.length) {
            console.log("Errors sitemap: ", errors)
        }

        const readable = new stream.Readable();
        readable.push(generateXMLSitemap(sitemapArray));
        readable.push(null);

        return gridFSHelper.writeStreamToGridFS({ fileName: "sitemap.xml" }, readable)
            .then((item) => module.exports.currId = item._id || null);
	})
};

module.exports.currId = null;
