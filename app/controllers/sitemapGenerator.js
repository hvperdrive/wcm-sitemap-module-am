"use strict";

const path = require("path");
const R = require("ramda");
const Q = require("q");

const ContentModel = require(path.join(process.cwd(), "app/models/content"));
const ViewModel = require(path.join(process.cwd(), "app/models/view"));

const defaultReturnFields = {
	"meta.lastModified": 1,
	"meta.created": 1
};
const defaultContentQuery = {
	"published": true,
	"deleted": false,
};
const defaultFreq = "daily";

const getLastMod = (content) => R.pathOr(null, ["meta", "lastModified"])(content) || R.pathOr(null, ["meta", "created"])(content);
const generateCustomMap = (location, lastmod, changefreq) => ({
	location,
	lastmod,
	changefreq
});
const generateContentMap = (content, location) => generateCustomMap(location, getLastMod(content), defaultFreq);

const getContentAndMapIt = (cts, prefix, sufixes) => ContentModel.find({
	...defaultContentQuery,
	"meta.contentType": { $in: cts }
})
.lean()
.exec()
.then((result) => result.reduce((acc, item) => {
	if (!Array.isArray(sufixes)) {
		acc.push(
			generateContentMap(item, (prefix + "/" + R.pathOr(false, ["meta", "slug"]), item))
		);

		return acc;
	}

	sufixes.forEach((suf) => acc.push(
		generateContentMap(item, (prefix + "/" + R.pathOr(false, ["meta", "slug"] + "/" + suf), item))
	));

	return acc;
}, []));

const getContentBySlugAndMapIt = (slug) => {
	ContentModel.findOne({
		...defaultContentQuery,
		"meta.slug": slug
	}, defaultReturnFields)
		.lean()
		.exec()
		.then((result) => generateContentMap(result, slug))
};


const generateMainPagesInfo = () => {
	const map = [];
	const promises = [];

	promises.push(
		getContentAndMapIt("home", ["", "home"]),
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
		R.filter((item) => !!item.value)
	)(result));
}

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

module.exports = () => {
	Q.allSettled([
		generateMainPagesInfo(),
		generateVisionPages(),
		generateProjectPages(),
		generateParticipationPages(),
		generateAboutSections()
	]).then((result) => {
		const sitemapObj = R.compose(
			R.flatten,
			R.filter((item) => !!item.value)
		)(result)

		console.log(sitemapObj);
	})
};
