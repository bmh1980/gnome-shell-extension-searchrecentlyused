/**
 * Copyright (C) 2012 Marcus Habermehl <bmh1980de@gmail.com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301,
 * USA.
*/

// External imports
const Gtk   = imports.gi.Gtk;
const Shell = imports.gi.Shell;
const St    = imports.gi.St;

// Gjs imports
const Gettext = imports.gettext;
const Lang    = imports.lang;

// Internal imports
const Config         = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Main           = imports.ui.main;
const Search         = imports.ui.search;

const _gettextDomain = Gettext.domain('searchrecentlyused');
const _              = _gettextDomain.gettext
const _appSystem     = Shell.AppSystem.get_default();
const _thisExtension = ExtensionUtils.getCurrentExtension();

// Variable to hold the extension instance
var _searchRecentlyUsedInstance = null;

function SearchRecentlyUsed() {
    this._init();
}

SearchRecentlyUsed.prototype = {
    __proto__: Search.SearchProvider.prototype,

    _init: function() {
        Search.SearchProvider.prototype._init.call(this, _("RECENTLY USED"));

        this.recentFiles = []

        this.recentManager = Gtk.RecentManager.get_default();
        this.callbackId = this.recentManager.connect(
            'changed', Lang.bind(this, this._buildRecentFileList));
        this._buildRecentFileList();
    },

    _buildRecentFileList: function() {
        this.recentFiles = []

        let recentFiles = this.recentManager.get_items();

        for (let i = 0; i < recentFiles.length; i++) {
            let recentInfo = recentFiles[i];

            if (recentInfo.exists()) {
                let lastApplication = recentInfo.last_application();
                let appInfo = recentInfo.create_app_info(lastApplication);

                this.recentFiles.push({
                    appName: appInfo.get_name(),
                    icon   : recentInfo.get_gicon(),
                    name   : recentInfo.get_display_name(),
                    uri    : recentInfo.get_uri()
                });
            }
        }
    },

    _searchRecentlyUsed: function(terms) {
        let searchResults = [];

        for (let i = 0; i < this.recentFiles.length; i++) {
            let recentFile = this.recentFiles[i];

            for (let j = 0; j < terms.length; j++) {
                let nameIndex = recentFile.name.toLowerCase().indexOf(terms[j]);
                let uriIndex  = recentFile.uri.toLowerCase().indexOf(terms[j]);

                if (nameIndex == 0 && uriIndex == 0) {
                    recentFile.score = 4;
                } else {
                    if (nameIndex == 0 && uriIndex > 0) {
                        recentFile.score = 3;
                    } else {
                        if (nameIndex > 0 && uriIndex == 0) {
                            recentFile.score = 2;
                        } else {
                            if (nameIndex > 0 && uriIndex > 0) {
                                recentFile.score = 1;
                            } else {
                                recentFile.score = 0;
                            }
                        }
                    }
                }

                if (nameIndex > -1 || uriIndex > -1) {
                    searchResults.push(recentFile);
                }
            }
        }

        searchResults.sort(function(x, y) {
            return (x.scrore > y.score) || (x.name > y.name);
        });

        return searchResults;
    },

    activateResult: function(id) {
        /**
         * GtkRecentInfo objects having a method to get a corresponding GAppInfo
         * instance. But this GAppInfo Instances could launch the application
         * with broken URIs. As example 'Arbeitsfläche' (German for 'Desktop')
         * becomes 'Arbeitsfl34che'. This looks like a bug in the conversation
         * from an URI to a local path.
        */

        let apps = _appSystem.initial_search([id.appName]);

        if (apps.length > 0) {
            let appInfo = apps[0].get_app_info();
            appInfo.launch_uris([id.uri], null);
        } else {
            log(_thisExtension.uuid + ': could not get GAppInfo for ' +
                id.appName + ' to launch ' + id.uri);
        }
    },

    destroy: function() {
        this.recentManager.disconnect(this.callbackId);
        this.callbackId  = -1;
        this.recentFiles = []
    },

    getInitialResultSet: function(terms) {
        this.searchSystem.pushResults(this, this._searchRecentlyUsed(terms));
    },

    getSubsearchResultSet: function(previousResults, terms) {
        return this.getInitialResultSet(terms);
    },

    getResultMeta: function(id) {
        let createIcon = function(size) {
            return new St.Icon({gicon: id.icon, icon_size: size});
        };

        return {
            id        : id,
            appName   : id.appName,
            createIcon: createIcon,
            uri       : id.uri,
            score     : -1,
            name      : id.name
        };
    },

    getResultMetas: function(ids, callback) {
        let results = ids.map(this.getResultMeta);

        if (callback) {
            callback(results);
        }

        return results;
    }
};

function init() {
    let localeDir = _thisExtension.dir.get_child('locale');

    if (localeDir.query_exists(null)) {
        Gettext.bindtextdomain('searchrecentlyused', localeDir.get_path());
    } else {
        Gettext.bindtextdomain('searchrecentlyused', Config.LOCALEDIR);
    }
}

function enable() {
    if (_searchRecentlyUsedInstance == null) {
        _searchRecentlyUsedInstance = new SearchRecentlyUsed();
        Main.overview.addSearchProvider(_searchRecentlyUsedInstance);
    }
}

function disable() {
    if (_searchRecentlyUsedInstance != null) {
        Main.overview.removeSearchProvider(_searchRecentlyUsedInstance);
        _searchRecentlyUsedInstance.destroy();
        _searchRecentlyUsedInstance = null;
    }
}
