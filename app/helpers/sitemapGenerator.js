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
    "meta.slug": 1,
    "fields.participation": 1
};
const defaultContentQuery = {
    "meta.published": true,
    "meta.deleted": false
};
const DEFAULT_FREQ = "daily";
const SITEMAP_AM_CACHE_KEY = "sitemapKeyAM";
const SITEMAP_DGV_CACHE_KEY = "sitemapKeyDGV";
const VALID_EXPIRE_TIME = 3 * 24 * 60 * 60; // 3 days

let currCacheId = {
    dgv: null,
    am: null
};

const getSitemapCacheKey = (context) => {
    return context === "am" ? SITEMAP_AM_CACHE_KEY : SITEMAP_DGV_CACHE_KEY;
};

const getLastMod = (content) => R.compose(
    (date) => new Date(date).toISOString(),
    (item) => R.pathOr(null, ["meta", "lastModified"])(item) || R.pathOr(null, ["meta", "created"])(item)
)(content);

const generateCustomMap = (location, lastmod, changefreq, context) => {
    let baseUrl = context === "am" ? variablesHelper.get().baseAmURL : variablesHelper.get().baseDgvURL;

    return { location: baseUrl + location, lastmod, changefreq };
};

const generateContentMap = (content, location, context) => generateCustomMap(location, getLastMod(content), DEFAULT_FREQ, context);

const getContentByCT = (cts, context) => ContentModel.find(Object.assign(
    {},
    defaultContentQuery,
    { "meta.contentType": { $in: cts } },
    context === "dgv" ? { "fields.medium.dgv-website": true } : {},
    context === "am" ? { "fields.medium.website": true } : {}
), defaultReturnFields).lean().exec();

const getContentBySlug = (slug) => ContentModel.findOne(Object.assign(
    {},
    defaultContentQuery,
    { "meta.slug": slug }
), defaultReturnFields).lean().exec();

const getContentByUuids = (uuids) => ContentModel.find(Object.assign(
    {},
    defaultContentQuery,
    { uuid: { $in: uuids } }
), defaultReturnFields).lean().exec();

const getContentAndMapIt = (cts, prefix, suffixes, context) => getContentByCT(cts)
    .then((result) => result.reduce((acc, item) => {
        if (!Array.isArray(suffixes)) {
            acc.push(
                generateContentMap(item, (prefix + "/" + R.pathOr(false, ["meta", "slug", "nl"])(item)), context)
            );

            return acc;
        }

        suffixes.forEach((suf) => acc.push(
            generateContentMap(item, (prefix + "/" + R.pathOr(false, ["meta", "slug", "nl"])(item) + "/" + suf), context)
        ));

        return acc;
    }, []));

const getContentBySlugAndMapIt = (slug, paths) => getContentBySlug(slug)
    .then((result) => paths.map((p) => generateContentMap(result, p)));

const removeOldSiteMap = (id) => {
    if (!id) {
        return;
    }

    return gridFSHelper.remove(id);
};

const generateMainPagesInfo = () => {
    const map = [];
    const promises = [];

    promises.push(
        getContentBySlugAndMapIt("home", [""]),
        getContentBySlugAndMapIt("visions-overview", ["toekomstvisies"]),
        getContentBySlugAndMapIt("participation-overview", ["doe-mee", "doe-mee/komende", "doe-mee/afgelopen", "doe-mee/media"]),
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

const getSubContentAndMapIt = (items, prefix, filterFn) => {
    const uuids = items.map((item) => item.value);

    return getContentByUuids(uuids).then((results) => {
        if (typeof filterFn === "function" && !filterFn(result)) {
            return Q.when(null);
        }

        return results.map((result) => generateContentMap(result, prefix + "/" + R.path(["meta", "slug", "nl"])(result)), []);
    });
};

const generateVisionPages = (variables, context) => getContentAndMapIt(
    [variables.topvisions, variables.visions],
    "visies",
    ["over", "tijdlijn", "doe-mee", "media"],
    context
);

const generateProjectPages = (variables, context) => getContentByCT([variables.projects], context)
    .then((content) => {
        const promises = content.map((project) => {
            return getSubContentAndMapIt(R.path(["fields", "participation"])(project), `projecten/${R.path(["meta", "slug", "nl"])(project)}/doe-mee`);
        });

        return Q.all(promises);
    })
    .then((result) => R.flatten(result));

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

module.exports = (context) => {
    const variables = variablesHelper.get().ctIds.variables;

    return Q.allSettled([
        removeOldSiteMap(module.exports.currId),
        generateMainPagesInfo(),
        generateVisionPages(variables, context),
        generateProjectPages(variables, context),
        generateAboutSections(variables)
    ]).then((result) => {
        const sitemapArray = R.compose(
            R.flatten,
            R.map((item) => item.value),
            R.filter((item) => !!item.value)
        )(result);

        const errors = R.compose(
            R.map((item) => item.error),
            R.filter((item) => !!item.error)
        )(result);

        if (errors.length) {
            console.log("Errors sitemap: ", errors);
        }

        const readable = new stream.Readable();

        readable.push(generateXMLSitemap(sitemapArray));
        readable.push(null);

        return gridFSHelper.writeStreamToGridFS({ fileName: "sitemap.xml" }, readable)
            .then((item) => {
                const d = Q.defer();

                cacheController.set(getSitemapCacheKey(context), item._id, (err) => err ? d.reject(err) : d.resolve(item._id));

                return d.promise;
            })
            .then((id) => currCacheId[context] = id);
    });
};

module.exports.getSitemapId = (context) => currCacheId[context];
module.exports.refreshSitemapId = (context) => {
    const d = Q.defer();

    cacheController.get(getSitemapCacheKey(context), VALID_EXPIRE_TIME, (err, key) => {
        if (err || !key) {
            return d.reject(err || "key not found");
        }

        currCacheId = key;

        return d.resolve(key);
    });

    return d.promise;
};
