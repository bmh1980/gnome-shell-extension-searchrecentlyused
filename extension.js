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
const Gio   = imports.gi.Gio;
const Gtk   = imports.gi.Gtk;
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
const _thisExtension = ExtensionUtils.getCurrentExtension();

// Variable to hold the extension instance
var _searchRecentlyUsedInstance = null;

/**
 * _bookmarksSort:
 * @a: Object created by SearchRecentlyUsed._buildRecentFileList
 * @b: Object created by SearchRecentlyUsed._buildRecentFileList
 *
 * Sort the list of recently used files in the following order.
 *
 * 1. descending by the score
 * 2. descending by the timestamp of the last visit
 * 3. ascending by the name
*/
function _bookmarksSort(a, b) {
    if (a.score   < b.score  ) return  1;
    if (a.score   > b.score  ) return -1;
    if (a.visited < b.visited) return  1;
    if (a.visited > b.visited) return -1;
    if (a.name    < b.name   ) return -1;
    if (a.name    > b.name   ) return  1;
    return 0;
}

/**
 * _rateMatch:
 * @recentFile: Object created by SearchRecentlyUsed._buildRecentFileList
 * @term: String to search for
 *
 * Rate the quality of matches.
 *
 * 4: Both, name/title *and* URI begin with the given term
 * 3: The name/title begin with the given term and the URI contains it
 * 2: The URI begin with the given term and the name/title contains it
 * 1: Both, name/title *and* URI contains the given term
 * 0: Neither name/title nor URI contains the given term
*/
function _rateMatch(recentFile, term) {
    let nameIndex = recentFile.name.toLowerCase().indexOf(term);
    let uriIndex  = recentFile.uri.toLowerCase().indexOf(term);

    if (nameIndex == 0 && uriIndex == 0) return 4;
    if (nameIndex == 0 && uriIndex >  0) return 3;
    if (nameIndex >  0 && uriIndex == 0) return 2;
    if (nameIndex >  0 && uriIndex >  0) return 1;
    return 0;
}

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
                    executable: appInfo.get_executable(),
                    icon      : recentInfo.get_gicon(),
                    name      : recentInfo.get_display_name(),
                    score     : 0,
                    uri       : recentInfo.get_uri(),
                    visited   : recentInfo.get_visited()
                });
            }
        }
    },

    _searchRecentlyUsed: function(terms) {
        let searchResults = [];

        for (let i = 0; i < this.recentFiles.length; i++) {
            let recentFile = this.recentFiles[i];

            for (let j = 0; j < terms.length; j++) {
                // Terms are treated as logical AND
                if (j == 0 || recentFile.score > 0) {
                    let score = _rateMatch(recentFile, terms[j]);

                    if (score > 0) {
                        recentFile.score += score;
                    } else {
                        recentFile.score = 0;
                    }
                }
            }

            if (recentFile.score > 0) {
                searchResults.push(recentFile);
            }
        }

        searchResults.sort(_bookmarksSort);
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

        let appInfo = Gio.AppInfo.create_from_commandline(
            id.executable, null,
            Gio.AppInfoCreateFlags.SUPPORTS_STARTUP_NOTIFICATION);

        if (appInfo) {
            appInfo.launch_uris([id.uri], null);
        } else {
            log(_thisExtension.uuid + ': could not get GAppInfo for ' +
                id.executable + ' to launch ' + id.uri);
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
            executable: id.executable,
            createIcon: createIcon,
            uri       : id.uri,
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
