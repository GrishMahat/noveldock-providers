// FreeWebNovel provider for freewebnovel.com
// Port of the original Kotlin FreewebnovelProvider (QuickNovel). The site
// changed its listing URLs since the port. Sort routes are now
// /sort/{slug}/{page} and genres are /genre/{tag}/{page}. The chapter list
// comes from a JSON-wrapped <option> payload posted to /api/chapterlist.php.

var baseUrl = "https://freewebnovel.com";

var fwnSorts = [
  { name: "Latest Release", slug: "latest-release" },
  { name: "Latest Novels", slug: "latest-novel" },
  { name: "Most Popular", slug: "most-popular" },
  { name: "Completed", slug: "completed-novel" }
];

var fwnGenres = [
  { name: "All", slug: "" },
  { name: "Action", slug: "Action" },
  { name: "Adult", slug: "Adult" },
  { name: "Adventure", slug: "Adventure" },
  { name: "Comedy", slug: "Comedy" },
  { name: "Drama", slug: "Drama" },
  { name: "Eastern", slug: "Eastern" },
  { name: "Ecchi", slug: "Ecchi" },
  { name: "Fan-fic", slug: "Fan-fic" },
  { name: "Fantasy", slug: "Fantasy" },
  { name: "Game", slug: "Game" },
  { name: "Gender Bender", slug: "Gender+Bender" },
  { name: "Harem", slug: "Harem" },
  { name: "Historical", slug: "Historical" },
  { name: "Horror", slug: "Horror" },
  { name: "Josei", slug: "Josei" },
  { name: "Martial Arts", slug: "Martial+Arts" },
  { name: "Mature", slug: "Mature" },
  { name: "Mecha", slug: "Mecha" },
  { name: "Mystery", slug: "Mystery" },
  { name: "Psychological", slug: "Psychological" },
  { name: "Reincarnation", slug: "Reincarnation" },
  { name: "Romance", slug: "Romance" },
  { name: "School Life", slug: "School+Life" },
  { name: "Sci-fi", slug: "Sci-fi" },
  { name: "Seinen", slug: "Seinen" },
  { name: "Shoujo", slug: "Shoujo" },
  { name: "Shounen", slug: "Shounen" },
  { name: "Shounen Ai", slug: "Shounen+Ai" },
  { name: "Slice of Life", slug: "Slice+of+Life" },
  { name: "Smut", slug: "Smut" },
  { name: "Sports", slug: "Sports" },
  { name: "Supernatural", slug: "Supernatural" },
  { name: "System", slug: "System" },
  { name: "Tragedy", slug: "Tragedy" },
  { name: "Wuxia", slug: "Wuxia" },
  { name: "Xianxia", slug: "Xianxia" },
  { name: "Xuanhuan", slug: "Xuanhuan" },
  { name: "Yaoi", slug: "Yaoi" }
];

// Numeric article id scraped from the novel page (a.set-case.add
// data-articleid, fallback meta[name=image] file name). Needed by the
// chapterlist POST; set in novelInfo, consumed in chaptersApiConfig.
var moduleAid = null;

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

/// Strip <div class="reader-ad-skip …">…</div> blocks (recursively).
function stripAdBlocks(html) {
  var re = /<div[^>]*class="[^"]*reader-ad-skip[^"]*"[^>]*>/;
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

/// Cover URL from a <picture><source srcset="…w300"> block or <img src>.
function cardCover(card) {
  var srcset = first(card, /<source[^>]*srcset="([^"]*)"/);
  if (srcset) {
    var last = srcset.split(",").pop().trim();
    var cand = last.substring(0, last.indexOf(" "));
    if (cand) return absUrl(baseUrl, cand);
  }
  var img = first(card, /<img[^>]*src="([^"]+)"/);
  return img ? absUrl(baseUrl, img) : null;
}

function parseListing(html) {
  var results = [];
  var cards = matchAll(html, /<div class="li-row">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g);
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i][1];
    var href = first(card, /<h3 class="tit">\s*<a[^>]*href="([^"]+)"/);
    var title = first(card, /<h3 class="tit">\s*<a[^>]*title="([^"]*)"/);
    if (!href || !title) continue;
    var rating = null;
    var score = first(card, /<div class="core">\s*<span>([\d.]+)<\/span>/);
    if (score) {
      var sv = parseFloat(score);
      if (!isNaN(sv)) rating = Math.round(sv * 200);
    }
    var latestChapter = null;
    var chLink = first(card, /<a[^>]*class="chapter"[^>]*>([\s\S]*?)<\/a>/);
    if (chLink) latestChapter = textOf(chLink);
    results.push({
      title: title,
      url: absUrl(baseUrl, href),
      cover: cardCover(card),
      author: null,
      summary: null,
      rating: rating,
      latestChapter: latestChapter
    });
  }
  var pagesBlock = first(html, /<div class="pages">([\s\S]*?)<\/div>/);
  var hasNextPage = pagesBlock ? /&gt;&gt;/.test(pagesBlock) : false;
  return { results: results, hasNextPage: hasNextPage };
}

/// Page 1 is the unsuffixed URL; pages ≥2 get the /N suffix.
function pagedUrl(base, page) {
  return base + (page > 1 ? "/" + page : "");
}

register({
  id: "freewebnovel",
  name: "FreeWebNovel",
  baseUrl: baseUrl,
  lang: "en",
  nsfw: true,
  version: "1.0.0",

  // Site search is keyword-only; browse filters don't apply there.
  flags: { searchFilters: false },

  filters: [
    {
      type: "sort",
      id: "sort",
      name: "Sort by",
      options: fwnSorts.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: fwnGenres.map(function(g) { return g.name; }),
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
    if (sortIndex < 0 || sortIndex >= fwnSorts.length) sortIndex = 0;
    if (genreIndex < 0 || genreIndex >= fwnGenres.length) genreIndex = 0;

    var genre = fwnGenres[genreIndex].slug;
    if (genre) {
      return pagedUrl(baseUrl + "/genre/" + genre, page);
    }
    return pagedUrl(baseUrl + "/sort/" + fwnSorts[sortIndex].slug, page);
  },

  // --- Latest ---
  latestUrl: function(page) {
    return pagedUrl(baseUrl + "/sort/latest-release", page);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return (
      baseUrl + "/search?keyword=" +
      encodeURIComponent((query || "").trim()) +
      (page > 1 ? "&page=" + page : "")
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return parseListing(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(baseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var title = first(html, /<h1 class="tit"[^>]*>([\s\S]*?)<\/h1>/);
    title = title ? textOf(title) : "";

    // Numeric article id for the chapterlist POST.
    moduleAid = null;
    var aid = first(html, /data-articleid="(\d+)"/);
    if (!aid) {
      var imgMeta = first(html, /name="image" content="([^"]*)"/);
      if (imgMeta) {
        var file = imgMeta.substring(imgMeta.lastIndexOf("/") + 1);
        aid = file.replace(/s\.jpg.*$/, "");
      }
    }
    if (aid) moduleAid = aid;

    // Author: <span class="glyphicon glyphicon-user" title="Author"> → div.right a.
    var author = null;
    var authorItem = first(html, /<span class="glyphicon glyphicon-user"[^>]*title="Author"[^>]*><\/span>[\s\S]*?<div class="right">([\s\S]*?)<\/div>/);
    if (authorItem) author = textOf(authorItem);

    // Genres: same block with title="Genre".
    var genres = [];
    var genreItem = first(html, /<span class="glyphicon glyphicon-th-list"[^>]*title="Genre"[^>]*><\/span>[\s\S]*?<div class="right">([\s\S]*?)<\/div>/);
    if (genreItem) {
      var genreParts = genreItem.split(",");
      for (var gi = 0; gi < genreParts.length; gi++) {
        var g = textOf(genreParts[gi]);
        if (g) genres.push(g);
      }
    }

    // Status: <span class="s1 s2"><a>OnGoing</a></span> (also s1 s3).
    var status = null;
    var statusLink = first(html, /<span class="s1 s[23]"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    if (statusLink) {
      var s = textOf(statusLink).trim().toLowerCase();
      if (s.indexOf("hiatus") !== -1) s = "paused";
      status = s;
    }

    // Synopsis: div.inner.
    var description = "";
    var inner = first(html, /<div class="inner">([\s\S]*?)<\/div>/);
    if (inner) description = textOf(inner);

    // Rating: <p class="vote">4.3 / 5 ( 76 votes )</p>
    var rating = null;
    var vote = first(html, /<p class="vote">([\s\S]*?)<\/p>/);
    if (vote) {
      var voteTxt = textOf(vote);
      var rv = parseFloat(voteTxt.substring(0, voteTxt.indexOf("/")).trim());
      if (!isNaN(rv)) rating = Math.round(rv * 200);
    }

    // Cover: picture source srcset (last candidate) or div.pic img.
    var cover = cardCover(html);

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

  // --- Chapters (POST /api/chapterlist.php) ---
  chaptersApiConfig: function(bookId, page) {
    if (page > 0) return null;
    if (!moduleAid) return null;
    var body =
      "aid=" + encodeURIComponent(moduleAid) +
      "&acode=" + encodeURIComponent(bookId) +
      "&cid=1";
    return {
      url: baseUrl + "/api/chapterlist.php",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: _utf8Bytes(body)
    };
  },

  chapterList: function(data) {
    // The app hands us the raw response bytes (List<int>) for POST configs.
    var text;
    if (typeof data === "string") {
      text = data.trim();
    } else if (data instanceof Array) {
      text = _utf8Decode(data, 0, data.length).trim();
    } else {
      return [];
    }
    if (!text) return [];
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return [];
    }
    var inner = parsed && parsed.html;
    if (!inner) return [];
    var chapters = [];
    var opts = matchAll(inner, /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g);
    for (var i = 0; i < opts.length; i++) {
      var opt = opts[i];
      if (!opt[1]) continue;
      var name = textOf(opt[2]);
      if (!name) continue;
      chapters.push({
        name: name,
        url: absUrl(baseUrl, opt[1])
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
    var inner = balancedDiv(html, /<div class="txt[^"]*"[^>]*>/);
    if (inner === null) return { html: "", images: [] };
    inner = stripAdBlocks(inner);
    inner = inner
      .replace(/New novel chapters are published on Freewebnovel\.com\./g, "")
      .replace(/The source of this content is Freewebnᴏvel\.com\./g, "")
      .replace(/☞ We are moving Freewebnovel\.com to Libread\.com, Please visit libread\.com for more chapters! ☜/g, "");
    return { html: inner, images: [] };
  }
});