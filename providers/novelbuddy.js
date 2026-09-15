// NovelBuddy provider for novelbuddy.me
// Search/browse/chapters run on the api.novelbuddy.me JSON API; novel info
// is parsed from the page's __NEXT_DATA__ payload, chapter text from plain
// HTML (div.novel-tts-content).

var nbApiUrl = "https://api.novelbuddy.me/titles";
var nbBaseUrl = "https://novelbuddy.me";

var nbOrders = [
  { name: "Default Order", value: "" },
  { name: "Latest Updated", value: "latest" },
  { name: "Most Popular", value: "popular" },
  { name: "Highest Rating", value: "rating" },
  { name: "Most Viewed", value: "views" },
  { name: "Most Chapters", value: "chapters" }
];

var nbGenres = [
  "Action", "ActionAdventure", "Adult", "Adventure", "Adventurei",
  "Comedy", "Drama", "Eastern", "Easterni", "Ecchi", "Ecchi Fantasy",
  "Fan-Fiction", "Fantasy", "Gam", "Game", "Games", "Gender Bender",
  "Harem", "Historical", "Horror", "Isekai", "Josei", "Light Novel",
  "Lolicon", "Magic", "Martial Arts", "Martial ArtsReincarnation",
  "Mature", "Mecha", "Military", "Modern Life", "Movies", "Mystery",
  "Psychologic", "Psychological", "Reincarnatio", "Reincarnation",
  "Romanc", "Romance", "Romance.Adventure", "Romance.Harem",
  "Romance.Smut", "RomanceAction", "RomanceAdventure", "RomanceHarem",
  "Romancei", "Romancel", "Romancem", "School Life", "Sci-fi",
  "Seinen", "Seinen Wuxia", "Shoujo", "Shoujo Ai", "Shounen",
  "Shounen Ai", "Slice of Lif", "Slice Of Life", "Slice of Lifel",
  "Smut", "Sports", "Superna", "Supernatural", "System", "Thriller",
  "Tragedy", "Urban", "Urban Life", "Wuxia", "Xianxia", "Xuanhuan",
  "Yaoi", "Yuri"
];

// API id of the novel whose info was parsed last (from __NEXT_DATA__).
// The chapters endpoint needs it and it is not part of the novel URL.
var nbBookId = null;

function nbGenreSlug(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function nbParseItems(text) {
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { results: [], hasNextPage: false };
  }
  var items = parsed && parsed.data && parsed.data.items;
  if (!items || !items.length) return { results: [], hasNextPage: false };
  var results = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.name || !item.url) continue;
    results.push({
      title: item.name,
      url: absUrl(nbBaseUrl, item.url),
      cover: item.cover ? absUrl(nbBaseUrl, item.cover) : null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  var pag = (parsed.data && (parsed.data.pagination || parsed.pagination)) || {};
  var hasNextPage = false;
  if (typeof pag.page === "number" && typeof pag.totalPages === "number") {
    hasNextPage = pag.page < pag.totalPages;
  } else if (typeof pag.hasNextPage === "boolean") {
    hasNextPage = pag.hasNextPage;
  } else if (typeof pag.total === "number" && typeof pag.limit === "number" &&
    typeof pag.page === "number") {
    hasNextPage = pag.page * pag.limit < pag.total;
  }
  return { results: results, hasNextPage: hasNextPage };
}

function nbNextData(html) {
  var blob = first(
    html,
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!blob) return null;
  try {
    return JSON.parse(blob);
  } catch (e) {
    return null;
  }
}

function nbStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("cancel") !== -1 || s.indexOf("drop") !== -1) return "dropped";
  return s;
}

/// Inner HTML of the first <div ... class="...novel-tts-content...">,
/// balancing nested divs. Returns null when not found.
function nbContentDiv(html) {
  var open = /<div[^>]*class="[^"]*novel-tts-content[^"]*"[^>]*>/i.exec(html);
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

register({
  id: "novelbuddy",
  name: "NovelBuddy",
  baseUrl: nbBaseUrl,
  lang: "en",
  nsfw: true,
  version: "1.0.0",

  filters: [
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: nbOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: ["All"].concat(nbGenres),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var orderIdx = typeof f.order === "number" &&
      f.order >= 0 && f.order < nbOrders.length ? f.order : 0;
    var genreIdx = typeof f.genre === "number" &&
      f.genre >= 0 && f.genre <= nbGenres.length ? f.genre : 0;
    var params = [];
    if (genreIdx > 0) {
      params.push("genres=" + encodeURIComponent(nbGenreSlug(nbGenres[genreIdx - 1])));
    }
    var sort = nbOrders[orderIdx].value;
    if (sort) params.push("sort=" + encodeURIComponent(sort));
    params.push("page=" + (page || 1));
    params.push("limit=24");
    return nbApiUrl + "/search?" + params.join("&");
  },

  // --- Latest ---
  latestUrl: function(page) {
    return nbApiUrl + "/search?sort=latest&page=" + (page || 1) + "&limit=24";
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return nbApiUrl + "/search?page=1&limit=7&q=" +
      encodeURIComponent((query || "").trim());
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return nbParseItems(html.trim());
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    var url = absUrl(nbBaseUrl, novelUrl) || novelUrl;
    return url.replace("novelbuddy.com", "novelbuddy.me");
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;
    var data = nbNextData(html);
    var manga = data && data.props && data.props.pageProps &&
      data.props.pageProps.initialManga;
    if (!manga || !manga.name) return empty;

    nbBookId = manga.id || null;

    var authors = [];
    if (manga.authors && manga.authors.length) {
      for (var i = 0; i < manga.authors.length; i++) {
        if (manga.authors[i] && manga.authors[i].name) {
          authors.push(manga.authors[i].name);
        }
      }
    }
    var genres = [];
    if (manga.genres && manga.genres.length) {
      for (var j = 0; j < manga.genres.length; j++) {
        if (manga.genres[j] && manga.genres[j].name) {
          genres.push(manga.genres[j].name);
        }
      }
    }

    return {
      title: manga.name,
      author: authors.length ? authors.join(", ") : null,
      cover: manga.cover ? absUrl(nbBaseUrl, manga.cover) : null,
      status: nbStatusOf(manga.status),
      genres: genres,
      description: manga.summary ? textOf(manga.summary) : "",
      chapters: [],
      rating: null
    };
  },

  // --- Chapters (JSON API, id captured from __NEXT_DATA__) ---
  chaptersApiUrl: function(bookId, page) {
    if ((page || 0) > 0) return null;
    if (!nbBookId) return null;
    return nbApiUrl + "/" + encodeURIComponent(nbBookId) + "/chapters";
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
    var chapters = parsed && parsed.data && parsed.data.chapters;
    if (!chapters || !chapters.length) return [];
    // API returns newest first; reader expects oldest first.
    var out = [];
    for (var i = chapters.length - 1; i >= 0; i--) {
      var ch = chapters[i];
      if (!ch.name || !ch.url) continue;
      out.push({
        name: ch.name,
        url: absUrl(nbBaseUrl, ch.url)
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
    var content = nbContentDiv(html);
    if (!content) return out;
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    content = content.replace(
      /<(div|p|section|span)[^>]*class="[^"]*\b(ads|hidden)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
      ""
    );
    out.html = content;
    return out;
  }
});
