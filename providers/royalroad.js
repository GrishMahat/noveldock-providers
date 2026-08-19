// Royal Road provider for royalroad.com
// Port of the original Kotlin RoyalRoadProvider (QuickNovel).

var baseUrl = "https://www.royalroad.com";

var rrOrderBys = [
  { name: "Best Rated", slug: "best-rated" },
  { name: "Ongoing", slug: "active-popular" },
  { name: "Completed", slug: "complete" },
  { name: "Popular this week", slug: "weekly-popular" },
  { name: "Latest Updates", slug: "latest-updates" },
  { name: "New Releases", slug: "new-releases" },
  { name: "Trending", slug: "trending" },
  { name: "Rising Stars", slug: "rising-stars" },
  { name: "Writathon", slug: "writathon" }
];

var rrGenres = [
  { name: "All", slug: "" },
  { name: "Action", slug: "action" },
  { name: "Adventure", slug: "adventure" },
  { name: "Anti-Hero Lead", slug: "anti-hero_lead" },
  { name: "Comedy", slug: "comedy" },
  { name: "Contemporary", slug: "contemporary" },
  { name: "Cyberpunk", slug: "cyberpunk" },
  { name: "Drama", slug: "drama" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Female Lead", slug: "female_lead" },
  { name: "First Contact", slug: "first_contact" },
  { name: "GameLit", slug: "gamelit" },
  { name: "Gender Bender", slug: "gender_bender" },
  { name: "Grimdark", slug: "grimdark" },
  { name: "Hard Sci-fi", slug: "hard_sci-fi" },
  { name: "Harem", slug: "harem" },
  { name: "High Fantasy", slug: "high_fantasy" },
  { name: "Historical", slug: "historical" },
  { name: "Horror", slug: "horror" },
  { name: "LitRPG", slug: "litrpg" },
  { name: "Low Fantasy", slug: "low_fantasy" },
  { name: "Magic", slug: "magic" },
  { name: "Male Lead", slug: "male_lead" },
  { name: "Martial Arts", slug: "martial_arts" },
  { name: "Mystery", slug: "mystery" },
  { name: "Mythos", slug: "mythos" },
  { name: "Portal Fantasy / Isekai", slug: "summoned_hero" },
  { name: "Progression", slug: "progression" },
  { name: "Psychological", slug: "psychological" },
  { name: "Reincarnation", slug: "reincarnation" },
  { name: "Romance", slug: "romance" },
  { name: "Ruling Class", slug: "ruling_class" },
  { name: "Satire", slug: "satire" },
  { name: "Sci-fi", slug: "sci_fi" },
  { name: "Secret Identity", slug: "secret_identity" },
  { name: "Short Story", slug: "one_shot" },
  { name: "Soft Sci-fi", slug: "soft_sci-fi" },
  { name: "Space Opera", slug: "space_opera" },
  { name: "Strategy", slug: "strategy" },
  { name: "Strong Lead", slug: "strong_lead" },
  { name: "Time Loop", slug: "loop" },
  { name: "Time Travel", slug: "time_travel" },
  { name: "Tragedy", slug: "tragedy" },
  { name: "Virtual Reality", slug: "virtual_reality" },
  { name: "War and Military", slug: "war_and_military" },
  { name: "Wuxia", slug: "wuxia" }
];

// Module state. parseSearchResults needs to know which list we are parsing.
var moduleMode = "search"; // "search" | "browse" | "latest"

function rrRating(html) {
  // <span class="font-red-sunglo star ..." title="4.8" ...>
  var m = /<span[^>]*font-red-sunglo[^>]*title="([\d.]+)"/.exec(html);
  if (!m) return null;
  var v = parseFloat(m[1]);
  if (isNaN(v)) return null;
  return Math.round(v * 200);
}

function rrStatus(html) {
  var m = /<span class="label[^"]*"[^>]*>\s*([A-Za-z]+)\s*<\/span>/.exec(html);
  return m ? m[1].trim() : null;
}

function parseFictionItems(html) {
  var results = [];
  var items = matchAll(html, /<div class="fiction-list-item[^"]*">[\s\S]*?<\/div>\s*<\/div>/g);

  for (var i = 0; i < items.length; i++) {
    var item = items[i][0];

    // Title/url: h2.fiction-title > a (inside either .search-content or .col-sm-10)
    var titleMatch = /<h2 class="fiction-title">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(item);
    if (!titleMatch) continue;
    var url = titleMatch[1];
    var title = textOf(titleMatch[2]);
    if (!title || !url) continue;

    // Cover: figure > a > img[src]
    var cover = null;
    var imgMatch = /<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/.exec(item);
    if (imgMatch) cover = absUrl(baseUrl, imgMatch[1]);

    results.push({
      title: title,
      url: absUrl(baseUrl, url),
      cover: cover,
      author: null,
      summary: null,
      rating: rrRating(item),
      latestChapter: null,
    });
  }
  return results;
}

register({
  id: "royalroad",
  name: "Royal Road",
  lang: "en",
  baseUrl: baseUrl,
  version: "1.0.0",

  // The site's own list pages cover filters, but search is title-only.
  flags: { searchFilters: false },

  filters: [
    {
      type: "sort",
      id: "sort",
      name: "Sort by",
      options: rrOrderBys.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: rrGenres.map(function(g) { return g.name; }),
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
    if (sortIndex < 0 || sortIndex >= rrOrderBys.length) sortIndex = 0;
    if (genreIndex < 0 || genreIndex >= rrGenres.length) genreIndex = 0;

    var orderBy = rrOrderBys[sortIndex].slug;
    var genre = rrGenres[genreIndex].slug;
    moduleMode = "browse";
    return (
      baseUrl + "/fictions/" + orderBy +
      "?page=" + (page || 1) +
      (genre ? "&genre=" + genre : "")
    );
  },

  // --- Latest (the site's "ongoing, updated now" feed) ---
  latestUrl: function(page) {
    moduleMode = "latest";
    return baseUrl + "/fictions/active-popular?page=" + (page || 1);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    moduleMode = "search";
    return (
      baseUrl + "/fictions/search?title=" +
      encodeURIComponent(query) +
      "&page=" + (page || 1)
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }

    var results = parseFictionItems(html);
    var hasNextPage = /<li><a data-page='\d+'[^>]*>Next/.test(html);

    return { results: results, hasNextPage: hasNextPage };
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(baseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    // Title: <h1 class="font-white ...">...
    var title = first(html, /<h1[^>]*class="[^"]*font-white[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
    title = title ? textOf(title) : "";

    // Numeric fiction id for "similar" API (kept for future use).
    var fictionId = first(html, /window\.fictionId = (\d+);/);
    fictionId = fictionId ? parseInt(fictionId, 10) : null;

    // Chapters: <table id="chapters"> <tbody> <tr data-url="...">
    var chapters = [];
    var rows = matchAll(html, /<tr[^>]*data-url="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cUrl = row[1];
      var nameMatch = /<a[^>]*>([\s\S]*?)<\/a>/.exec(row[2]);
      var dateMatch = /<time[^>]*>([\s\S]*?)<\/time>/.exec(row[2]);
      if (nameMatch) {
        chapters.push({
          name: textOf(nameMatch[1]),
          url: absUrl(baseUrl, cUrl),
          date: dateMatch ? textOf(dateMatch[1]) : null,
        });
      }
    }

    // Status: labels inside div.margin-bottom-10 within the fic header.
    var status = null;
    var statusLabels = matchAll(html, /<span class="label[^"]*"[^>]*>\s*(Ongoing|Completed|Hiatus|Dropped|Stubbed|Stub|Complete)\s*<\/span>/gi);
    if (statusLabels.length) {
      var s = statusLabels[0][1].trim().toLowerCase();
      if (s === "stub") s = "stubbed";
      status = s;
    }

    // Cover: div.fic-header .cover-art-container img
    var cover = null;
    var coverDiv = first(html, /(<div[^>]*class="[^"]*cover-art-container[^"]*"[^>]*>[\s\S]*?<img[^>]*>)/);
    if (coverDiv) {
      var coverSrc = attr(coverDiv, "src");
      cover = coverSrc ? absUrl(baseUrl, coverSrc) : null;
    }

    // Synopsis: div.description > div (inner html → text)
    var description = "";
    var descMatch = /<div[^>]*class="[^"]*description[^"]*"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
    if (descMatch) description = textOf(descMatch[1]);

    // Author: h4.font-white > span > a
    var author = null;
    var authorMatch = /<h4[^>]*class="[^"]*font-white[^"]*"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/.exec(html);
    if (authorMatch) author = textOf(authorMatch[1]);

    // Rating: span.font-red-sunglo[data-content="4.8/5 ..."]. Use the
    // data-content value before the '/'.
    var rating = null;
    var ratingSpan = first(html, /<span[^>]*font-red-sunglo[^>]*data-content="([^"]*)"/);
    if (ratingSpan) {
      var ratingTxt = ratingSpan.substring(0, ratingSpan.indexOf('/'));
      var rv = parseFloat(ratingTxt);
      if (!isNaN(rv)) rating = Math.round(rv * 200);
    }

    // Tags: span.tags > a
    var genres = [];
    var tagMatches = matchAll(html, /<span class="tags">[\s\S]*?<\/span>/);
    if (tagMatches.length) {
      var tagRe = /<a[^>]*class="label[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      var tm;
      while ((tm = tagRe.exec(tagMatches[0][0])) !== null) {
        var tag = textOf(tm[1]);
        if (tag) genres.push(tag);
      }
    }

    return {
      title: title,
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: description,
      chapters: chapters,
      rating: rating,
    };
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    // Content: <div class="chapter-content"> (often "chapter-inner chapter-content").
    var openRe = /<div[^>]*class="[^"]*chapter-content[^"]*"[^>]*>/;
    var openMatch = openRe.exec(html);
    if (!openMatch) return { html: "", images: [] };
    var startIdx = openMatch.index + openMatch[0].length;

    var depth = 1;
    var idx = startIdx;
    var end = html.length;
    while (depth > 0 && idx < html.length) {
      var nextOpen = html.indexOf('<div', idx);
      var nextClose = html.indexOf('</div>', idx);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        idx = nextOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          end = nextClose;
        } else {
          idx = nextClose + 6;
        }
      }
    }

    var content = html.substring(startIdx, end);

    var images = [];
    var imgRe = /<img[^>]*src="([^"]*)"/g;
    var m;
    while ((m = imgRe.exec(content)) !== null) {
      images.push({ url: absUrl(baseUrl, m[1]) || m[1], alt: null });
    }

    return { html: content, images: images };
  },
});