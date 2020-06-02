const LbTaskChecker = require("@wcm/lb-task-checker");

const lbTaskCheckerInstance = new LbTaskChecker();

lbTaskCheckerInstance.registerTask({
    key: "SITEMAP_RENDER",
    instance: process.pid
});

module.exports = lbTaskCheckerInstance;
