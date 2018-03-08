"use strict";

const path = require("path");
const stream = require("stream");
const R = require("ramda");
const Q = require("q");
const xmlBuilder = require("xmlbuilder");

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
const generateCustomMap = (location, lastmod, changefreq) => ({
	location,
	lastmod,
	changefreq
});
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

const generateVisionPages = () => getContentAndMapIt(
	["58d8d7ffcc4e35a38f275ef1", "58eb5396152216149a7fc15e"],
	"projecten",
	["over", "tijdlijn", "doe-mee", "documenten"]
);

const generateProjectPages = () => getContentAndMapIt(
	["58d8ec8298490acd83bf3348"],
	"toekomstvisies",
	["over", "tijdlijn", "doe-mee", "documenten"]
);

const generateParticipationPages = () => getContentAndMapIt(
	["58da6a1707bc1351f2dfbb45"],
	"doe-mee",
	null
);

const generateAboutSections = () => getContentAndMapIt(
	["591d46ad1ff864234b8e4501"],
	"over-ons",
	null
);

const generateXMLSitemap = (sitemapArray) => {
    const urlSet = xmlBuilder.create("urlSet", { version: "1.0", encoding: "UTF-8" });
    urlSet.att("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9");

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
	return Q.allSettled([
        removeOldSiteMap(module.exports.currId),
		generateMainPagesInfo(),
		generateVisionPages(),
		generateProjectPages(),
		generateParticipationPages(),
		generateAboutSections()
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
