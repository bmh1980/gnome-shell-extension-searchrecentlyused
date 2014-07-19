/**
 * Copyright (C) 2012 Marcus Habermehl <bmh1980@posteo.org>
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
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const St = imports.gi.St;

// Gjs imports
const Gettext = imports.gettext;
const Lang = imports.lang;

// Internal imports
const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Search = imports.ui.search;

const _gettextDomain = Gettext.domain('searchrecentlyused');
const _ = _gettextDomain.gettext
const _thisExtension = ExtensionUtils.getCurrentExtension();

// Variable to hold the extension instance
var _searchRecentlyUsedInstance = null;

/**
 * _resultSort:
 * @a: Object created by SearchRecentlyUsed._buildRecentFileList
 * @b: Object created by SearchRecentlyUsed._buildRecentFileList
 *
 * Sort the list of recently used files in the following order.
 *
 * 1. descending by the score
 * 2. descending by the timestamp of the last visit
 * 3. ascending by the name
*/
function _resultSort(a, b) {
    if (a.score < b.score) return 1;
    if (a.score > b.score) return -1;
    if (a.visited < b.visited) return 1;
    if (a.visited > b.visited) return -1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
}

/**
 * _rateMatch:
 * @recentFile: Object created by SearchRecentlyUsed._buildRecentFileList
 * @term: String to search for
 *
 * Rate the quality of matches.
 *
 * 5: Both, name *and* URI begin with the given term
 * 4: The name begin with the given term and the URI contains it
 * 4: The URI begin with the given term and the name contains it
 * 3: The name begin with the given term, but the URI does not contains it
 * 3: Both, name *and* URI contains the given term
 * 2: The URI begin with the given term, but the name does not contains it
 * 2: The name contains the given term, but the URI not
 * 1: The URI contains the given term, but the name not
 * 0: Neither name nor URI contains the given term
*/
function _rateMatch(recentFile, term) {
    let nameIndex = recentFile.name.toLocaleLowerCase().indexOf(term);
    let uriIndex = recentFile.uri.toLocaleLowerCase().indexOf(term);

    let score = 0;

    if (nameIndex == 0) {
        score += 3;
    } else {
        if (nameIndex > 0) {
            score += 2;
        }
    }

    if (uriIndex == 0) {
        score += 2;
    } else {
        if (uriIndex > 0) {
            score += 1;
        }
    }

    return score;
}

const SearchRecentlyUsed = new Lang.Class({
    Name: 'SearchRecentlyUsed',

    _init: function() {
        this.title = _("RECENTLY USED");
        this.searchSystem = null;
        this.recentManager = Gtk.RecentManager.get_default();
    },

    _searchRecentlyUsed: function(recentFiles, terms) {
        let searchResults = [];

        for (let i = 0; i < recentFiles.length; i++) {
            let recentFile = recentFiles[i];

            for (let j = 0; j < terms.length; j++) {
                // Terms are treated as logical AND
                if (j == 0 || recentFile.score > 0) {
                    let term = terms[j].toLocaleLowerCase();
                    let score = _rateMatch(recentFile, term);

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

        searchResults.sort(_resultSort);
        return searchResults;
    },

    activateResult: function(id) {
        id.appInfo.launch_uris([id.uri], null);
    },

    createResultObject: function(resultMeta, terms) {
        return null;
    },

    filterResults: function(results, maxNumber) {
        return results.slice(0, maxNumber);
    },

    getInitialResultSet: function(terms) {
        let recentFiles = this.recentManager.get_items();
        this.searchSystem.setResults(
            this, this._searchRecentlyUsed(recentFiles, terms));
    },

    getSubsearchResultSet: function(previousResults, terms) {
        this.searchSystem.setResults(
            this, this._searchRecentlyUsed(previousResults, terms));
    },

    getResultMeta: function(id) {
        let createIcon = function(size) {
            let file = Gio.file_new_for_uri(id.uri);

            let info = file.query_info(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH, 0, null);

            let path = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

            if (path) {
                // got thumbnail of file. use it
                return imports.gi.St.TextureCache.get_default().load_gicon(
                        null,
                        new Gio.FileIcon({ file: Gio.file_new_for_path(path) }),
                        size);
            } else {
                // fallback to default icon for the file type
                return new St.Icon({gicon: id.icon, icon_size: size});
            }
        };

        return {
            id: id,
            appInfo: id.appInfo,
            createIcon: createIcon,
            uri: id.uri,
            name: id.name
        };
    },

    getResultMetas: function(ids, callback) {
        let results = ids.map(this.getResultMeta);

        if (callback) {
            callback(results);
        }

        return results;
    }
});

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
        _searchRecentlyUsedInstance = null;
    }
}
