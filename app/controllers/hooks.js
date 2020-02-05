const variablesHelper = require("../helpers/variables");
const cronController = require("./cron");

const onLoadComplete = () => {
	// Initiate passport strategies
	variablesHelper.reload()
		.then(() => cronController.init());
};
const onConfigurationChanged = () => {
	// Initiate passport strategies
	variablesHelper.reload()
		.then(() => cronController.init());
};

module.exports.handleHooks = (hooks) => {
	var myHooks = {
		onLoadComplete: onLoadComplete,
		onConfigurationChanged: onConfigurationChanged
	};

	Object.assign(hooks, myHooks);
};
