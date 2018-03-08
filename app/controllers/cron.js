"use strict";

const cron = require("cron").CronJob;
const config = require("@wcm/module-helper").getConfig();
const sitemapGenerator = require("./sitemapGenerator");

const job = new CronJob({
	cronTime: config.server.modules.cron.cronTime,
	onTick: () => {
		console.log("CRON: GENERATING SITEMAP."); // eslint-disable-line no-console
		return sitemapGenerator()
			.then(() => console.log("CRON: SITEMAP GENERATED!"), // eslint-disable-line no-console
				(err) => console.log("CRON: SITEMAP GENERATION FAILED => ", err) // eslint-disable-line no-console
			);
	},
	onComplete: () => console.log(null, "CRON: SITEMAP GENERATION COMPLETE!"), // eslint-disable-line no-console
	start: false,
	timeZone: config.server.modules.cron.timeZone,
	runOnInit: true
});

module.exports.stop = () => job.stop();
module.exports.start = () => job.start();
