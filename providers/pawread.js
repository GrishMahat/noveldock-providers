// PawRead provider for pawread.com
// Port of the original Kotlin PawReadProver (QuickNovel).
// Browse/novel/chapter pages are plain HTML (GET); keyword search goes
// through the site's JSON API (POST, like the site's own search box).

var pawBaseUrl = "https://www.pawread.com";
var pawApiUrl = "https://api.pawread.com";

// Absolute URL of the novel whose info was parsed last (without trailing
// slash). Chapter entries only carry a numeric id, so chapter URLs are
// rebuilt from it (info always runs before chapters, one runtime).
var pawNovelBase = null;

var pawCategories = [
  { name: "All", value: "all-" },
  { name: "Completed", value: "wanjie-" },
  { name: "Ongoing", value: "lianzai-" },
  { name: "Hiatus", value: "hiatus-" }
];

var pawOrders = [
  { name: "Time updated", value: "update" },
  { name: "Time posted", value: "post" },
  { name: "Clicks", value: "click" }
];

var pawGenres = [
  "All", "Fantasy", "Action", "Xuanhuan", "Romance", "Comedy", "Mystery",
  "Mature", "Harem", "Wuxia", "Xianxia", "Tragedy", "Scifi", "Historical",
  "Ecchi", "Adventure", "Adult", "Supernatural", "Psychological", "Drama",
  "Horror", "Josei", "Mecha", "Shounen", "Smut", "MartialArts",
  "SchoolLife", "SliceofLife", "GenderBender", "Sports", "Urban", "LitRPG",
  "Isekai"
];

function pawFilterIndex(f, id, max) {
  var v = f ? f[id] : undefined;
  if (typeof v === "number" && v >= 0 && v < max) return v;
  return 0;
}

/// Inner HTML of the first <div ... id="..." ...>, balancing nested divs.
/// Returns null when the block cannot be located.
function pawDivById(html, id) {
  var open = new RegExp(
    '<div[^>]*\\bid\\s*=\\s*["\']' + id + '["\'][^>]*>'
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

function pawStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1 ||
      s.indexOf("lianzai") !== -1) return "ongoing";
  if (s.indexOf("completed") !== -1 || s.indexOf("complete") !== -1 ||
      s.indexOf("wanjie") !== -1) return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1) return "dropped";
  return null;
}

function pawApiResults(text) {
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { results: [], hasNextPage: false };
  }
  var items = (parsed && parsed.items) || [];
  var results = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var uri = item.uri || (item.slug ? "/novel/" + item.slug + "/" : null);
    if (!uri || !item.title) continue;
    results.push({
      title: item.title,
      url: absUrl(pawBaseUrl, uri),
      cover: item.coverUrl ? absUrl(pawBaseUrl, item.coverUrl) : null,
      author: item.author || null,
      summary: null,
      rating: null,
      latestChapter: item.last_chapter_name || null
    });
  }
  return { results: results, hasNextPage: false };
}

function pawHtmlResults(html) {
  var results = [];
  // .list-comic-thumbnail holds an image link plus a caption div and
  // nothing else nested, so the first </div></div> pair closes the card.
  var cards = matchAll(
    html,
    /<div class="list-comic-thumbnail">([\s\S]*?)<\/div>\s*<\/div>/g
  );
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i][1];
    var href = first(
      card,
      /<a[^>]*class="[^"]*image-link[^"]*"[^>]*href="([^"]+)"/
    );
    if (!href) href = first(card, /<a[^>]*href="([^"]+)"[^>]*>\s*<img/);
    var title = first(card, /<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    if (!href || !title || !textOf(title)) continue;
    var imgTag = first(card, /(<img[^>]*>)/);
    var cover = imgTag ? attr(imgTag, "src") : null;
    results.push({
      title: textOf(title),
      url: absUrl(pawBaseUrl, href),
      cover: cover ? absUrl(pawBaseUrl, unescapeHtml(cover)) : null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  var hasNextPage = /\/list\//.test(html) &&
    (/>\s*Next\s*</i.test(html) || /rel="next"/i.test(html) ||
      /page=\d+/.test(html));
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "pawread",
  name: "PawRead",
  baseUrl: pawBaseUrl,
  lang: "en",
  version: "1.0.0",
  author: "noveldock",

  // Site search is keyword-only; browse filters don't apply there.
  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "category",
      name: "Status",
      options: pawCategories.map(function(o) { return o.name; }),
      defaultIndex: 0
    },
    {
      type: "select",
      id: "order",
      name: "Sort by",
      options: pawOrders.map(function(o) { return o.name; }),
      defaultIndex: 0
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: pawGenres,
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var cat = pawCategories[pawFilterIndex(f, "category", pawCategories.length)].value;
    var order = pawOrders[pawFilterIndex(f, "order", pawOrders.length)].value;
    var genre = pawGenres[pawFilterIndex(f, "genre", pawGenres.length)];
    return (
      pawBaseUrl + "/list/" + cat + genre + "/" + order +
      "/?page=" + (page || 1)
    );
  },

  // --- Latest (all series, time updated first) ---
  latestUrl: function(page) {
    return pawBaseUrl + "/list/all-All/update/?page=" + (page || 1);
  },

  // --- Search (POST JSON API, same endpoint as the site search box) ---
  searchConfig: function(query, page) {
    return {
      url: pawApiUrl + "/comic/search",
      fields: { keywords: (query || "").trim() },
      headers: {
        referer: pawBaseUrl + "/",
        "x-requested-with": "XMLHttpRequest"
      }
    };
  },

  searchUrl: function(query, page, filters) {
    return (
      pawBaseUrl + "/search/?keywords=" +
      encodeURIComponent((query || "").trim())
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    if (html.trim().charAt(0) === "{") return pawApiResults(html.trim());
    return pawHtmlResults(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    var abs = absUrl(pawBaseUrl, novelUrl) || novelUrl;
    pawNovelBase = abs.replace(/\/$/, "");
    return abs;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var boardPos = html.indexOf("tab1_board");
    if (boardPos === -1) return empty;
    var board = html.substring(boardPos);

    var title = first(board, /<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!title || !textOf(title)) return empty;

    var status = pawStatusOf(
      first(board, /<span[^>]*class="[^"]*\blabel\b[^"]*"[^>]*>([^<]*)<\/span>/) || ""
    );

    var cover = first(board, /background-image:\s*url\(([^)]+)\)/);

    var author = null;
    var viewsBlock = pawDivById(html, "views_info");
    if (viewsBlock) {
      var cells = matchAll(viewsBlock, /<div[^>]*>([\s\S]*?)<\/div>/g);
      if (cells.length >= 4) author = textOf(cells[3][1]) || null;
    }

    var genres = [];
    var genreBlock = first(
      board,
      /<div[^>]*class="[^"]*\bcol-md-9\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*\bmt20\b[^"]*\bcomic-score\b/
    );
    var genreScope = genreBlock || board;
    var genreLinks = matchAll(
      genreScope,
      /<a[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>([^<]*)<\/a>/g
    );
    for (var g = 0; g < genreLinks.length; g++) {
      var genre = textOf(genreLinks[g][1]);
      if (genre) genres.push(genre);
    }

    var rating = null;
    var scoreBlock = first(
      board,
      /<div[^>]*class="[^"]*\bcomic-score\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/
    );
    var scoreText = first(
      scoreBlock || board,
      /<span[^>]*>\s*([\d.]+)\s*<\/span>/
    );
    if (scoreText) {
      var stars = parseFloat(scoreText);
      if (!isNaN(stars) && stars > 0) rating = Math.round(stars * 200);
    }

    var description = first(
      html,
      /<p[^>]*id="simple-des"[^>]*>([\s\S]*?)<\/p>/
    );

    var chapters = [];
    var boxes = matchAll(
      html,
      /<div[^>]*class="[^"]*\bitem-box\b[^"]*"[^>]*onclick="goC\('(\d+)'\);?"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g
    );
    for (var c = 0; c < boxes.length; c++) {
      var box = boxes[c][2];
      if (box.indexOf("<svg") !== -1) continue;
      var name = first(
        box,
        /<span[^>]*class="[^"]*\bc_title\b[^"]*"[^>]*>([\s\S]*?)<\/span>/
      );
      name = textOf(name || "");
      if (!name || !pawNovelBase) continue;
      chapters.push({
        name: name,
        url: pawNovelBase + "/" + boxes[c][1] + ".html"
      });
    }

    return {
      title: textOf(title),
      author: author,
      cover: cover ? absUrl(pawBaseUrl, unescapeHtml(cover)) : null,
      status: status,
      genres: genres,
      description: description ? textOf(description) : "",
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
    var content = pawDivById(html, "chapter_item");
    if (!content || !textOf(content)) return out;
    out.html = content;
    return out;
  }
});
