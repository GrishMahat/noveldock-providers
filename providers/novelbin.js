// NovelBin provider for novelarrow.com
// Port of the original Kotlin NovelBinProvider (QuickNovel). The site's
// official api-web JSON API drives search/latest and the chapter list;
// genre browsing is plain HTML.

var baseUrl = "https://novelarrow.com";
var coverBase = "https://images.novelarrow.com/novel_240_360/";

var nbSorts = [
  { name: "Popular this week", value: "POPULAR" },
  { name: "Last updated", value: "" },
  { name: "Recently added", value: "NEW" },
  { name: "Top (most viewed)", value: "ALL_TIME" },
  { name: "Top rated", value: "RATING" },
  { name: "Most chapters", value: "CHAPTERS" }
];

var nbGenres = [
  { name: "All", slug: "" },
  { name: "Action", slug: "action" },
  { name: "Adult", slug: "adult" },
  { name: "Adventure", slug: "adventure" },
  { name: "Anime & Comics", slug: "anime-&-comics" },
  { name: "Comedy", slug: "comedy" },
  { name: "Drama", slug: "drama" },
  { name: "Eastern", slug: "eastern" },
  { name: "Ecchi", slug: "ecchi" },
  { name: "Fan-fic", slug: "fan-fic" },
  { name: "Fan-fiction", slug: "fan-fiction" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Game", slug: "game" },
  { name: "Gender Bender", slug: "gender-bender" },
  { name: "Harem", slug: "harem" },
  { name: "Historical", slug: "historical" },
  { name: "Horror", slug: "horror" },
  { name: "Isekai", slug: "isekai" },
  { name: "Josei", slug: "josei" },
  { name: "LGBT+", slug: "lgbt+" },
  { name: "LitRPG", slug: "litrpg" },
  { name: "Magic", slug: "magic" },
  { name: "Magical Realism", slug: "magical-realism" },
  { name: "Martial Arts", slug: "martial-arts" },
  { name: "Mature", slug: "mature" },
  { name: "Mecha", slug: "mecha" },
  { name: "Military", slug: "military" },
  { name: "Modern Life", slug: "modern-life" },
  { name: "Mystery", slug: "mystery" },
  { name: "Other", slug: "other" },
  { name: "Psychological", slug: "psychological" },
  { name: "Realistic", slug: "realistic" },
  { name: "Reincarnation", slug: "reincarnation" },
  { name: "Romance", slug: "romance" },
  { name: "School Life", slug: "school-life" },
  { name: "Sci-Fi", slug: "sci-fi" },
  { name: "Seinen", slug: "seinen" },
  { name: "Shoujo", slug: "shoujo" },
  { name: "Shoujo Ai", slug: "shoujo-ai" },
  { name: "Shounen", slug: "shounen" },
  { name: "Shounen Ai", slug: "shounen-ai" },
  { name: "Slice of Life", slug: "slice-of-life" },
  { name: "Smut", slug: "smut" },
  { name: "Sports", slug: "sports" },
  { name: "Supernatural", slug: "supernatural" },
  { name: "System", slug: "system" },
  { name: "Thriller", slug: "thriller" },
  { name: "Tragedy", slug: "tragedy" },
  { name: "Urban", slug: "urban" },
  { name: "Video Games", slug: "video-games" },
  { name: "War", slug: "war" },
  { name: "Wuxia", slug: "wuxia" },
  { name: "Xianxia", slug: "xianxia" },
  { name: "Xuanhuan", slug: "xuanhuan" },
  { name: "Yaoi", slug: "yaoi" },
  { name: "Yuri", slug: "yuri" }
];

// "api" mode responses are JSON (search/latest/all-genre), "browse" mode
// responses are HTML genre listings. Tracked per call site below.
var moduleMode = "api";

// Slug of the novel whose chapter list is being fetched (set by
// chaptersApiUrl, consumed by chapterList). The chapter JSON itself does
// not reference the novel slug.
var moduleBookId = null;

function apiListUrl(sort, page) {
  return (
    baseUrl + "/api-web/novels?limit=20&page=" + (page || 1) +
    "&status=all&sort=" + (sort || "LASTEST") + "&genre=ALL&keyword="
  );
}

function parseApiResults(text) {
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { results: [], hasNextPage: false };
  }
  var items = data && data.items;
  if (!items || !items.length) return { results: [], hasNextPage: false };

  var results = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var id = item.novel_id;
    if (!id) continue;
    results.push({
      title: item.novel_name || "",
      url: baseUrl + "/novel/" + id,
      cover: coverBase + id + ".jpg",
      author: item.novel_author || null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }

  var pag = data.pagination || {};
  var hasNextPage =
    typeof pag.page === "number" &&
    typeof pag.totalPages === "number" &&
    pag.page < pag.totalPages;
  return { results: results, hasNextPage: hasNextPage };
}

function parseBrowseResults(html) {
  var results = [];
  var cards = matchAll(
    html,
    /<article[^>]*class="[^"]*site-panel[^"]*group[^"]*flex[^"]*"[^>]*>([\s\S]*?)<\/article>/g
  );
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i][1];
    var href = first(card, /<a[^>]*href="([^"]+)"/);
    if (!href) continue;
    var title = first(card, /<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!title) continue;
    var img = first(card, /<img[^>]*src="([^"]+)"/);
    results.push({
      title: textOf(title),
      url: absUrl(baseUrl, href),
      cover: img ? absUrl(baseUrl, img) : null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  var hasNextPage = /<a[^>]*href="[^"]*page=\d+[^"]*"[^>]*>\s*Next/.test(html);
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "novelbin",
  name: "NovelBin",
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
      options: nbSorts.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: nbGenres.map(function(g) { return g.name; }),
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
    if (sortIndex < 0 || sortIndex >= nbSorts.length) sortIndex = 0;
    if (genreIndex < 0 || genreIndex >= nbGenres.length) genreIndex = 0;

    var sort = nbSorts[sortIndex].value;
    var genre = nbGenres[genreIndex].slug;
    if (genre) {
      moduleMode = "browse";
      return (
        baseUrl + "/genre/" + genre +
        "?sort=" + encodeURIComponent(sort) +
        "&page=" + (page || 1)
      );
    }
    moduleMode = "api";
    return apiListUrl(sort, page);
  },

  // --- Latest (all novels, last updated first) ---
  latestUrl: function(page) {
    moduleMode = "api";
    return apiListUrl("LASTEST", page);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    moduleMode = "api";
    return (
      baseUrl + "/api-web/novels?limit=20&page=" + (page || 1) +
      "&status=all&sort=SEARCH_KEYWORD&genre=ALL&keyword=" +
      encodeURIComponent((query || "").trim())
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    var text = html.trim();
    if (text.charAt(0) === "{") return parseApiResults(text);
    return parseBrowseResults(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(baseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    // Title: og:title "… Novel | Read Online on NovelArrow" → strip suffix.
    var title = first(html, /property="og:title" content="([^"]*)"/);
    if (title) title = title.replace(/\s*Novel\s*\|\s*Read Online on NovelArrow\s*$/, "");
    title = title ? textOf(title) : "";

    var cover = first(html, /property="og:image" content="([^"]*)"/);
    var author = first(html, /name="author" content="([^"]*)"/);
    var description = first(html, /name="description" content="([^"]*)"/);

    var status = null;
    var statusMeta = first(html, /name="og:novel:status" content="([^"]*)"/);
    if (statusMeta) {
      var s = statusMeta.trim().toLowerCase();
      if (s.indexOf("hiatus") !== -1) s = "paused";
      status = s;
    }

    var genres = [];
    var catMeta = first(html, /name="category" content="([^"]*)"/);
    if (catMeta) {
      var g = catMeta.trim().toLowerCase();
      genres.push(g.charAt(0).toUpperCase() + g.slice(1));
    }

    return {
      title: title,
      author: author || null,
      cover: cover ? absUrl(baseUrl, cover) : null,
      status: status,
      genres: genres,
      description: description ? unescapeHtml(description) : "",
      chapters: [],
      rating: null,
    };
  },

  // --- Chapters (api-web JSON, single request with all chapters) ---
  chaptersApiUrl: function(bookId, page) {
    if (page > 0) return null;
    moduleBookId = bookId;
    return baseUrl + "/api-web/novels/" + bookId + "/chapters?sort=asc";
  },

  chapterList: function(data) {
    var text = typeof data === "string" ? data.trim() : "";
    if (!text || !moduleBookId) return [];
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return [];
    }
    var items = parsed && parsed.items;
    if (!items || !items.length) return [];
    if (Array.isArray(items[0])) items = items[0].concat.apply([], items);

    var chapters = [];
    for (var i = 0; i < items.length; i++) {
      var ch = items[i];
      if (ch.premium_content || ch.platinum_content) continue;
      if (!ch.chapter_id || !ch.chapter_name) continue;
      chapters.push({
        name: ch.chapter_name,
        url: baseUrl + "/api-web/novels/" + moduleBookId + "/chapters/" + ch.chapter_id
      });
    }
    return chapters;
  },

  // --- Chapter Content (chapter url already points at the API) ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    if (!html || typeof html !== "string") {
      return { html: "", images: [] };
    }
    var text = html.trim();
    if (text.charAt(0) !== "{") return { html: "", images: [] };
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { html: "", images: [] };
    }
    var content = parsed && parsed.item && parsed.item.chapterInfo
      ? parsed.item.chapterInfo.chapter_content
      : null;
    if (!content) return { html: "", images: [] };
    return { html: content, images: [] };
  }
});