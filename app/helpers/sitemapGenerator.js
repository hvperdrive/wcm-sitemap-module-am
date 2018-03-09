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
const cacheController = require(path.join(process.cwd(), "app/controllers/cache"));

const defaultReturnFields = {
	"meta.lastModified": 1,
	"meta.created": 1,
	"meta.slug": 1
};
const defaultContentQuery = {
	"meta.published": true,
	"meta.deleted": false,
};
const DEFAULT_FREQ = "daily";
const SITEMAP_CACHE_KEY = "sitemapKey";
const VALID_EXPIRE_TIME = 3 * 24 * 60 * 60; // 3 days

let currCachId = null;

const getLastMod = (content) => R.compose(
	(date) => new Date(date).toISOString(),
	(item) => R.pathOr(null, ["meta", "lastModified"])(item) || R.pathOr(null, ["meta", "created"])(item)
)(content);
const generateCustomMap = (location, lastmod, changefreq) => {
	return { location: variablesHelper.get().baseURL + location, lastmod, changefreq };
};
const generateContentMap = (content, location) => generateCustomMap(location, getLastMod(content), DEFAULT_FREQ);

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
		generateCustomMap("projecten", new Date().toISOString(), DEFAULT_FREQ),
		generateCustomMap("in-de-buurt", new Date().toISOString(), DEFAULT_FREQ)
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
/*
 * Usage
 * var key ==> Unique key for cache
 * var time ==> Time to cache the data (in seconds)
 * mongoCache(key, time).otherwise(function(deferred, cacheKey) {
 *     // Get new data here
 *     if(success) {
 *         deferred.resolve(data);
 *     } else {
 *         deferred.reject('Some nice error message');
 *     }
 * }).then(function(data) {
 *     // Return the success call/callback here
 *     callback(null, data);
 * }).fail(function(err) {
 *     // Return the fail call/callback here
 *     callback(err, null);
 * });
 */
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

		if (errors.length) {
			console.log("Errors sitemap: ", errors)
		}

		const readable = new stream.Readable();
		readable.push(generateXMLSitemap(sitemapArray));
		readable.push(null);

		return gridFSHelper.writeStreamToGridFS({ fileName: "sitemap.xml" }, readable)
			.then((item) => {
				const d = Q.defer();

				cacheController.set(SITEMAP_CACHE_KEY, item._id, (err) => err ? d.reject(err) : d.resolve(item._id))

				return d.promise;
			})
			.then((id) => currCachId = id);
	})
};

module.exports.getSitemapId = () => currCachId;
module.exports.refrechSitemapId = () => {
	const d = Q.defer();

	cacheController.get(SITEMAP_CACHE_KEY, VALID_EXPIRE_TIME, (err, key) => {
		if (err || !key) {
			return d.reject(err || "key not found");
		}

		currCachId = key;

		return d.resolve(key);
	});

	return d.promise;
};
