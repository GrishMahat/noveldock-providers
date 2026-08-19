// MTLNovel provider for mtlnovel.me
// Port of the original Kotlin MtlNovelProvider (QuickNovel). Novel cards on
// browse/search pages are div.novel-box; the chapter list is plain HTML
// from the /ajax/chapters/?slug= endpoint (no pagination); the novel's slug
// doubles as the bookId (last URL segment of /info/{slug}/).

var baseUrl = "https://mtlnovel.me";

var mtlGenres = [
  "All", "Action", "Adult", "Adventure", "Comedy", "Drama", "Ecchi",
  "Erciyuan", "Fan-Fiction", "Fantasy", "Game", "Gender Bender", "Harem",
  "Historical", "Horror", "Josei", "Martial Arts", "Mature", "Mecha",
  "Military", "Mystery", "Psychological", "Romance", "School Life",
  "Sci-fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai",
  "Slice of Life", "Smut", "Sports", "Supernatural", "Tragedy",
  "Two-dimensional", "Urban Life", "Wuxia", "Xianxia", "Xuanhuan",
  "Yaoi", "Yuri"
];

var mtlGenreSlugs = [
  "", "action", "adult", "adventure", "comedy", "drama", "ecchi",
  "erciyuan", "fan-fiction", "fantasy", "game", "gender-bender", "harem",
  "historical", "horror", "josei", "martial-arts", "mature", "mecha",
  "military", "mystery", "psychological", "romance", "school-life",
  "sci-fi", "seinen", "shoujo", "shoujo-ai", "shounen", "shounen-ai",
  "slice-of-life", "smut", "sports", "supernatural", "tragedy",
  "two-dimensional-novel", "urban-fiction", "wuxia", "xianxia", "xuanhuan",
  "yaoi", "yuri"
];

/// Inner HTML of the element whose opening tag starts at [startIdx]
/// (index just past ">"), with balanced </div> matching.
/// Returns { inner, end } or null when unbalanced.
function balancedFrom(html, startIdx) {
  var depth = 1;
  var k = startIdx;
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
  if (depth !== 0) return null;
  return { inner: html.substring(startIdx, k - 6), end: k };
}

/// div.novel-box cards. Parse title link, cover, and star rating.
function parseCards(html) {
  var results = [];
  var cardRe = /<div class="col-[^"]* novel-box">/g;
  var m;
  while ((m = cardRe.exec(html)) !== null) {
    var b = balancedFrom(html, m.index + m[0].length);
    if (!b) break;
    var card = b.inner;
    var href = first(card, /<h3 class="title">\s*<a[^>]*href="([^"]+)"/);
    var title = first(card, /<h3 class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
    if (!href || !title) {
      cardRe.lastIndex = b.end;
      continue;
    }
    var rating = null;
    var score = first(card, /<p class="rating">[\s\S]*?<span>([\d.]+)<\/span>/);
    if (score) {
      var sv = parseFloat(score);
      if (!isNaN(sv)) rating = Math.round(sv * 200);
    }
    var cover = first(card, /<img[^>]*src="([^"]+)"/);
    results.push({
      title: textOf(title),
      url: absUrl(baseUrl, href),
      cover: cover ? absUrl(baseUrl, cover) : null,
      author: null,
      summary: null,
      rating: rating,
      latestChapter: null
    });
    cardRe.lastIndex = b.end;
  }
  return results;
}

/// Value of a "Label:" row inside the novel info card's <ul>.
function infoRow(html, label) {
  var re = new RegExp(
    "<span class=\"text-bold\">" + label + ":<\\/span>\\s*<span class=\"pull-right\">([\\s\\S]*?)<\\/span>"
  );
  return first(html, re);
}

register({
  id: "mtlnovel",
  name: "MTLNovel",
  baseUrl: baseUrl,
  lang: "en",
  nsfw: false,
  version: "1.0.0",

  // Keyword-only search; no dedicated latest list (the list page is the
  // main page). Mirrors the Kotlin provider.
  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: mtlGenres,
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var genreIndex = 0;
    if (typeof f.genre === "number") genreIndex = f.genre;
    if (genreIndex < 0 || genreIndex >= mtlGenres.length) genreIndex = 0;
    var slug = mtlGenreSlugs[genreIndex];
    if (slug) {
      return baseUrl + "/category/" + slug + "/?page=" + (page || 1);
    }
    return baseUrl + "/list/?page=" + (page || 1);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return (
      baseUrl + "/search/?keyword=" +
      encodeURIComponent((query || "").trim()) +
      (page > 1 ? "&page=" + page : "")
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    var hasNextPage = /<a class="page-link"[^>]*>&raquo;<\/a>/.test(html);
    return { results: parseCards(html), hasNextPage: hasNextPage };
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(baseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var title = first(html, /<h5 class="m-card-header">([\s\S]*?)<\/h5>/);
    title = title ? textOf(title) : "";

    var author = null;
    var authorRow = infoRow(html, "Author");
    if (authorRow) author = textOf(authorRow);

    var genres = [];
    var genreRow = infoRow(html, "Genres");
    if (genreRow) {
      var genreAs = matchAll(genreRow, /<a[^>]*>([\s\S]*?)<\/a>/g);
      for (var gi = 0; gi < genreAs.length; gi++) {
        var g = textOf(genreAs[gi][1]);
        if (g) genres.push(g);
      }
    }

    var status = null;
    var statusRow = infoRow(html, "Status");
    if (statusRow) {
      var s = textOf(statusRow).trim().toLowerCase();
      if (s) status = s;
    }

    var cover = null;
    var img = first(html, /<div class="content-main-image">[\s\S]*?<img[^>]*src="([^"]+)"/);
    if (img) cover = absUrl(baseUrl, img);

    var rating = null;
    var score = first(html, /<span class="rating">[\s\S]*?<span>([\d.]+)<\/span>/);
    if (score) {
      var sv = parseFloat(score);
      if (!isNaN(sv)) rating = Math.round(sv * 200);
    }

    // Synopsis: the first m-card.text-break block (exclude its h5 header).
    var description = "";
    var summaryCard = balancedFrom(html, (function() {
      var re = /<div class="m-card text-break">/g;
      var m = re.exec(html);
      return m ? m.index + m[0].length : -1;
    })());
    if (summaryCard) {
      var body = summaryCard.inner.replace(/<h5[^>]*>[\s\S]*?<\/h5>/, "");
      description = textOf(body);
    }

    return {
      title: title,
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: description,
      chapters: [],
      rating: rating,
    };
  },

  // --- Chapters (AJAX, all chapters in one response) ---
  chaptersApiUrl: function(bookId, page) {
    if (page > 0) return null;
    if (!bookId) return null;
    return baseUrl + "/ajax/chapters/?slug=" + encodeURIComponent(bookId);
  },

  chapterList: function(html) {
    if (!html || typeof html !== "string") return [];
    var chapters = [];
    var items = matchAll(html, /<p class="update-box-chapter">\s*<a[^>]*href="([^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/g);
    for (var i = 0; i < items.length; i++) {
      var name = items[i][2] ? items[i][2] : textOf(items[i][3]);
      name = name.trim();
      if (!name) continue;
      chapters.push({
        name: name,
        url: absUrl(baseUrl, items[i][1])
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
    var b = balancedFrom(html, (function() {
      var re = /<div class="content text-break"[^>]*>/g;
      var m = re.exec(html);
      return m ? m.index + m[0].length : -1;
    })());
    if (!b) return { html: "", images: [] };
    return { html: b.inner, images: [] };
  }
});