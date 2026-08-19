// Syosetu provider for yomou.syosetu.com / ncode.syosetu.com
// Port of the original Kotlin SyosetuProvider (QuickNovel). The site now
// requires a genre in rank URLs (the Kotlin's bare /rank/genrelist/type/
// {order}_/ 404s); "all genres" is /rank/list/type/{order}_total/. Chapter
// lists are paginated at 100 per page on the novel page itself (?p=N);
// beyond the last page the server answers 404, so the app breaks its
// chapter loop (the app tolerates non-2xx chapter responses).
//
// NOTE: NOT registered in registry.json (excluded on purpose). The site is
// Japanese-only and the "Syosetu Plus" translator does not work yet, so this
// provider is of no use until translation is fixed. Keep the JS file here
// and re-add it to the registry once the translator works.

var baseUrl = "https://yomou.syosetu.com";
var ncodeUrl = "https://ncode.syosetu.com";

var syoSorts = [
  { name: "All Time", slug: "total" },
  { name: "Daily", slug: "daily" },
  { name: "Weekly", slug: "weekly" },
  { name: "Monthly", slug: "monthly" },
  { name: "Quarterly", slug: "quarter" },
  { name: "Yearly", slug: "yearly" }
];

var syoGenres = [
  { name: "All Genres", code: "" },
  { name: "Isekai Romance", code: "i1" },
  { name: "Isekai Fantasy", code: "i2" },
  { name: "Isekai Lit/SF/Other", code: "io" },
  { name: "Romance (Fantasy World)", code: "101" },
  { name: "Romance (Real World)", code: "102" },
  { name: "High Fantasy", code: "201" },
  { name: "Low Fantasy", code: "202" },
  { name: "Literary Fiction", code: "301" },
  { name: "Human Drama", code: "302" },
  { name: "Historical", code: "303" },
  { name: "Mystery", code: "304" },
  { name: "Horror", code: "305" },
  { name: "Action", code: "306" },
  { name: "Comedy", code: "307" },
  { name: "VR Game", code: "401" },
  { name: "Space", code: "402" },
  { name: "Science Fiction", code: "403" },
  { name: "Panic/Disaster", code: "404" },
  { name: "Fairy Tale", code: "9901" },
  { name: "Poetry", code: "9902" },
  { name: "Essay", code: "9903" },
  { name: "Other", code: "9999" }
];

/// Inner HTML of the element matched by [startRe], with balanced </div>
/// matching, or null when the start tag is missing.
function balancedDiv(html, startRe) {
  var m = startRe.exec(html);
  if (!m) return null;
  var i = m.index + m[0].length;
  var depth = 1;
  var k = i;
  while (k < html.length && depth > 0) {
    var o = html.indexOf("<div", k);
    var c = html.indexOf("</div>", k);
    if (o === -1 || (c !== -1 && c < o)) {
      depth--;
      k = c + 6;
    } else {
      depth++;
      k = o + 4;
    }
  }
  return depth === 0 ? html.substring(i, k - 6) : null;
}

/// Strip ad/noise divs (class containing c-ad, p-novel__parent,
/// p-novel__action, p-novel__number, novel_bn) with balanced removal at any depth.
function stripNoiseDivs(html) {
  var re = /<div[^>]*class="[^"]*(?:c-ad|p-novel__parent|p-novel__action|p-novel__number|novel_bn)[^"]*"[^>]*>/;
  while (true) {
    var m = re.exec(html);
    if (!m) return html;
    var i = m.index + m[0].length;
    var depth = 1;
    var k = i;
    while (k < html.length && depth > 0) {
      var o = html.indexOf("<div", k);
      var c = html.indexOf("</div>", k);
      if (o === -1 || (c !== -1 && c < o)) {
        depth--;
        k = c + 6;
      } else {
        depth++;
        k = o + 4;
      }
    }
    html = html.substring(0, m.index) + html.substring(k);
  }
}

function rankUrl(orderSlug, genreCode, page) {
  if (!genreCode) {
    return baseUrl + "/rank/list/type/" + orderSlug + "_total/?p=" + page;
  }
  if (genreCode.charAt(0) === "i") {
    return baseUrl + "/rank/isekailist/type/" + orderSlug + "_" +
      genreCode.substring(1) + "/?p=" + page;
  }
  return baseUrl + "/rank/genrelist/type/" + orderSlug + "_" + genreCode +
    "/?p=" + page;
}

/// A "次の50作品へ" <a> (anchor) in the c-pager means there is a next page;
/// on the last page it is a disabled <span> instead.
function hasNextRankPage(html) {
  return /<a[^>]*class="c-pager__item"[^>]*title="次の50作品へ"/.test(html);
}

function parseRankList(html) {
  var results = [];
  var cards = matchAll(html, /<div class="p-ranklist-item__title">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
  for (var i = 0; i < cards.length; i++) {
    var title = textOf(cards[i][2]);
    if (!title) continue;
    results.push({
      title: title,
      url: absUrl(baseUrl, cards[i][1]),
      cover: "",
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  return { results: results, hasNextPage: hasNextRankPage(html) };
}

register({
  id: "syosetu",
  name: "Syosetu",
  baseUrl: baseUrl,
  lang: "ja",
  nsfw: false,
  version: "1.0.0",

  // Site search is keyword-only; there is no separate latest list (the
  // browse page covers rankings), and keyword search is not paginated.
  flags: { searchFilters: false },

  filters: [
    {
      type: "sort",
      id: "sort",
      name: "Ranking period",
      options: syoSorts.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: syoGenres.map(function(g) { return g.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var sortIndex = 0;
    var genreIndex = 0;
    if (f.sort instanceof Array && f.sort.length >= 1 && typeof f.sort[0] === "number") {
      sortIndex = f.sort[0];
    }
    if (typeof f.genre === "number") genreIndex = f.genre;
    if (sortIndex < 0 || sortIndex >= syoSorts.length) sortIndex = 0;
    if (genreIndex < 0 || genreIndex >= syoGenres.length) genreIndex = 0;
    return rankUrl(syoSorts[sortIndex].slug, syoGenres[genreIndex].code, page || 1);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return baseUrl + "/search.php?search_type=novel&word=" +
      encodeURIComponent((query || "").trim()) + "&order=hyoka";
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    // Browse (rank) pages share parseSearchResults with search pages.
    if (html.indexOf("p-ranklist-item__title") !== -1) {
      return parseRankList(html);
    }
    var results = [];
    var boxes = matchAll(html, /<div class="searchkekka_box">([\s\S]*?)<\/div>\s*<\/div>/g);
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i][1];
      var href = first(box, /<div class="novel_h">\s*<a[^>]*href="([^"]+)"/);
      var title = first(box, /<div class="novel_h">\s*<a[^>]*>([\s\S]*?)<\/a>/);
      if (!href || !title) continue;
      results.push({
        title: textOf(title),
        url: absUrl(baseUrl, href),
        cover: "",
        author: null,
        summary: null,
        rating: null,
        latestChapter: null
      });
    }
    return { results: results, hasNextPage: false };
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return (novelUrl || "").replace(baseUrl, ncodeUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var title = first(html, /<h1 class="p-novel__title"[^>]*>([\s\S]*?)<\/h1>/);
    if (!title) title = first(html, /<div class="novel_title"[^>]*>([\s\S]*?)<\/div>/);
    title = title ? textOf(title) : "";

    var author = null;
    var a = first(html, /<div class="p-novel__author"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    if (!a) a = first(html, /<div class="novel_writername"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    if (a) author = textOf(a);

    var description = "";
    var d = first(html, /<div id="novel_ex" class="p-novel__summary">([\s\S]*?)<\/div>/);
    if (d) description = textOf(d);

    // The current layout no longer marks the type; Kotlin's selectors
    // (.p-novel__type, #noveltype_notend) still exist on old layouts.
    var status = "ongoing";
    var st = first(html, /<span class="p-novel__type"[^>]*>([\s\S]*?)<\/span>/);
    if (!st) st = first(html, /id="noveltype_notend"[^>]*>([\s\S]*?)</);
    if (st && /完結/.test(st)) status = "complete";

    // Tags: .p-novel__tag a (or old-layout .novel_key a); the current
    // layout only carries the keyword list in og:description.
    var genres = [];
    var tagAs = matchAll(html, /class="p-novel__tag"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g);
    if (tagAs.length === 0) {
      tagAs = matchAll(html, /class="novel_key"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g);
    }
    for (var i = 0; i < tagAs.length; i++) {
      var t = textOf(tagAs[i][1]);
      if (t) genres.push(t);
    }
    if (genres.length === 0) {
      var og = first(html, /property="og:description" content="([^"]*)"/);
      if (og) {
        var parts = og.split(/[\s　]+/);
        for (var gi = 0; gi < parts.length; gi++) {
          if (parts[gi]) genres.push(parts[gi]);
        }
      }
    }

    return {
      title: title,
      author: author,
      cover: "",
      status: status,
      genres: genres,
      description: description,
      chapters: [],
      rating: null,
    };
  },

  // --- Chapters (paginated list on the novel page, 100 per page) ---
  chaptersApiUrl: function(bookId, page) {
    if (!bookId) return null;
    var url = ncodeUrl + "/" + bookId + "/";
    if (page > 0) url += "?p=" + (page + 1);
    return url;
  },

  chapterList: function(html) {
    if (!html || typeof html !== "string") return [];
    var chapters = [];
    var items = matchAll(html, /<div class="p-eplist__sublist">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
    for (var i = 0; i < items.length; i++) {
      var name = textOf(items[i][2]);
      if (!name) continue;
      chapters.push({
        name: name,
        url: absUrl(ncodeUrl, items[i][1])
      });
    }
    return chapters;
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    if (!html || typeof html !== "string") {
      return { html: "", images: [] };
    }
    var inner = balancedDiv(html, /<div class="p-novel__body"[^>]*>/);
    if (inner === null) return { html: "", images: [] };
    inner = stripNoiseDivs(inner);
    return { html: inner, images: [] };
  }
});