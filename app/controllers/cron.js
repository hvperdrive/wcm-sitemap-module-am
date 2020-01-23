"use strict";

const Q = require("q");
const CronJob = require("cron").CronJob;
const config = require("@wcm/module-helper").getConfig();
const variablesHelper = require("../helpers/variables");
const sitemapGenerator = require("../helpers/sitemapGenerator");

const availableWebsites = [
    {
        "name": "am-website",
        "id": ""
    },
    {
        "name": "dgv-website",
        "id": ""
    }
];

let job;

module.exports.init = () => {
    if (job) {
        job.stop();
    }

    const variables = variablesHelper.get();

    job = new CronJob({
        cronTime: variables.cron,
        onTick: () => {
            console.log("CRON: GENERATING SITEMAPS."); // eslint-disable-line no-console

            const sitemaps = availableWebsites.map(website => {
                console.log(`CRON: GENERATING SITEMAP FOR ${website.name}.`); // eslint-disable-line no-console
                return sitemapGenerator(website, availableWebsites).then(result => {
                    const index = availableWebsites.findIndex(item => item.name === website.name);

                    availableWebsites[index].id = result;
                });
            });

            return Q.allSettled(sitemaps).then(() => console.log("CRON: SITEMAPS GENERATED!"), // eslint-disable-line no-console
                (err) => console.log("CRON: SITEMAPS GENERATION FAILED => ", err) // eslint-disable-line no-console
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
