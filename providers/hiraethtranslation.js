// HiraethTranslation provider for hiraethtranslation.com
// Madara (wp-manga) theme: browse/search/novel pages are plain HTML,
// chapters are listed on the novel page (free chapters only), chapter
// text lives in div.text-left.

var htBaseUrl = "https://hiraethtranslation.com";

var htOrders = [
  { name: "Latest Release", value: "latest" },
  { name: "Relevance", value: "" },
  { name: "A-Z", value: "alphabet" },
  { name: "Rating", value: "rating" },
  { name: "Trending", value: "trending" },
  { name: "Most Views", value: "views" },
  { name: "New", value: "new-manga" }
];

/// Inner HTML of the first <div ... class="...cls...">, balancing nested
/// divs. Returns null when the block cannot be located.
function htDivByClass(html, cls) {
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

function htStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1 ||
      s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1 || s.indexOf("cancel") !== -1) return "dropped";
  return s;
}

function htCoverOf(src) {
  if (!src) return null;
  if (/^data:/i.test(src)) return null;
  return absUrl(htBaseUrl, unescapeHtml(src));
}

/// Parse Madara search/browse rows (div.row.c-tabs-item__content).
/// Row chunks are delimited by the next row start, so nested divs cannot
/// truncate the match.
function htParseRows(html) {
  var results = [];
  var chunks = String(html).split('<div class="row c-tabs-item__content">');
  for (var i = 1; i < chunks.length; i++) {
    var card = chunks[i];
    var link = first(
      card,
      /<h3[^>]*class="[^"]*\bh4\b[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"/
    );
    var title = first(
      card,
      /<h3[^>]*class="[^"]*\bh4\b[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    );
    if (!link || !title || !textOf(title)) continue;
    var img = first(card, /(<img[^>]*>)/);
    var cover = img ? attr(img, "data-src") || attr(img, "src") : null;
    var latest = first(
      card,
      /<div[^>]*class="[^"]*latest-chap[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    );
    results.push({
      title: textOf(unescapeHtml(title)),
      url: absUrl(htBaseUrl, unescapeHtml(link)),
      cover: htCoverOf(cover),
      author: null,
      summary: null,
      rating: null,
      latestChapter: latest ? textOf(latest) : null
    });
  }
  var hasNextPage = /rel="next"/i.test(html) ||
    /class="[^"]*\bnext\b[^"]*"[^>]*>\s*Next/i.test(html);
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "hiraethtranslation",
  name: "HiraethTranslation",
  baseUrl: htBaseUrl,
  lang: "en",
  version: "1.0.0",

  filters: [
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: htOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var idx = typeof f.order === "number" &&
      f.order >= 0 && f.order < htOrders.length ? f.order : 0;
    return htBaseUrl + "/page/" + (page || 1) +
      "/?s&post_type=wp-manga&m_orderby=" + htOrders[idx].value;
  },

  // --- Latest ---
  latestUrl: function(page) {
    return htBaseUrl + "/page/" + (page || 1) +
      "/?s&post_type=wp-manga&m_orderby=latest";
  },

  // --- Search ---
  searchUrl: function(query) {
    return htBaseUrl + "/?s=" +
      encodeURIComponent((query || "").trim()).replace(/%20/g, "+") +
      "&post_type=wp-manga";
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return htParseRows(html);
  },

  // --- Novel Info (chapters included; no chapter API) ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(htBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(
      html,
      /<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i
    );
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

    var descBlock = htDivByClass(html, "summary__content");
    var description = "";
    if (descBlock) {
      var clean = descBlock
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<div[^>]*class=['"]code-block[\s\S]*?clear:\s*both;['"][^>]*>/gi, "");
      description = textOf(clean);
    }

    var genres = [];
    var tagsBlock = first(
      html,
      /<div[^>]*class="[^"]*tags-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (tagsBlock) {
      var links = matchAll(tagsBlock, /<a[^>]*>([\s\S]*?)<\/a>/gi);
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

    // Free chapters only (locked/coin chapters cannot be read).
    var chapters = [];
    var items = matchAll(
      html,
      /(<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[^>]*>[\s\S]*?<\/li>)/gi
    );
    for (var j = items.length - 1; j >= 0; j--) {
      var li = items[j][1];
      if (li.indexOf("free-chap") === -1) continue;
      var href = first(li, /<a[^>]*href="([^"]+)"/i);
      var name = first(li, /<a[^>]*>([\s\S]*?)<\/a>/i);
      if (!href || !name || !textOf(name)) continue;
      chapters.push({
        name: textOf(name),
        url: absUrl(htBaseUrl, unescapeHtml(href))
      });
    }

    return {
      title: textOf(unescapeHtml(title)),
      author: author ? textOf(unescapeHtml(author)) : null,
      cover: htCoverOf(cover),
      status: htStatusOf(status || ""),
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
    var content = htDivByClass(html, "text-left");
    if (!content) return out;
    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<div[^>]*class=['"]code-block[\s\S]*?clear:\s*both;['"][^>]*>/gi, "");
    // Same cleanup as the Kotlin provider (watermark + mirror link).
    content = content.split("\uD835\uDCF5\uD835\uDC8A\uD835\uDC83\uD835\uDE67\uD835\uDE5A\uD835\uDC82\uD835\uDCED.\uD835\uDCEC\uD835\uDE64\uD835\uDE62").join("");
    content = content.split("libread.com").join("");
    if (!textOf(content)) return out;
    out.html = content;
    return out;
  }
});
