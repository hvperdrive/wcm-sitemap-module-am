const path = require("path");
const stream = require("stream");
const R = require("ramda");
const Q = require("q");
const xmlBuilder = require("xmlbuilder");
const variablesHelper = require("../helpers/variables");

const ContentModel = require(path.join(process.cwd(), "app/models/content"));
const gridFSHelper = require(path.join(process.cwd(), "app/helpers/gridfs"));
const cacheController = require(path.join(process.cwd(), "app/controllers/cache"));

let availableLanguages = [];

const defaultReturnFields = {
	"meta.lastModified": 1,
	"meta.created": 1,
	"meta.slug": 1,
	"fields.participation": 1,
	"fields.studies": 1,
	"fields.documents": 1,
	"fields.featuredMedia": 1
};
const defaultContentQuery = {
	"meta.published": true,
	"meta.deleted": false
};
const DEFAULT_FREQ = "daily";
const SITEMAP_CACHE_KEY = "sitemapKey";
const VALID_EXPIRE_TIME = 3 * 24 * 60 * 60; // 3 days

const getSitemapCacheKey = (context) => {
	return `${SITEMAP_CACHE_KEY}-${context}`;
};

const getLastMod = (content) => R.compose(
	(date) => new Date(date).toISOString(),
	(item) => R.pathOr(null, ["meta", "lastModified"])(item) || R.pathOr(null, ["meta", "created"])(item)
)(content);

const generateCustomMap = (location, lastmod, changefreq, context) => {
	let baseUrl = context === "am" ? variablesHelper.get().baseAmURL : variablesHelper.get().baseDgvURL;

	const finalUrl = baseUrl + location

	return { location: finalUrl.replace(/\/$/, ""), lastmod, changefreq };
};

const generateContentMap = (content, location, context) => generateCustomMap(location, getLastMod(content), DEFAULT_FREQ, context);

const getContentByCT = (cts) => {
	return ContentModel.find(Object.assign(
		{},
		defaultContentQuery,
		{ "meta.contentType": { $in: cts } }
	), defaultReturnFields).lean().exec();
};

const getContentByCTForWebsite = (cts, context) => {
	return ContentModel.find(Object.assign(
		{},
		defaultContentQuery,
		{ "meta.contentType": { $in: cts } },
		context === "dgv" ? { "fields.medium.dgv-website": true } : {},
		context === "am" ? { "fields.medium.website": true } : {}
	), defaultReturnFields).lean().exec();
};

const getContentBySlug = (queryString, slug) => ContentModel.findOne(Object.assign(
	{},
	defaultContentQuery,
	{ [queryString]: slug }
), defaultReturnFields).lean().exec();

const getContentByUuids = (uuids) => ContentModel.find(Object.assign(
	{},
	defaultContentQuery,
	{ uuid: { $in: uuids } }
), defaultReturnFields).lean().exec();

const generateMultilingualContent = (item, prefix, suffix, context) => {
	const multilingualContentMap = availableLanguages.map(lang => {
		const slugByLang = R.pathOr(null, ["meta", "slug", lang])(item);

		if (slugByLang) {
			let baseURL = `${lang}/${prefix}/${slugByLang}`;

			if (suffix) {
				if (Array.isArray(suffix)) {
					return R.flatten(suffix.map((suf) => generateContentMap(item, `${baseURL}/${suf}`, context)));
				} else {
					baseURL += `/${suffix}`;
				}

			}
			return generateContentMap(item, (baseURL), context);
		}
	});

	return R.flatten(multilingualContentMap.filter(item => typeof item !== "undefined"));
};

const generateMultilingualCustomContent = (slug, date, changeFreq, context) => availableLanguages.map(lang => {
	return generateCustomMap(`${lang}/${slug}`, date, changeFreq, context);
});

const getContentAndMapIt = (cts, prefix, suffixes, context) => getContentByCT(cts, context)
	.then((result) => result.reduce((acc, item) => {

		acc.push(generateMultilingualContent(item, prefix, suffixes, context));

		return acc;
	}, []));

const getContentBySlugAndMapIt = (slug, suffixes, context) => {
	return availableLanguages.map(lang => {
		const queryString = `meta.slug.${lang}`;

		return getContentBySlug(queryString, slug).then(item => suffixes.map(suffix => {
			let baseURL = lang;

			if (suffix.length) {
				baseURL += `/${suffix}`;
			}

			return generateContentMap(item, baseURL, context);
		}));
	});
};

const generateRootPagesInfo = (context) => {
	return generateCustomMap("", new Date().toISOString(), DEFAULT_FREQ, context)
}

const generateMainPagesInfo = (context) => {
	const map = [];
	const promises = [];

	promises.push(
		...getContentBySlugAndMapIt("home", [""], context),
		...getContentBySlugAndMapIt("participation-overview", ["doe-mee", "doe-mee/komende", "doe-mee/afgelopen", "doe-mee/media"], context)
	);

	map.push(
		...generateMultilingualCustomContent("projecten", new Date().toISOString(), DEFAULT_FREQ, context),
		...generateMultilingualCustomContent("op-kaart", new Date().toISOString(), DEFAULT_FREQ, context)
	);

	return Q.allSettled(promises).then((result) => R.compose(
		R.concat(map),
		R.flatten,
		R.filter((value) => value),
		R.map((item) => item.value)
	)(result));
};

const generateMainPagesInfoAM = (context) => {
	const promises = [];

	promises.push(
		...getContentBySlugAndMapIt("visions-overview", ["toekomstvisies"], context),
		...getContentBySlugAndMapIt("contact", ["over-ons"], context),
		...getContentBySlugAndMapIt("present-past-overview", ["nu-en-vroeger"], context)
	);

	return Q.allSettled(promises).then((result) => R.compose(
		R.flatten,
		R.filter((value) => value),
		R.map((item) => item.value)
	)(result));
};

const generateMainPagesInfoDGV = (context) => {
	const promises = [];

	promises.push(
		...getContentBySlugAndMapIt("contactdgv", ["contact-dgv", "contact-dgv/veelgestelde-vragen", "contact-dgv/contact-formulier", "contact-dgv/infopunten"], context),
		...getContentBySlugAndMapIt("kansen-voor-jobs", ["kansen-voor-jobs", "kansen-voor-jobs/over", "kansen-voor-jobs/tijdlijn", "kansen-voor-jobs/doe-mee", "kansen-voor-jobs/media"], context),
		...getContentBySlugAndMapIt("over-ons-dgv", ["over-ons", "over-ons/over-ons", "over-ons/tijdlijn", "over-ons/toekomstverbond", "over-ons/studies", "over-ons/doe-mee", "over-ons/media"], context)
	);

	return Q.allSettled(promises).then((result) => R.compose(
		R.flatten,
		R.filter((value) => value),
		R.map((item) => item.value)
	)(result));
};

const generateSubContentSlug = (items, slug, lang, context) => {
	return items.map(item => {
		const subSlugByLang = R.pathOr(null, ["meta", "slug", lang])(item);

		if (subSlugByLang) {
			return generateContentMap(item, (`${lang}/${slug}/${subSlugByLang}`), context);
		}
	});
};

const getSubContentAndMapIt = (items, project, prefix, suffix, context) => {
	const uuids = items.map(item => item.value);

	return Promise.all(availableLanguages.map((lang) => {
		return getContentByUuids(uuids).then(items => {
			const slugByLang = R.pathOr(null, ["meta", "slug", lang])(project);

			if (slugByLang) {
				return generateSubContentSlug(items, `${prefix}/${slugByLang}/${suffix}`, lang, context);
			} else {
				return generateSubContentSlug(items, `${prefix}/${suffix}`, lang, context);
			}
		});

	})).then(result => result.reduce((acc, items) => {
		if (Array.isArray(items)) {
			return acc.concat(items.filter(item => !!item));
		}
		return acc;
	}, []));
};

const generateVisionPages = (variables, context) => getContentAndMapIt(
	[variables.topvisions, variables.visions],
	"visies",
	[...defaultContentPageSuffix, 'visie'],
	context
);

const generateProjectPages = (variables, context) => getContentByCTForWebsite([variables.projects])
	.then((content) => generateGenericRoutesPagesFromContent(content, context, "projecten", "doe-mee", ["over", "tijdlijn", "doe-mee","media"]))

const generateRingparkenPages = (variables, context) => getContentByCT([variables.ringparken])
	.then((content) => generateGenericRoutesPagesFromContent(content, context, "projecten", "doe-mee", ["over", "tijdlijn", "doe-mee","media"]))

const generateProjectPagesAM = (variables, context) => getContentByCTForWebsite([variables.projects])
	.then((content) => generateGenericRoutesPagesFromContent(content, context, "projecten", "doe-mee", ["over", "tijdlijn", "doe-mee","media", "project"]));

const generateDetailPagesAM = (contentType, context, prefix, multilingualContentSuffix) => getContentByCT(contentType)
	.then((content) => generateGenericRoutesPagesFromContent(content, context, prefix, '', multilingualContentSuffix));

const generateGenericRoutesPagesFromContent = (content, context, prefix, subContentSuffix, multilingualContentSuffix) => {
	const promises = content.map((contentItem) => {
		const uuids = (R.path(["fields", "participation"])(contentItem));

		return getSubContentAndMapIt(uuids, contentItem, prefix, subContentSuffix, context);
	});

	const routes = R.flatten(content.map(contentItem => generateMultilingualContent(contentItem, prefix, multilingualContentSuffix, context)));
	return Q.all(promises.concat(routes)).then(result => R.flatten(result));
}

const generateAboutSectionsDGV = (context) => {
	const promises = availableLanguages.map(lang => {
		const queryString = `meta.slug.${lang}`;

		return getContentBySlug(queryString, "over-ons-dgv")
			.then((content) => {

				const array = [
					{ key: "participation", prefix: "over-ons", item: content, suffix: "doe-mee" },
					{ key: "studies", prefix: "over-ons", item: content, suffix: "studies" },
					{ key: "featuredMedia", prefix: "over-ons", item: content, suffix: "media" }
				];

				const promises = array.map((config) => {
					const uuids = (R.path(["fields", config.key])(content));

					return getSubContentAndMapIt(uuids, null, config.prefix, config.suffix, context);
				});

				return Q.all(promises);
			}).then(result => R.flatten(result));
	});

	return Q.allSettled(promises).then((result) => R.compose(
		R.flatten,
		R.filter((value) => value),
		R.map((item) => item.value)
	)(result));
};

const generateJobsSections = (context) => {
	const promises = availableLanguages.map(lang => {
		const queryString = `meta.slug.${lang}`;

		return getContentBySlug(queryString, "kansen-voor-jobs")
			.then((content) => {

				const array = [
					{ key: "participation", prefix: "kansen-voor-jobs", item: content, suffix: "doe-mee" },
					{ key: "featuredMedia", prefix: "kansen-voor-jobs", item: content, suffix: "media" }
				];

				const promises = array.map((config) => {
					const uuids = (R.path(["fields", config.key])(content));

					return getSubContentAndMapIt(uuids, null, config.prefix, config.suffix, context);
				});

				return Q.all(promises);
			}).then(result => R.flatten(result));
	});

	return Q.allSettled(promises).then((result) => R.compose(
		R.flatten,
		R.filter((value) => value),
		R.map((item) => item.value)
	)(result));
};

const generateAboutSections = (variables, context) => getContentAndMapIt(
	[variables.about],
	"over-ons",
	null,
	context
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

const generateDGVContent = (variables, context) => {
	return [
		generateRootPagesInfo(context),
		generateMainPagesInfo(context),
		generateMainPagesInfoDGV(context),
		generateProjectPages(variables, context),
		generateRingparkenPages(variables, context),
		generateAboutSectionsDGV(context),
		generateJobsSections(context)
	];
};

const generateAMContent = (variables, context) => {
	const defaultAMSuffix = ["over", "tijdlijn", "doe-mee","media", 'activiteiten']
	return [
		generateRootPagesInfo(context),
		generateMainPagesInfo(context),
		generateMainPagesInfoAM(context),
		generateProjectPagesAM(variables, context),
		generateDetailPagesAM([variables.archeologie], context, 'archeologie', [...defaultAMSuffix, 'archeologie']),
		generateDetailPagesAM([variables.beleidsplan], context, 'beleidsplan', [...defaultAMSuffix, 'beleidsplan']),
		generateDetailPagesAM([variables.campagne], context, 'campagne', [...defaultAMSuffix, 'campagne']),
		generateDetailPagesAM([variables.locatie], context, 'locatie', [...defaultAMSuffix, 'locatie','publicaties']),
		generateDetailPagesAM([variables.publicaties], context, 'publicaties', ['']),
		generateDetailPagesAM([variables.restauratieproject], context, 'restauratieproject', [...defaultAMSuffix, 'restauratieproject']),
		generateDetailPagesAM([variables.stadsbouwmeester], context, 'stadsbouwmeester', [...defaultAMSuffix, 'stadsbouwmeester','publicaties', 'wedstrijden']),
		generateVisionPages(variables, context),
		generateAboutSections(variables, context)
	];
};

module.exports = (context) => {
	const variables = variablesHelper.get().ctIds.variables;

	availableLanguages = variablesHelper.get().languages.split(",");

	return Q.allSettled(context === "dgv" ? generateDGVContent(variables, context) : generateAMContent(variables, context)).then((result) => {
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

		return gridFSHelper.writeStreamToGridFS({ fileName: `${context}.sitemap.xml` }, readable)
			.then((item) => {
				const d = Q.defer();

				cacheController.set(getSitemapCacheKey(context), item._id, (err) => err ? d.reject(err) : d.resolve(item._id));

				return d.promise;
			})
			.then((id) => {

				// remove old sitemaps
				gridFSHelper.getMetaData({ "filename": `${context}.sitemap.xml`, "_id": { $not: { $eq: id } } }, (err, sitemaps) => {

					if (err || sitemaps.length === 0) {
						return id;
					}

					sitemaps.forEach(item => {
						gridFSHelper.remove(item._id);
					});
				});

				return id;
			});
	});
};

module.exports.getSitemapId = (context) => {
	const d = Q.defer();

	cacheController.get(getSitemapCacheKey(context), VALID_EXPIRE_TIME, (err, key) => {
		if (err || !key) {
			return d.reject(err || "key not found");
		}

		return d.resolve(key);
	});

	return d.promise;
};
