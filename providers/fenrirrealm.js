// FenrirRealm provider for fenrirealm.com
// Search/browse/chapters/chapter-text run on the site's JSON API
// (/api/new/v2/series...); novel info is parsed from the novel page HTML
// (server-rendered h1/status/genres/synopsis plus og:image cover).

var frBaseUrl = "https://fenrirealm.com";
var frApiUrl = "https://fenrirealm.com/api/new/v2/series";

var frStatuses = [
  { name: "All", value: "any" },
  { name: "Completed", value: "completed" },
  { name: "Ongoing", value: "on-going" }
];

var frOrders = [
  { name: "Popular", value: "popular" },
  { name: "Latest", value: "latest" },
  { name: "Updated", value: "updated" }
];

var frGenres = [
  { name: "All", value: "0" },
  { name: "Action", value: "1" },
  { name: "Adult", value: "2" },
  { name: "Adventure", value: "3" },
  { name: "Comedy", value: "4" },
  { name: "Drama", value: "5" },
  { name: "Ecchi", value: "6" },
  { name: "Fantasy", value: "7" },
  { name: "Gender Bender", value: "8" },
  { name: "Harem", value: "9" },
  { name: "Historical", value: "10" },
  { name: "Horror", value: "11" },
  { name: "Josei", value: "12" },
  { name: "Martial Arts", value: "13" },
  { name: "Mature", value: "14" },
  { name: "Mecha", value: "15" },
  { name: "Mystery", value: "16" },
  { name: "Psychological", value: "17" },
  { name: "Romance", value: "18" },
  { name: "School Life", value: "19" },
  { name: "Sci-fi", value: "20" },
  { name: "Seinen", value: "21" },
  { name: "Shoujo", value: "22" },
  { name: "Shoujo Ai", value: "23" },
  { name: "Shounen", value: "24" },
  { name: "Shounen Ai", value: "25" },
  { name: "Slice of Life", value: "26" },
  { name: "Smut", value: "27" },
  { name: "Sports", value: "28" },
  { name: "Supernatural", value: "29" },
  { name: "Tragedy", value: "30" },
  { name: "Wuxia", value: "31" },
  { name: "Xianxia", value: "32" },
  { name: "Xuanhuan", value: "33" },
  { name: "Yaoi", value: "34" },
  { name: "Yuri", value: "35" }
];

function frFilterIndex(f, id, max) {
  var v = f ? f[id] : undefined;
  if (typeof v === "number" && v >= 0 && v < max) return v;
  return 0;
}

/// Inner HTML of the first <div ... class="...cls...">, balancing nested
/// divs. Returns null when the block cannot be located.
function frDivByClass(html, cls) {
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

function frCoverOf(cover) {
  if (!cover) return null;
  if (/^data:/i.test(cover)) return null;
  return absUrl(frBaseUrl, unescapeHtml(cover));
}

function frParseApiItems(text) {
  var out = { results: [], hasNextPage: false };
  var parsed;
  try {
    parsed = JSON.parse(typeof text === "string" ? text.trim() : "");
  } catch (e) {
    return out;
  }
  if (!parsed) return out;
  var items = parsed.data || [];
  if (parsed.meta && parsed.meta.last_page && parsed.meta.current_page) {
    out.hasNextPage = parsed.meta.current_page < parsed.meta.last_page;
  } else {
    out.hasNextPage = items.length >= 24;
  }
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.title || !item.slug) continue;
    out.results.push({
      title: item.title,
      url: frBaseUrl + "/series/" + item.slug,
      cover: frCoverOf(item.cover),
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  return out;
}

function frStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1 ||
      s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1) return "dropped";
  return s;
}

function frSlugOf(bookId) {
  var s = String(bookId || "").split("?")[0].replace(/\/$/, "").split("/");
  return s.length ? s[s.length - 1] : "";
}

function frEscapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/// Collect plain-text paragraphs from a tiptap JSON document.
function frTiptapParagraphs(doc) {
  var paras = [];
  function textOfNode(node) {
    var s = "";
    if (!node || typeof node !== "object") return s;
    if (node.type === "text" && typeof node.text === "string") return node.text;
    var kids = node.content;
    if (kids && kids.length) {
      for (var i = 0; i < kids.length; i++) s += textOfNode(kids[i]);
    }
    return s;
  }
  var kids = doc && doc.content;
  if (!kids || !kids.length) return paras;
  for (var i = 0; i < kids.length; i++) {
    var t = textOfNode(kids[i]).trim();
    if (t) paras.push(t);
  }
  return paras;
}

// Series slug captured by chaptersApiUrl so chapterList can build absolute
// chapter URLs (the chapters JSON carries only per-chapter slugs).
var frSeriesSlug = null;

register({
  id: "fenrirrealm",
  name: "FenrirRealm",
  baseUrl: frBaseUrl,
  lang: "en",
  version: "1.0.0",

  filters: [
    {
      type: "select",
      id: "status",
      name: "Status",
      options: frStatuses.map(function(o) { return o.name; }),
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: frOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: frGenres.map(function(g) { return g.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var status = frStatuses[frFilterIndex(f, "status", frStatuses.length)].value;
    var order = frOrders[frFilterIndex(f, "order", frOrders.length)].value;
    var genre = frGenres[frFilterIndex(f, "genre", frGenres.length)].value;
    var q = "page=" + (page || 1) + "&per_page=24" +
      "&status=" + encodeURIComponent(status) +
      "&sort=" + encodeURIComponent(order);
    if (genre !== "0") q += "&tags%5B%5D=" + encodeURIComponent(genre);
    return frApiUrl + "?" + q;
  },

  // --- Latest ---
  latestUrl: function(page) {
    return frApiUrl + "?page=" + (page || 1) +
      "&per_page=24&status=any&sort=updated";
  },

  // --- Search (same filter params as browse: status / sort / tags[]) ---
  searchUrl: function(query, page, filters) {
    var f = filters || {};
    var status = frStatuses[frFilterIndex(f, "status", frStatuses.length)].value;
    var order = frOrders[frFilterIndex(f, "order", frOrders.length)].value;
    var genre = frGenres[frFilterIndex(f, "genre", frGenres.length)].value;
    var q = "page=" + (page || 1) + "&per_page=12" +
      "&search=" + encodeURIComponent((query || "").trim()) +
      "&status=" + encodeURIComponent(status) +
      "&sort=" + encodeURIComponent(order);
    if (genre !== "0") q += "&tags%5B%5D=" + encodeURIComponent(genre);
    return frApiUrl + "?" + q;
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return frParseApiItems(html);
  },

  // --- Novel Info (server-rendered HTML) ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(frBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(
      html,
      /<h1[^>]*class="[^"]*my-2[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
    );
    if (!title || !textOf(title)) return empty;

    var author = first(
      html,
      /<span>by<\/span>\s*<a[^>]*>([^<]*)<\/a>/i
    );

    var statusBadge = first(
      html,
      /<span[^>]*class="[^"]*rounded-md[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );

    var genres = [];
    // NOTE: anchored on href= (not <a[^>]*href=) because Tailwind classes
    // like has-[>svg] contain a literal ">" inside the class attribute.
    var genreLinks = matchAll(
      html,
      /href="\/series\?genres[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
    );
    for (var i = 0; i < genreLinks.length; i++) {
      var g = textOf(genreLinks[i][1]);
      if (g) genres.push(g);
    }

    var synopsis = frDivByClass(html, "synopsis");
    var description = "";
    if (synopsis) {
      description = textOf(
        synopsis.replace(/<script[\s\S]*?<\/script>/gi, "")
      );
    }

    var cover = first(
      html,
      /<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i
    ) || first(
      html,
      /<meta[^>]*content="([^"]*)"[^>]*property="og:image"[^>]*>/i
    );

    return {
      title: textOf(title),
      author: author ? textOf(author) : null,
      cover: frCoverOf(cover ? unescapeHtml(cover) : null),
      status: frStatusOf(statusBadge ? textOf(statusBadge) : ""),
      genres: genres,
      description: description,
      chapters: [],
      rating: null
    };
  },

  // --- Chapters (JSON API; slug comes from the novel URL) ---
  chaptersApiUrl: function(bookId, page) {
    if ((page || 0) > 0) return null;
    var slug = frSlugOf(bookId);
    if (!slug) return null;
    frSeriesSlug = slug;
    return frApiUrl + "/" + encodeURIComponent(slug) + "/chapters";
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
    var items = parsed && parsed.data ? parsed.data : parsed;
    if (!items || !items.length) return [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var ch = items[i];
      if (!ch.slug) continue;
      if (ch.locked && ch.locked.price > 0) continue;
      var name = ch.name || ch.title || ("Chapter " + ch.slug);
      if (ch.title && name.indexOf(ch.title) === -1) {
        name = name + " - " + ch.title;
      }
      out.push({
        name: name,
        url: frBaseUrl + "/series/" + frSeriesSlug + "/" +
          encodeURIComponent(String(ch.slug))
      });
    }
    return out;
  },

  // --- Chapter Content (tiptap JSON API) ---
  chapterContentUrl: function(chapterUrl) {
    var parts = String(chapterUrl || "").split("?")[0]
      .replace(/\/$/, "").split("/");
    if (parts.length < 2) return chapterUrl;
    var chSlug = parts.pop();
    var seriesSlug = parts.pop();
    if (!seriesSlug || !chSlug) return chapterUrl;
    return frApiUrl + "/" + encodeURIComponent(seriesSlug) +
      "/chapters/" + encodeURIComponent(chSlug);
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var parsed;
    try {
      parsed = JSON.parse(html.trim());
    } catch (e) {
      return out;
    }
    var raw = parsed && parsed.content;
    if (!raw) return out;
    var doc = null;
    if (typeof raw === "string") {
      try {
        doc = JSON.parse(raw);
      } catch (e) {
        out.html = raw;
        return out;
      }
    } else {
      doc = raw;
    }
    if (!doc || !doc.content) return out;
    var paras = frTiptapParagraphs(doc);
    var parts = [];
    for (var i = 0; i < paras.length; i++) {
      parts.push("<p>" + frEscapeHtml(paras[i]) + "</p>");
    }
    out.html = parts.join("");
    return out;
  }
});
