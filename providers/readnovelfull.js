// ReadNovelFull provider for readnovelfull.com
// Port of the original Kotlin ReadNovelFullProvider (QuickNovel).
// Listing/search/novel pages are plain HTML; the chapter list comes from
// the site's AJAX endpoint (single request, ?novelId=).

var rnfBaseUrl = "https://readnovelfull.com";

// Numeric novel id for the chapters AJAX endpoint. The app derives bookId
// from the novel URL slug, which is not the numeric id, so it is captured
// in novelInfo and consumed by chaptersApiUrl (info always runs first,
// one runtime per provider).
var rnfNovelId = null;

// Page requested by the last mainPageUrl/searchUrl call, used to detect
// the next page in searchResults (which only receives html).
var rnfPage = 1;

var rnfListings = [
  { name: "Most Popular", value: "most-popular-novel" },
  { name: "Latest Release", value: "latest-release-novel" },
  { name: "Hot Novel", value: "hot-novel" },
  { name: "Completed Novel", value: "completed-novel" }
];

function rnfFilterIndex(f, id, max) {
  var v = f ? f[id] : undefined;
  if (typeof v === "number" && v >= 0 && v < max) return v;
  return 0;
}

/// Inner HTML of the first <div ... id="..." ...>, balancing nested divs.
/// Returns null when the block cannot be located.
function rnfDivById(html, id) {
  var open = new RegExp(
    '<div[^>]*\\bid\\s*=\\s*["\']' + id + '["\'][^>]*>',
    "i"
  ).exec(html);
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

function rnfStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1) {
    return "ongoing";
  }
  if (s.indexOf("completed") !== -1 || s.indexOf("complete") !== -1) {
    return "completed";
  }
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1) return "dropped";
  return null;
}

function rnfParseItems(html) {
  var results = [];
  // Listing rows are sibling <div class="row"> blocks, each holding one
  // novel (cover / title / latest chapter). Splitting on the row marker
  // keeps every card whole regardless of nested divs.
  var rows = String(html).split('<div class="row">');
  for (var i = 1; i < rows.length; i++) {
    var seg = rows[i];
    var titleMatch = /<h3[^>]*class="[^"]*novel-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(seg);
    if (!titleMatch) continue;
    var imgTag = first(seg, /(<img[^>]*>)/);
    var cover = imgTag ? attr(imgTag, "src") : null;
    if (cover) cover = cover.replace("t-200x89", "t-300x439");
    var author = first(
      seg,
      /<span[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/span>/
    );
    var latest = first(
      seg,
      /<span[^>]*class="[^"]*chr-text[^"]*"[^>]*>([\s\S]*?)<\/span>/
    );
    results.push({
      title: textOf(titleMatch[2]),
      url: absUrl(rnfBaseUrl, titleMatch[1]),
      cover: cover ? absUrl(rnfBaseUrl, cover) : null,
      author: author ? textOf(author) : null,
      summary: null,
      rating: null,
      latestChapter: latest ? textOf(latest) : null
    });
  }
  var hasNextPage =
    html.indexOf("page=" + (rnfPage + 1)) !== -1 ||
    html.indexOf("page%3D" + (rnfPage + 1)) !== -1;
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "readnovelfull",
  name: "ReadNovelFull",
  baseUrl: rnfBaseUrl,
  lang: "en",
  version: "1.0.0",
  author: "noveldock",

  filters: [
    {
      type: "select",
      id: "listing",
      name: "Listing",
      options: rnfListings.map(function(o) { return o.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var listing =
      rnfListings[rnfFilterIndex(f, "listing", rnfListings.length)].value;
    rnfPage = page || 1;
    return (
      rnfBaseUrl + "/novel-list/" + listing +
      (rnfPage > 1 ? "?page=" + rnfPage : "")
    );
  },

  // --- Latest ---
  latestUrl: function(page) {
    rnfPage = page || 1;
    return (
      rnfBaseUrl + "/novel-list/latest-release-novel" +
      (rnfPage > 1 ? "?page=" + rnfPage : "")
    );
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    rnfPage = page || 1;
    return (
      rnfBaseUrl + "/novel-list/search?keyword=" +
      encodeURIComponent((query || "").trim()) +
      (rnfPage > 1 ? "&page=" + rnfPage : "")
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return rnfParseItems(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(rnfBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(html, /<h3 class="title"[^>]*>([\s\S]*?)<\/h3>/);
    if (!title) return empty;

    rnfNovelId = first(html, /data-novel-id="(\d+)"/);

    var author = null;
    var genres = [];
    var status = null;
    var metaBlock = first(
      html,
      /<ul[^>]*class="[^"]*info-meta[^"]*"[^>]*>([\s\S]*?)<\/ul>/
    );
    if (metaBlock) {
      var items = matchAll(metaBlock, /<li[^>]*>([\s\S]*?)<\/li>/g);
      for (var i = 0; i < items.length; i++) {
        var li = items[i][1];
        var label = textOf(first(li, /<h3[^>]*>([\s\S]*?)<\/h3>/) || "");
        if (label === "Author:") {
          author = textOf(first(li, /<a[^>]*>([\s\S]*?)<\/a>/) || "") || null;
        } else if (label === "Genre:") {
          var links = matchAll(li, /<a[^>]*>([\s\S]*?)<\/a>/g);
          for (var j = 0; j < links.length; j++) {
            var g = textOf(links[j][1]);
            if (g) genres.push(g);
          }
        } else if (label === "Status:") {
          status = rnfStatusOf(
            first(li, /<a[^>]*>([\s\S]*?)<\/a>/) || ""
          );
        }
      }
    }

    var rating = null;
    var rateVal = first(html, /id="rateVal"[^>]*value="([\d.]+)"/);
    if (!rateVal) rateVal = first(html, /value="([\d.]+)"[^>]*id="rateVal"/);
    if (rateVal) {
      var stars = parseFloat(rateVal);
      if (!isNaN(stars)) rating = Math.round(stars * 100);
    }

    var cover = first(
      html,
      /<div[^>]*class="[^"]*\bbook\b[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/
    );

    var description = first(
      html,
      /<div[^>]*class="[^"]*desc-text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );

    return {
      title: textOf(title),
      author: author,
      cover: cover ? absUrl(rnfBaseUrl, unescapeHtml(cover)) : null,
      status: status,
      genres: genres,
      description: description ? textOf(description) : "",
      chapters: [],
      rating: rating
    };
  },

  // --- Chapters (AJAX archive, all chapters in one request) ---
  chaptersApiUrl: function(bookId, page) {
    if ((page || 0) > 0) return null;
    if (!rnfNovelId) return null;
    return rnfBaseUrl + "/ajax/chapter-archive?novelId=" + rnfNovelId;
  },

  chapterList: function(html) {
    if (!html || typeof html !== "string") return [];
    var chapters = [];
    var items = matchAll(html, /<li[^>]*>([\s\S]*?)<\/li>/g);
    for (var i = 0; i < items.length; i++) {
      var li = items[i][1];
      var link = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(li);
      if (!link) continue;
      var name = first(li, /<span[^>]*>([\s\S]*?)<\/span>/) || link[2];
      name = textOf(name);
      if (!name) continue;
      chapters.push({
        name: name,
        url: absUrl(rnfBaseUrl, link[1])
      });
    }
    return chapters;
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var content = rnfDivById(html, "chr-content");
    if (!content) return out;
    content = content.replace(/\[Updated from[^\]]*\]/gi, "");
    if (!textOf(content)) return out;
    out.html = content;
    return out;
  }
});
