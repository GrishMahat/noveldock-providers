// LuxonScans provider for lunoxscans.com
// Madara (wp-manga) theme with a custom chapter grid: browse/search/novel
// pages are plain HTML, free chapters carry real links in
// a.lunox-chapter-item.free, chapter text lives in div.text-left.

var lxBaseUrl = "https://lunoxscans.com";

var lxTags = [
  { name: "All", value: "" },
  { name: "Action", value: "action" },
  { name: "Adult", value: "adult" },
  { name: "Adventure", value: "adventure" },
  { name: "Chaebol", value: "chaebol" },
  { name: "Comedy", value: "comedy" },
  { name: "Drama", value: "drama" },
  { name: "Fantasy", value: "fantasy" },
  { name: "Growth", value: "growth" },
  { name: "Harem", value: "harem" },
  { name: "Historical", value: "historical" },
  { name: "Horror", value: "horror" },
  { name: "Isekai", value: "isekai" },
  { name: "Josei", value: "josei" },
  { name: "Magic", value: "magic" },
  { name: "Martial Arts", value: "martial-arts" },
  { name: "Mature", value: "mature" },
  { name: "Mecha", value: "mecha" },
  { name: "Modern", value: "modern" },
  { name: "Mystery", value: "mystery" },
  { name: "Possession", value: "possession" },
  { name: "Psychological", value: "psychological" },
  { name: "Regression", value: "regression" },
  { name: "Reincarnation", value: "reincarnation" },
  { name: "Revenge", value: "revenge" },
  { name: "Reverse", value: "reverse" },
  { name: "Romance", value: "romance" },
  { name: "Royalty", value: "royalty" },
  { name: "School Life", value: "school-life" },
  { name: "Sci-fi", value: "sci-fi" },
  { name: "Seinen", value: "seinen" },
  { name: "Shoujo", value: "shoujo" },
  { name: "Shounen", value: "shounen" },
  { name: "Slice of Life", value: "slice-of-life" },
  { name: "Sports", value: "sports" },
  { name: "Supernatural", value: "supernatural" },
  { name: "Tragedy", value: "tragedy" },
  { name: "Warrior", value: "warrior" },
  { name: "Wuxia", value: "wuxia" }
];

var lxOrders = [
  { name: "Default", value: "" },
  { name: "New", value: "new-manga" },
  { name: "Most Views", value: "views" },
  { name: "Trending", value: "trending" },
  { name: "Rating", value: "rating" },
  { name: "A-Z", value: "alphabet" },
  { name: "Latest", value: "latest" }
];

/// Inner HTML of the first <div ... class="...cls...">, balancing nested
/// divs. Returns null when the block cannot be located.
function lxDivByClass(html, cls) {
  var open = new RegExp(
    '<div[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>',
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

function lxStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1 ||
      s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1 || s.indexOf("cancel") !== -1) return "dropped";
  return s;
}

function lxCoverOf(src) {
  if (!src) return null;
  if (/^data:/i.test(src)) return null;
  return absUrl(lxBaseUrl, unescapeHtml(src));
}

/// Parse Madara listing cards (div.page-item-detail). Chunks are delimited
/// by the next card start, so nested divs cannot truncate the match.
function lxParseItems(html) {
  var results = [];
  var chunks = String(html).split('<div class="page-item-detail');
  for (var i = 1; i < chunks.length; i++) {
    var card = chunks[i];
    var aOpen = first(
      card,
      /<div[^>]*class="[^"]*item-thumb[^"]*"[^>]*>[\s\S]*?(<a[^>]*>)/
    );
    var href = aOpen ? attr(aOpen, "href") : null;
    var nameAttr = aOpen ? attr(aOpen, "title") : null;
    var title = first(
      card,
      /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    );
    if (!href) continue;
    var label = title && textOf(title) ? textOf(title) :
      (nameAttr ? textOf(unescapeHtml(nameAttr)) : "");
    if (!label) continue;
    var img = first(card, /(<img[^>]*>)/);
    var cover = img ? attr(img, "data-src") || attr(img, "src") : null;
    var latest = first(
      card,
      /<div[^>]*class="[^"]*chapter-item[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    );
    results.push({
      title: label,
      url: absUrl(lxBaseUrl, unescapeHtml(href)),
      cover: lxCoverOf(cover),
      author: null,
      summary: null,
      rating: null,
      latestChapter: latest ? textOf(latest) : null
    });
  }
  var hasNextPage = /rel="next"/i.test(html) ||
    /class="[^"]*nextpostslink[^"]*"/i.test(html);
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "luxonscans",
  name: "LuxonScans",
  baseUrl: lxBaseUrl,
  lang: "en",
  version: "1.0.0",

  filters: [
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: lxTags.map(function(t) { return t.name; }),
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: lxOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var genreIdx = typeof f.genre === "number" &&
      f.genre >= 0 && f.genre < lxTags.length ? f.genre : 0;
    var orderIdx = typeof f.order === "number" &&
      f.order >= 0 && f.order < lxOrders.length ? f.order : 0;
    var tag = lxTags[genreIdx].value;
    var order = lxOrders[orderIdx].value;
    var section = tag ? "series-genre/" + tag : "all-series";
    var url = lxBaseUrl + "/" + section + "/page/" + (page || 1) + "/";
    if (order) url += "?m_orderby=" + order;
    return url;
  },

  // --- Latest ---
  latestUrl: function(page) {
    return lxBaseUrl + "/all-series/page/" + (page || 1) +
      "/?m_orderby=latest";
  },

  // --- Search ---
  searchUrl: function(query) {
    return lxBaseUrl + "/?s=" +
      encodeURIComponent((query || "").trim()).replace(/%20/g, "+") +
      "&post_type=wp-manga";
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return lxParseItems(html);
  },

  // --- Novel Info (free chapters included; no chapter API) ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(lxBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!title || !textOf(title)) return empty;

    var authorBlock = first(
      html,
      /<div[^>]*class="[^"]*author-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    var author = authorBlock
      ? textOf(first(authorBlock, /<a[^>]*>([\s\S]*?)<\/a>/i) || "")
      : "";

    var coverBlock = first(
      html,
      /<div[^>]*class="[^"]*summary_image[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    var coverImg = coverBlock ? first(coverBlock, /(<img[^>]*>)/) : null;
    var cover = coverImg
      ? attr(coverImg, "data-src") || attr(coverImg, "src")
      : null;

    var descBlock = lxDivByClass(html, "summary__content");
    var description = "";
    if (descBlock) {
      description = textOf(
        descBlock.replace(/<script[\s\S]*?<\/script>/gi, "")
      );
    }

    var genres = [];
    var genreBlock = first(
      html,
      /<div[^>]*class="[^"]*genres-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (genreBlock) {
      var links = matchAll(genreBlock, /<a[^>]*>([\s\S]*?)<\/a>/gi);
      for (var i = 0; i < links.length; i++) {
        var g = textOf(links[i][1]);
        if (g) genres.push(g);
      }
    }

    var status = first(
      html,
      /<h5>\s*Status\s*<\/h5>\s*<\/div>\s*<div[^>]*class="[^"]*summary-content[^"]*"[^>]*>\s*([^<]*)/i
    );

    var rating = null;
    var ratingText = first(html, /id="averagerate">([^<]*)/i);
    if (ratingText) {
      var stars = parseFloat(ratingText.trim());
      if (!isNaN(stars)) rating = Math.round(stars * 200);
    }

    // Free chapters only (premium/coin chapters link to "#").
    var chapters = [];
    var anchors = matchAll(
      html,
      /(<a[^>]*class="[^"]*lunox-chapter-item[^"]*"[^>]*>)/gi
    );
    for (var j = anchors.length - 1; j >= 0; j--) {
      var a = anchors[j][1];
      if (a.indexOf("premium") !== -1) continue;
      var href = attr(a, "href");
      if (!href || href === "#") continue;
      var name = attr(a, "data-name") || ("Chapter " + href);
      chapters.push({
        name: textOf(name),
        url: absUrl(lxBaseUrl, unescapeHtml(href))
      });
    }

    return {
      title: textOf(unescapeHtml(title)),
      author: author ? textOf(unescapeHtml(author)) : null,
      cover: lxCoverOf(cover),
      status: lxStatusOf(status || ""),
      genres: genres,
      description: description,
      chapters: chapters,
      rating: rating
    };
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var content = lxDivByClass(html, "text-left");
    if (!content) return out;
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    if (!textOf(content)) return out;
    out.html = content;
    return out;
  }
});
