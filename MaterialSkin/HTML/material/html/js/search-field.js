/**
 * LMS-Material
 *
 * Copyright (c) 2018-2020 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const SEARCH_OTHER = new Set(['Deezer', 'Qobuz', 'Spotty', 'Tidal', 'YouTube']);

let seachReqId = 0;
Vue.component('lms-search-field', {
    template: `
<v-layout>
 <v-text-field :label="i18n('Search')" clearable v-model.lazy="term" class="lms-search lib-search" @input="textChanged($event)" ref="entry"></v-text-field>
 <v-icon v-if="searching" class="toolbar-button pulse">search</v-icon>
 <v-btn v-else id="advanced-search-btn" :title="i18n('Advanced search')" flat icon class="toolbar-button" @click="advanced()"><img :src="'database-search' | svgIcon(darkUi)"></img></v-btn>
</v-layout>
`,
    props: [],
    data() {
        return {
            term: "",
            searching: false
        }
    },
    computed: {
        darkUi() {
            return this.$store.state.darkUi
        }
    },
    mounted() {
        this.term = getLocalStorageVal('search', '');
        this.commands=[];
        this.results=[];
        this.searching=false;
        this.str = "";
        this.prevPage = undefined;
        focusEntry(this);
        bus.$on('search-for', function(text, prevPage) {
            this.term = text;
            this.prevPage = prevPage;
            this.searchNow();
        }.bind(this));
    },
    methods: {
        cancel() {
            if (this.searching) {
                this.commands=[];
                this.results=[];
                this.searching=false;
                seachReqId++;
            }
        },
        stopDebounce() {
            if (undefined!=this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = undefined;
            }
        },
        advanced() {
            bus.$emit('closeLibSearch');
            bus.$emit('dlg.open', 'iframe', '/material/advanced_search.html?player='+this.$store.state.player.id, i18n('Advanced search')+SEPARATOR+this.$store.state.player.name);
        },
        textChanged(event) {
            this.stopDebounce();
            this.debounceTimer = setTimeout(function () {
                this.searchNow();
            }.bind(this), 500);
        },
        searchNow() {
            this.cancel();
            if (undefined==this.term) {
                return;
            }
            let str = this.term.trim().replace(/\s+/g, " ");
            if (str.length>1 && str!=this.str) {
                this.str = str;
                setLocalStorageVal('search', this.str);
                this.commands=[];
                this.commands.push({cat:1, command:["artists"], params:["tags:s", "search:"+this.str]});
                this.commands.push({cat:2, command:["albums"], params:[ALBUM_TAGS+(lmsOptions.serviceEmblems ? "E" : ""), "sort:album", "search:"+this.str]});
                this.commands.push({cat:3, command:["tracks"], params:[TRACK_TAGS+"elcy"+(this.$store.state.ratingsSupport ? "R" : "")+
                                                                                         (lmsOptions.serviceEmblems ? "E" : ""), "search:"+this.str]});
                this.commands.push({cat:4, command:["playlists"], params:["tags:su", "search:"+this.str]});
                this.commands.push({cat:5, command:["globalsearch", "items"], params:["menu:1", "search:"+this.str]});
                let libId = this.$store.state.library ? this.$store.state.library : LMS_DEFAULT_LIBRARY;
                if (libId) {
                    for (let i=0, len=this.commands.length; i<len; ++i) {
                        this.commands[i].params.push("library_id:"+libId);
                    }
                }
                this.searching = true;
                seachReqId++;
                this.doSearch();
            }
        },
        doSearch() {
            if (!this.searching) {
                return;
            }
            if (0==this.commands.length) {
                let item = {cancache:false, title:i18n("Search") + SEPARATOR + this.str, id:SEARCH_ID, type:"search", libsearch:true};
                if (0==this.results.length) {
                    bus.$emit('showMessage', i18n('No results found'));
                } else {
                    this.results.sort(function(a, b) { return a.command.cat<b.command.cat ? -1 : 1; });
                    let items=[];
                    let total=0;
                    for (let i=0, len=this.results.length; i<len; ++i) {
                        let all = [];
                        let numItems = this.results[i].resp.items.length;
                        let clamped = 5!=this.results[i].command.cat && numItems>LMS_INITIAL_SEARCH_RESULTS
                        let limit = clamped ? LMS_INITIAL_SEARCH_RESULTS : numItems;
                        let titleParam = clamped ? limit+" / "+numItems : numItems;
                        let filter = undefined;

                        total+=numItems;
                        if (1==this.results[i].command.cat) {
                            filter = FILTER_PREFIX+"artist";
                            items.push({title: i18np("1 Artist", "%1 Artists", titleParam), id:filter, header:true,
                                        allSearchResults: all, subtitle: i18np("1 Artist", "%1 Artists", numItems)});
                        } else if (2==this.results[i].command.cat) {
                            filter = FILTER_PREFIX+"album";
                            items.push({title: i18np("1 Album", "%1 Albums", titleParam), id:filter, header:true,
                                        allSearchResults: all, subtitle: i18np("1 Album", "%1 Albums", numItems),
                                        menu:[PLAY_ALL_ACTION, INSERT_ALL_ACTION, ADD_ALL_ACTION]});
                        } else if (3==this.results[i].command.cat) {
                            filter = FILTER_PREFIX+"track";
                            items.push({title: i18np("1 Track", "%1 Tracks", titleParam), id:filter, header:true,
                                        allSearchResults: all, subtitle: i18np("1 Track", "%1 Tracks", numItems),
                                        menu:[PLAY_ALL_ACTION, INSERT_ALL_ACTION, ADD_ALL_ACTION]});
                        } else if (4==this.results[i].command.cat) {
                            filter = FILTER_PREFIX+"playlist";
                            items.push({title: i18np("1 Playlist", "%1 Playlists", titleParam), id:filter, header:true,
                                        allSearchResults: all, subtitle: i18np("1 Playlist", "%1 Playlists", numItems),
                                        menu:[PLAY_ALL_ACTION, INSERT_ALL_ACTION, ADD_ALL_ACTION]});
                        } else if (5==this.results[i].command.cat) {
                            items.push({title: i18n("Search on..."), id:"search.other", header:true});
                        }
                        for (let idx=0, loop=this.results[i].resp.items; idx<numItems; ++idx) {
                            let itm = loop[idx];
                            itm.filter=filter;
                            if (idx<limit) {
                                items.push(itm);
                            }
                            if (clamped) {
                                all.push(itm);
                            }
                        }
                    }
                    bus.$emit('libSearchResults', item, {command:[], params:[]}, { items:items, baseActions:[], canUseGrid: false, jumplist:[]}, this.prevPage);
                }
                this.commands=[];
                this.results=[];
                this.searching=false;
            } else {
                let command = this.commands.shift();
                lmsList(5==command.cat && this.$store.state.player ? this.$store.state.player.id : "", command.command, command.params, 5==command.cat ? 1 : 0, LMS_SEARCH_LIMIT, false, seachReqId).then(({data}) => {
                    if (data.id == seachReqId && this.searching) {
                        let resp = parseBrowseResp(data, undefined, { artistImages: setLocalStorageVal('artistImages', true), isSearch:true});
                        if (5==command.cat) {
                            // Only want to show music sources...
                            let items = resp.items;
                            resp.items = [];
                            for (let i=0, len=items.length; i<len; ++i) {
                                if (SEARCH_OTHER.has(items[i].title)) {
                                    resp.items.push(items[i]);
                                }
                            }
                        }
                        if (resp.items.length>0) {
                            this.results.push({command:command, params:command.params, resp:resp});
                        }
                        this.doSearch();
                    }
                }).catch(err => {
                    this.doSearch();
                });
            }
        },
        i18n(str) {
            return i18n(str);
        }
    },
    beforeDestroy() {
        this.cancel();
        this.stopDebounce();
    },
    filters: {
        svgIcon: function (name, dark) {
            return "/material/svg/"+name+"?c="+(dark ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&r="+LMS_MATERIAL_REVISION;
        }
    }
})

