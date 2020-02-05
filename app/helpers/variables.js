"use strict";

const Q = require("q");
const VariableHelper = require("@wcm/module-helper").variables;

let packageInfo = null;
let variables = null;

module.exports.get = () => variables;

module.exports.getPackageInfo = () => packageInfo;

module.exports.reload = (info) => {
	packageInfo = info || packageInfo || null;

	return VariableHelper.getAll(packageInfo.name, packageInfo.version)
		.then((vars) => {
			variables = vars;

			return Q.when(variables);
		},
			(responseError) => {
				throw responseError;
			});
};
