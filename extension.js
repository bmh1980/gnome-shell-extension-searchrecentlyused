/**
 * Copyright (C) 2012-2014 Marcus Habermehl <bmh1980@posteo.org>
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
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

// Gjs imports
const Lang = imports.lang;

// Internal imports
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const St = imports.gi.St;

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

const RecentEntry = new Lang.Class({
    Name: 'RecentEntry',

    _init: function(recentInfo) {
        this._recentInfo = recentInfo;
        this._score = 0;
    },

    get appIcon() {
        return this.appInfo.get_icon();
    },

    get appInfo() {
        return Gio.AppInfo.get_default_for_type(this.mimeType, false);
    },

    get exists() {
        return this._recentInfo.exists();
    },

    get gicon() {
        let file = Gio.File.new_for_uri(this.uri);
        let info = file.query_info(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                   Gio.FileQueryInfoFlags.NONE, null);
        let path = info.get_attribute_byte_string(
            Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

        if (path) {
            return Gio.FileIcon.new(Gio.File.new_for_path(path));
        } else {
            return this._recentInfo.get_gicon();
        }
    },

    get mimeType() {
        return this._recentInfo.get_mime_type();
    },

    get name() {
        return this._recentInfo.get_display_name();
    },

    get score() {
        return this._score;
    },

    get uri() {
        return this._recentInfo.get_uri();
    },

    get visited() {
        return this._recentInfo.get_visited();
    },

    activate: function() {
        this.appInfo.launch_uris([this.uri], null);
    },

    rate: function(terms) {
        this._score = 0;

        for (let i = 0; i < terms.length; i++) {
            if (i == 0 || this._score > 0) {
                let term = terms[i].toLocaleLowerCase();
                let nameIndex = this.name.toLocaleLowerCase().indexOf(term);
                let uriIndex = this.uri.toLocaleLowerCase().indexOf(term);

                if (nameIndex == 0) {
                    this._score += 3;
                } else if (nameIndex > 0) {
                    this._score += 2;
                }

                if (uriIndex == 0) {
                    this._score += 2;
                } else if (uriIndex > 0) {
                    this._score += 1;
                }
            }
        }
    }
});

const RecentEntryIcon = new Lang.Class({
    Name: 'RecentEntryIcon',

    _init: function(recentEntry) {
        this._recentEntry = recentEntry;
        this.actor = new St.Bin({reactive: true, track_hover: true});
        this.icon = new IconGrid.BaseIcon(
            this._recentEntry.name,
            {showLabel: true, createIcon: Lang.bind(this, this.createIcon)});
        this.actor.child = this.icon.actor;
        this.actor.label_actor = this.icon.label;
    },

    createIcon: function(size) {
        let box = new Clutter.Box();
        let icon = new St.Icon({gicon: this._recentEntry.gicon,
                                icon_size: size });

        box.add_child(icon);

        if (this._recentEntry.appIcon) {
            let emblem = new St.Icon({gicon: this._recentEntry.appIcon,
                                      icon_size: 22});
            box.add_child(emblem);
        }

        return box;
    }
});

const SearchRecentlyUsed = new Lang.Class({
    Name: 'SearchRecentlyUsed',

    _init: function() {
        this.id = 'searchrecentlyused@bmh1980de.gmail.com';
        this.searchSystem = null;
        this.recentManager = Gtk.RecentManager.get_default();
    },

    activateResult: function(id) {
        id.activate();
    },

    createResultObject: function(metaInfo, terms) {
        return new RecentEntryIcon(metaInfo.id);
    },

    filterResults: function(results, maxResults) {
        return results.slice(0, maxResults);
    },

    getInitialResultSet: function(terms) {
        let searchResults = [];
        let recentFiles = this.recentManager.get_items();

        for (let i = 0; i < recentFiles.length; i++) {
            let recentFile = new RecentEntry(recentFiles[i]);

            if (recentFile.exists) {
                recentFile.rate(terms);

                if (recentFile.score > 0) {
                    searchResults.push(recentFile);
                }
            }
        }

        searchResults.sort(_resultSort);
        this.searchSystem.setResults(this, searchResults);
    },

    getSubsearchResultSet: function(previousResults, terms) {
        let searchResults = [];

        for (let i = 0; i < previousResults.length; i++) {
            let recentFile = previousResults[i];

            recentFile.rate(terms);

            if (recentFile.score > 0) {
                searchResults.push(recentFile);
            }
        }

        searchResults.sort(_resultSort);
        this.searchSystem.setResults(this, searchResults);
    },

    getResultMetas: function(ids, callback) {
        let results = [];

        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            results.push({id: id, name: id.name})
        }

        callback(results);
    }
});

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
