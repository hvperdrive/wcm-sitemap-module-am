# @wcm/sitemap-module-am

This module automatically generates a sitemap (using cron).

## Prerequisites
 - A running implementation of the Pelorus CMS in multitenancy mode is needed either locally or on a server.
 (see https://github.com/hvperdrive/pelorus-cms and https://github.com/hvperdrive/pelorus-multitenancy)
 - Node needs to be installed on the system.
 (see https://nodejs.org)

## How to install
1. Publish the latest version to the nexus repo if necessary
2. Define the module and version in Pelorus multitenancy instance
3. Add module to the Pelorus CMS tenant/instance in peloruse multitenancy instance

## Usage

### API

[GET] `/sitemap` - Get generated sitemap

## Module development

Please read the following on how to work with WCM modules before changing anything to this repo.

[Modules manual on Github](https://github.com/hvperdrive/pelorus-cms/blob/develop/readmes/modules.md) <br>
[Modules manual on Digipolis Bitbucket](https://bitbucket.antwerpen.be/projects/WCM/repos/wcm/browse/readmes/modules.md?at=refs%2Fheads%2Fv3-master)
