"use strict";

const CronJob = require("cron").CronJob;
const config = require("@wcm/module-helper").getConfig();
const variablesHelper = require("../helpers/variables");
const sitemapGenerator = require("../helpers/sitemapGenerator");

let job;

const availableWebsites = ["am", "dgv"];

module.exports.init = () => {
    if (job) {
        job.stop();
    }

    const variables = variablesHelper.get();

    job = new CronJob({
        cronTime: variables.cron,
        onTick: () => {
            console.log("CRON: GENERATING SITEMAPS."); // eslint-disable-line no-console

            return Promise.all(
                availableWebsites.map(website => {
                    return sitemapGenerator(website).then(() => {
                        console.log(`CRON: SITEMAP GENERATED FOR ${website}`);
                    });
                })
            ).then(() => console.log("CRON: ALL SITEMAPS GENERATED!"), // eslint-disable-line no-console
                (err) => console.log("CRON: SITEMAP GENERATION FAILED => ", err) // eslint-disable-line no-console
            );
        },
        onComplete: () => console.log(null, "CRON: SITEMAP GENERATION COMPLETE!"), // eslint-disable-line no-console
        start: false,
        timeZone: config.server.modules.cron.timeZone,
        runOnInit: true
    });
};

module.exports.stop = () => job.stop();
module.exports.start = () => job.start();
