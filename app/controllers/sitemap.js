const path = require("path");

const sitemapGenerator = require("../helpers/sitemapGenerator");
const gridFSHelper = require(path.join(process.cwd(), "app/helpers/gridfs"));

module.exports.stream = (req, res) => {
	res.set("content-type", "application/xml");
	gridFSHelper.getStreamById(sitemapGenerator.getSitemapId(req.get("X-context"))).pipe(res);
};
