const LbTaskChecker = require("@wcm/lb-task-checker");

const lbTaskCheckerInstance = new LbTaskChecker();

lbTaskCheckerInstance.registerTask({
    key: "SCHEDULE_PUBLISHING",
    instance: process.pid
});

const handleScheduledPublishing = () => lbTaskCheckerInstance.reserve("SCHEDULE_PUBLISHING", new Date(new Date().getTime() + 10000), process.pid)

module.exports = Object.assign(main, {
	handleScheduledPublishing
});
