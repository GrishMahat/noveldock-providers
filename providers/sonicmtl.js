// SonicMTL provider for sonicmtl.com
// Port of the original Kotlin SonicMTLProvider (QuickNovel), a wp-manga
// (Madara) site. Browse/search are HTML listings; novel info is HTML; the
// chapter list is a POST to <novel-url>/ajax/chapters/ returning an HTML
// fragment (newest first); chapter text is div.text-left.

var snBaseUrl = "https://www.sonicmtl.com";

// Novel URL captured in novelInfoUrl (the chapter POST is derived from it;
// the engine's bookId is empty for trailing-slash novel URLs).
var snNovelUrl = null;

var snTags = [
  "", "action", "adventure", "comedy", "genre", "ecchi", "fantasy",
  "harem", "josei", "martial-arts", "gender-bender", "historical",
  "horror", "mature", "mecha", "mystery", "psychological", "romance",
  "school-life", "sci-fi", "seinen", "shoujo", "shounen", "slice-of-life",
  "sports", "supernatural", "tragedy", "wuxia", "xianxia", "xuanhuan"
];

var snTagNames = [
  "All", "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy",
  "Harem", "Josei", "Martial Arts", "Gender Bender", "Historical",
  "Horror", "Mature", "Mecha", "Mystery", "Psychological", "Romance",
  "School Life", "Sci-fi", "Seinen", "Shoujo", "Shounen", "Slice of Life",
  "Sports", "Supernatural", "Tragedy", "Wuxia", "Xianxia", "Xuanhuan"
];

var snOrders = [
  { name: "New", value: "new-manga" },
  { name: "Most Views", value: "views" },
  { name: "Trending", value: "trending" },
  { name: "Rating", value: "rating" },
  { name: "A-Z", value: "alphabet" },
  { name: "Latest", value: "latest" }
];

var snAdTexts = [
  "myboxnovel.com",
  "BoxNovel.Com",
  "Read latest Chapters at",
  "If you have problems with this website"
];

function snImage(block) {
  if (!block) return null;
  var img = first(block, /<img[^>]*data-src="([^"]+)"/);
  if (!img) img = first(block, /<img[^>]*src="([^"]+)"/);
  return img ? absUrl(snBaseUrl, unescapeHtml(img)) : null;
}

/// Inner HTML of <div ... class="...cls..." ...>, balancing nested divs.
function snDivByClass(html, cls) {
  var open = new RegExp(
    '<div[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>', "i"
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

function snStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("cancel") !== -1 || s.indexOf("drop") !== -1) return "dropped";
  return s;
}

function snIsComic(name) {
  return name && name.toLowerCase().indexOf("comic") !== -1;
}

/// Filter index from either a select int or a sort [index, ascending] pair.
function snIdx(v, len) {
  if (typeof v === "number" && v >= 0 && v < len) return v;
  if (v instanceof Array && typeof v[0] === "number" &&
    v[0] >= 0 && v[0] < len) return v[0];
  return 0;
}

/// Browse listing: div.page-item-detail cards (balanced). A Yoast
/// <link rel="next"> tag marks further pages.
function snParseBrowse(body) {
  var out = { results: [], hasNextPage: false };
  var rest = body;
  while (true) {
    var open = /<div[^>]*class="[^"]*page-item-detail[^"]*"[^>]*>/i.exec(rest);
    if (!open) break;
    var pos = open.index + open[0].length;
    var depth = 1;
    var tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = pos;
    var m;
    var end = -1;
    while ((m = tag.exec(rest)) !== null) {
      if (m[0].charAt(1) === "/") {
        depth--;
        if (depth === 0) {
          end = m.index;
          break;
        }
      } else if (m[0].charAt(m[0].length - 2) !== "/") {
        depth++;
      }
    }
    if (end === -1) break;
    var card = rest.substring(pos, end);
    rest = rest.substring(tag.lastIndex);
    var lm = /<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"/.exec(card);
    if (!lm || !lm[1]) continue;
    var name = textOf(unescapeHtml(lm[2] || ""));
    if (!name) {
      var t2 = /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/.exec(card);
      if (t2) name = textOf(t2[1]);
    }
    if (!name || snIsComic(name)) continue;
    out.results.push({
      title: name,
      url: absUrl(snBaseUrl, lm[1]),
      cover: snImage(card),
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  out.hasNextPage = out.results.length > 0 &&
    /<link[^>]*rel="next"[^>]*>/i.test(body);
  return out;
}

register({
  id: "sonicmtl",
  name: "SonicMTL",
  baseUrl: snBaseUrl,
  lang: "en",
  version: "1.0.0",

  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: snTagNames,
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: snOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var genreIdx = snIdx(f.genre, snTags.length);
    var orderIdx = snIdx(f.order, snOrders.length);
    var tag = snTags[genreIdx];
    var order = tag ? "novel-genre/" + tag : "novel";
    var orderBy = snOrders[orderIdx].value;
    var orderQuery = orderBy ? "?m_orderby=" + encodeURIComponent(orderBy) : "";
    return snBaseUrl + "/" + order + "/page/" + (page || 1) + "/" + orderQuery;
  },

  // --- Latest ---
  latestUrl: function(page) {
    return snBaseUrl + "/novel/page/" + (page || 1) + "/?m_orderby=latest";
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return snBaseUrl + "/?s=" + encodeURIComponent((query || "").trim()) +
      "&post_type=wp-manga";
  },

  searchResults: function(html) {
    var out = { results: [], hasNextPage: false };
    if (!html || typeof html !== "string") return out;
    var body = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "");
    if (body.indexOf("page-item-detail") !== -1) {
      return snParseBrowse(body);
    }
    // Search hits: div.c-tabs-item__content blocks (balanced).
    var rest = body;
    while (true) {
      var open = /<div[^>]*class="[^"]*c-tabs-item__content[^"]*"[^>]*>/i.exec(rest);
      if (!open) break;
      var pos = open.index + open[0].length;
      var depth = 1;
      var tag = /<\/?div\b[^>]*>/gi;
      tag.lastIndex = pos;
      var m;
      var end = -1;
      while ((m = tag.exec(rest)) !== null) {
        if (m[0].charAt(1) === "/") {
          depth--;
          if (depth === 0) {
            end = m.index;
            break;
          }
        } else if (m[0].charAt(m[0].length - 2) !== "/") {
          depth++;
        }
      }
      if (end === -1) break;
      var card = rest.substring(pos, end);
      rest = rest.substring(tag.lastIndex);
      var lm = /<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(card);
      if (!lm) continue;
      var name = textOf(lm[2]);
      if (!name || snIsComic(name)) continue;
      var rating = null;
      var rv = first(card, /<span[^>]*class="[^"]*total_votes[^"]*"[^>]*>([\d.]+)</);
      if (rv) {
        var f = parseFloat(rv);
        if (!isNaN(f)) rating = Math.round(f * 200);
      }
      out.results.push({
        title: name,
        url: absUrl(snBaseUrl, lm[1]),
        cover: snImage(card),
        author: null,
        summary: null,
        rating: rating,
        latestChapter: null
      });
    }
    return out;
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    snNovelUrl = absUrl(snBaseUrl, novelUrl) || novelUrl;
    return snNovelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;
    var body = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "");

    var rawTitle = first(body, /<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!rawTitle) return empty;
    var title = textOf(rawTitle).replace(/\s+/g, " ").trim();
    if (!title) return empty;

    var author = null;
    var authorBlock = first(body, /<div[^>]*class="[^"]*author-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (authorBlock) {
      var an = first(authorBlock, /<a[^>]*>([\s\S]*?)<\/a>/);
      if (an) author = textOf(an) || null;
    }

    var genres = [];
    var genreBlock = first(body, /<div[^>]*class="[^"]*genres-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (genreBlock) {
      var links = matchAll(genreBlock, /<a[^>]*>([\s\S]*?)<\/a>/g);
      for (var g = 0; g < links.length; g++) {
        var gt = textOf(links[g][1]);
        if (gt) genres.push(gt);
      }
    }

    var description = "";
    var summaryBlocks = matchAll(
      body,
      /<(?:div|section)[^>]*class="[^"]*summary__content[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/g
    );
    var paras = [];
    for (var s = 0; s < summaryBlocks.length; s++) {
      var ps = matchAll(summaryBlocks[s][1], /<p[^>]*>([\s\S]*?)<\/p>/g);
      for (var q = 0; q < ps.length; q++) {
        var t = textOf(ps[q][1]);
        if (t && t.indexOf(snBaseUrl) === -1 &&
          t.toLowerCase().indexOf("sonicmtl.com") === -1) {
          paras.push(t);
        }
      }
    }
    // Fallback selectors from the Kotlin provider.
    if (!paras.length) {
      var alt = matchAll(
        body,
        /<(?:div|section)[^>]*(?:id="editdescription"|class="[^"]*j_synopsis[^"]*")[^>]*>([\s\S]*?)<\/(?:div|section)>/g
      );
      for (var a2 = 0; a2 < alt.length; a2++) {
        var ps2 = matchAll(alt[a2][1], /<p[^>]*>([\s\S]*?)<\/p>/g);
        for (var q2 = 0; q2 < ps2.length; q2++) {
          var t2 = textOf(ps2[q2][1]);
          if (t2 && t2.indexOf(snBaseUrl) === -1 &&
            t2.toLowerCase().indexOf("sonicmtl.com") === -1) {
            paras.push(t2);
          }
        }
      }
    }
    description = paras.join("\n\n");

    var status = null;
    // Status value follows the "Status" heading inside div.post-status.
    var statusText = first(
      body,
      /<h5[^>]*>\s*Status\s*<\/h5>[\s\S]*?<div[^>]*class="[^"]*summary-content[^"]*"[^>]*>([^<]*)</
    );
    status = snStatusOf(statusText);

    var cover = null;
    var summaryImg = first(body, /<div[^>]*class="[^"]*summary_image[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (summaryImg) cover = snImage(summaryImg);

    var rating = null;
    var rate = first(body, /id="averagerate"[^>]*>([\d.]+)</);
    if (!rate) rate = first(body, /<span[^>]*id="averagerate"[^>]*>([\s\S]*?)<\/span>/);
    if (rate) {
      var rf = parseFloat(textOf(rate));
      if (!isNaN(rf)) rating = Math.round(rf * 200);
    }

    return {
      title: title,
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: description,
      chapters: [],
      rating: rating
    };
  },

  // --- Chapters (POST <novel-url>/ajax/chapters/, empty form body) ---
  chaptersApiConfig: function(bookId, page) {
    if ((page || 0) > 0) return null;
    if (!snNovelUrl) return null;
    var base = String(snNovelUrl).replace(/\/$/, "");
    return {
      url: base + "/ajax/chapters/",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: _utf8Bytes("")
    };
  },

  chapterList: function(data) {
    var text;
    if (typeof data === "string") {
      text = data.trim();
    } else if (data instanceof Array) {
      text = _utf8Decode(data, 0, data.length).trim();
    } else {
      return [];
    }
    if (!text) return [];
    // No lazy element-list parsing: <li> items cannot nest.
    var items = matchAll(
      text,
      /<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)<\/li>/g
    );
    var out = [];
    for (var i = items.length - 1; i >= 0; i--) {
      var li = items[i][1];
      var lm = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(li);
      if (!lm) continue;
      var name = textOf(lm[2]).replace(/\s+/g, " ").trim();
      if (!name) continue;
      out.push({
        name: name,
        url: absUrl(snBaseUrl, lm[1])
      });
    }
    return out;
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var body = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "");
    var content = snDivByClass(body, "text-left");
    if (!content) return out;
    if (!textOf(content)) return out;
    var parts = matchAll(content, /<p[^>]*>([\s\S]*?)<\/p>/g);
    var kept = [];
    for (var i = 0; i < parts.length; i++) {
      var inner = parts[i][1];
      var t = textOf(inner);
      if (!t) continue;
      var drop = false;
      for (var a = 0; a < snAdTexts.length; a++) {
        if (t.toLowerCase().indexOf(snAdTexts[a].toLowerCase()) !== -1) {
          drop = true;
          break;
        }
      }
      if (!drop) kept.push("<p>" + inner + "</p>");
    }
    out.html = kept.join("");
    return out;
  }
});
