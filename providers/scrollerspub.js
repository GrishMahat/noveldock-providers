// ScrollersPub provider for scrollerspub.com
// Port of the original Kotlin ScrollersPubProvider (QuickNovel).
//
// Browse/search run on the site's JSON API (/api/novels); novel info is
// parsed from the novel page's JSON-LD (the page itself is an SPA shell),
// chapter text from plain HTML (div#chapter-content). Chapters come from
// /api/novel/<uuid>/chapters — the uuid is embedded in the novel cover URL
// (og:image / JSON-LD image), captured during novelInfo.

var spBaseUrl = "https://www.scrollerspub.com";
var spApiUrl = "https://www.scrollerspub.com/api";

// Novel uuid captured from the cover URL during novelInfo; the chapters
// endpoint is keyed by uuid while novel URLs only carry the slug.
var spNovelId = null;

var spStatuses = [
  { name: "All", value: "" },
  { name: "Ongoing", value: "ongoing" },
  { name: "Completed", value: "completed" }
];

var spOrders = [
  { name: "Most Popular", value: "popular" },
  { name: "Latest Updates", value: "updated" },
  { name: "Newest", value: "new" },
  { name: "Rating", value: "rating" }
];

var spTags = [
  "", "fantasy", "action", "romance", "adventure", "comedy",
  "transmigration", "system", "reincarnation", "magic", "cultivation",
  "slice-of-life", "drama", "mystery", "supernatural", "revenge",
  "martial-arts", "sci-fi", "survival", "academy", "harem", "historical",
  "psychological", "eastern", "superpowers", "monsters"
];

var spTagNames = [
  "All", "Fantasy", "Action", "Romance", "Adventure", "Comedy",
  "Transmigration", "System", "Reincarnation", "Magic", "Cultivation",
  "Slice Of Life", "Drama", "Mystery", "Supernatural", "Revenge",
  "Martial Arts", "Sci-Fi", "Survival", "Academy", "Harem", "Historical",
  "Psychological", "Eastern", "Superpowers", "Monsters"
];

function spFixCover(path) {
  if (!path) return null;
  path = unescapeHtml(path);
  if (path.indexOf("http://") === 0 || path.indexOf("https://") === 0) return path;
  return spBaseUrl + "/static/" + path.replace(/^\//, "");
}

/// Filter index from either a select int or a sort [index, ascending] pair.
function spIdx(v, len) {
  if (typeof v === "number" && v >= 0 && v < len) return v;
  if (v instanceof Array && typeof v[0] === "number" &&
    v[0] >= 0 && v[0] < len) return v[0];
  return 0;
}

function spParseNovelApi(text) {
  var out = { results: [], hasNextPage: false };
  var data;
  try {
    data = JSON.parse(typeof text === "string" ? text.trim() : "");
  } catch (e) {
    return out;
  }
  if (!data) return out;
  var items = data.items || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.title || !item.slug) continue;
    var latestChapter = null;
    if (typeof item.chapter_count === "number") {
      latestChapter = item.chapter_count + " Chapters";
    }
    out.results.push({
      title: item.title,
      url: spBaseUrl + "/novel/" + item.slug,
      cover: spFixCover(item.cover_url || item.cover_file),
      author: null,
      summary: null,
      rating: null,
      latestChapter: latestChapter
    });
  }
  if (typeof data.total === "number" && typeof data.limit === "number" &&
    typeof data.offset === "number") {
    out.hasNextPage = data.offset + data.limit < data.total;
  }
  return out;
}

/// Inner HTML of <div ... id="chapter-content" ...>, balancing nested divs.
function spContentDiv(html) {
  var open = /<div[^>]*id="chapter-content"[^>]*>/i.exec(html);
  if (!open) return null;
  var pos = open.index + open[0].length;
  var depth = 1;
  var tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = pos;
  var m;
  while ((m = tag.exec(html)) !== null) {
    if (m[0].charAt(1) === "/") {
      depth--;
      if (depth === 0) return html.substring(pos, m.index);
    } else if (m[0].charAt(m[0].length - 2) !== "/") {
      depth++;
    }
  }
  return null;
}

/// Remove a <tag ... attr-match ...>...</tag> block, balancing nesting of
/// the same tag. Used for ad containers that nest divs.
function spStripTagBlock(html, tag, attrRe) {
  var openRe = new RegExp("<" + tag + "[^>]*" + attrRe + "[^>]*>", "i");
  while (true) {
    var m = openRe.exec(html);
    if (!m) return html;
    var pos = m.index + m[0].length;
    var depth = 1;
    var tagRe = new RegExp("</?" + tag + "\\b[^>]*>", "gi");
    tagRe.lastIndex = pos;
    var t;
    var end = -1;
    while ((t = tagRe.exec(html)) !== null) {
      if (t[0].charAt(1) === "/") {
        depth--;
        if (depth === 0) {
          end = t.index + t[0].length;
          break;
        }
      } else if (t[0].charAt(t[0].length - 2) !== "/") {
        depth++;
      }
    }
    if (end === -1) return html;
    html = html.substring(0, m.index) + html.substring(end);
  }
}

/// Shared cleanup for chapter markup (ads, scripts, frames).
function spCleanContent(content) {
  content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[\s\S]*?<\/style>/gi, "");
  content = content.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  content = spStripTagBlock(content, "div", "align=[^>]*center");
  content = spStripTagBlock(content, "div", "id=[^>]*frame");
  content = spStripTagBlock(content, "div", "(class|id)=[^>]*ads");
  return content;
}

/// Site chapter URLs are `/read/<chapter-uuid>` but the SPA renders the text
/// from a JSON API; the /read page itself is an app shell with no prose.
/// Returns the API URL for a /read/ URL, or null for anything else.
function spChapterApiUrl(chapterUrl) {
  var id = /\/(?:read|chapter)\/([0-9a-fA-F-]{36})/.exec(chapterUrl || "");
  if (!id) return null;
  return spApiUrl + "/chapter/" + encodeURIComponent(id[1]) + "/read?mark=false";
}

/// Chapter body from the JSON API: {content: "<p>...</p>", chapter: {...}}.
/// Returns null when [data] is not JSON (caller then tries the DOM path).
function spContentFromApi(data) {
  if (typeof data !== "string") return null;
  var text = data.trim();
  if (text.charAt(0) !== "{") return null;
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed.content !== "string" || !parsed.content.trim()) {
    return null;
  }
  var out = { html: "", images: [] };
  var content = spCleanContent(parsed.content);
  var imgs = matchAll(content, /<img[^>]*src="([^"]*)"/g);
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i][1]) {
      out.images.push({ url: absUrl(spBaseUrl, imgs[i][1]) || imgs[i][1], alt: null });
    }
  }
  out.html = content;
  return out;
}

register({
  id: "scrollerspub",
  name: "ScrollersPub",
  baseUrl: spBaseUrl,
  lang: "en",
  version: "1.0.0",

  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "status",
      name: "Status",
      options: spStatuses.map(function(o) { return o.name; }),
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: spOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "tag",
      name: "Tag",
      options: spTagNames,
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var statusIdx = spIdx(f.status, spStatuses.length);
    var orderIdx = spIdx(f.order, spOrders.length);
    var tagIdx = spIdx(f.tag, spTags.length);
    var limit = 20;
    var offset = ((page || 1) - 1) * limit;
    var url = spApiUrl + "/novels?search=&offset=" + offset + "&limit=" + limit +
      "&domain=&tag=" + encodeURIComponent(spTags[tagIdx]) +
      "&sort_by=" + encodeURIComponent(spOrders[orderIdx].value);
    var status = spStatuses[statusIdx].value;
    if (status) url += "&status=" + encodeURIComponent(status);
    return url;
  },

  // --- Latest ---
  latestUrl: function(page) {
    var limit = 20;
    var offset = ((page || 1) - 1) * limit;
    return spApiUrl + "/novels?search=&offset=" + offset + "&limit=" + limit +
      "&domain=&tag=&sort_by=updated";
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return spApiUrl + "/novels?search=" +
      encodeURIComponent((query || "").trim()) +
      "&offset=0&limit=20&domain=";
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return spParseNovelApi(html);
  },

  // --- Novel Info (JSON-LD embedded in the SPA shell) ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(spBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;
    spNovelId = null;

    var blob = first(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    var ld = null;
    if (blob) {
      try {
        var parsed = JSON.parse(blob);
        if (parsed instanceof Array) {
          for (var i = 0; i < parsed.length; i++) {
            var t = parsed[i] && parsed[i]["@type"];
            var types = t instanceof Array ? t : [t];
            if (types.indexOf("Book") !== -1) {
              ld = parsed[i];
              break;
            }
          }
          if (!ld) ld = parsed[0];
        } else {
          ld = parsed;
        }
      } catch (e) {
        ld = null;
      }
    }
    if (!ld) return empty;

    var title = ld.name || first(html, /<meta property="og:title" content="([^"]*)"/) || "";
    title = String(title).replace(/ - Read Online Free.*$/, "").trim();

    var author = null;
    if (ld.author) {
      var authors = ld.author instanceof Array ? ld.author : [ld.author];
      var names = [];
      for (var a = 0; a < authors.length; a++) {
        var entry = authors[a];
        var n = typeof entry === "string" ? entry : entry.name;
        if (n) names.push(n);
      }
      if (names.length) author = names.join(", ");
    }

    var cover = spFixCover(ld.image ||
      first(html, /<meta property="og:image" content="([^"]*)"/));
    if (cover) {
      var uuid = first(cover, /\/static\/novels\/([0-9a-fA-F-]{36})\//);
      if (uuid) spNovelId = uuid;
    }

    var description = "";
    if (ld.description) description = textOf(String(ld.description));

    var rating = null;
    if (ld.aggregateRating) {
      var rv = parseFloat(ld.aggregateRating.ratingValue);
      var best = parseFloat(ld.aggregateRating.bestRating) || 5;
      if (!isNaN(rv) && best > 0) rating = Math.round((rv / best) * 1000);
    }

    // Status and genres only exist in the details JSON API, which the
    // novel-info step cannot fetch (single-response contract).
    return {
      title: title,
      author: author,
      cover: cover,
      status: null,
      genres: [],
      description: description,
      chapters: [],
      rating: rating
    };
  },

  // --- Chapters (JSON API keyed by the uuid captured in novelInfo) ---
  chaptersApiUrl: function(bookId, page) {
    if (!spNovelId) return null;
    var p = page || 0;
    var limit = 500;
    return spApiUrl + "/novel/" + encodeURIComponent(spNovelId) +
      "/chapters?limit=" + limit + "&offset=" + (p * limit);
  },

  chapterList: function(data) {
    var text = typeof data === "string" ? data.trim() : "";
    if (!text) return [];
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return [];
    }
    var items = (parsed && parsed.items) || [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item.id) continue;
      var name = item.title && String(item.title).trim() ?
        String(item.title).trim() : "Chapter " + (item.serial || (i + 1));
      out.push({
        name: name,
        url: spBaseUrl + "/read/" + item.id
      });
    }
    return out;
  },

  // --- Chapter Content ---
  // The /read/<uuid> page is a React shell (no prose in the HTML), so the
  // reader/downloader is pointed at the JSON API the SPA itself calls.
  chapterContentUrl: function(chapterUrl) {
    return spChapterApiUrl(chapterUrl) || chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    // JSON API response (normal path).
    var fromApi = spContentFromApi(html);
    if (fromApi) return fromApi;
    // Fallback: server-rendered HTML with div#chapter-content.
    var content = spContentDiv(html);
    if (!content) return out;
    out.html = spCleanContent(content);
    return out;
  }
});
