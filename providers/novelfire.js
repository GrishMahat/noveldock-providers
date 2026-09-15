// NovelFire provider for novelfire.net
// Browse/search/novel pages are plain HTML; the chapter list comes from the
// site's DataTables AJAX endpoint (single request, length=-1).

var nfBaseUrl = "https://novelfire.net";

var nfCategories = [
  { name: "All", value: "status-all" },
  { name: "Completed", value: "status-completed" },
  { name: "Ongoing", value: "status-ongoing" }
];

var nfOrders = [
  { name: "Popular", value: "sort-popular" },
  { name: "New", value: "sort-new" },
  { name: "Updates", value: "sort-latest-release" }
];

var nfGenres = [
  { name: "All", value: "all" },
  { name: "Action", value: "action" },
  { name: "Adult", value: "adult" },
  { name: "Adventure", value: "adventure" },
  { name: "Anime", value: "anime" },
  { name: "Arts", value: "arts" },
  { name: "Comedy", value: "comedy" },
  { name: "Drama", value: "drama" },
  { name: "Eastern", value: "eastern" },
  { name: "Ecchi", value: "ecchi" },
  { name: "Fan-fiction", value: "fan-fiction" },
  { name: "Fantasy", value: "fantasy" },
  { name: "Game", value: "game" },
  { name: "Gender-bender", value: "gender-bender" },
  { name: "Harem", value: "harem" },
  { name: "Historical", value: "historical" },
  { name: "Horror", value: "horror" },
  { name: "Isekai", value: "isekai" },
  { name: "Josei", value: "josei" },
  { name: "Lgbt", value: "lgbt" },
  { name: "Magic", value: "magic" },
  { name: "Magical-realism", value: "magical-realism" },
  { name: "Manhua", value: "manhua" },
  { name: "Martial-arts", value: "martial-arts" },
  { name: "Mature", value: "mature" },
  { name: "Mecha", value: "mecha" },
  { name: "Military", value: "military" },
  { name: "Modern-life", value: "modern-life" },
  { name: "Movies", value: "movies" },
  { name: "Mystery", value: "mystery" },
  { name: "Other", value: "other" },
  { name: "Psychological", value: "psychological" },
  { name: "Realistic-fiction", value: "realistic-fiction" },
  { name: "Reincarnation", value: "reincarnation" },
  { name: "Romance", value: "romance" },
  { name: "School-life", value: "school-life" },
  { name: "Sci-fi", value: "sci-fi" },
  { name: "Seinen", value: "seinen" },
  { name: "Shoujo", value: "shoujo" },
  { name: "Shoujo-ai", value: "shoujo-ai" },
  { name: "Shounen", value: "shounen" },
  { name: "Shounen-ai", value: "shounen-ai" },
  { name: "Slice-of-life", value: "slice-of-life" },
  { name: "Smut", value: "smut" },
  { name: "Sports", value: "sports" },
  { name: "Supernatural", value: "supernatural" },
  { name: "System", value: "system" },
  { name: "Tragedy", value: "tragedy" },
  { name: "Urban", value: "urban" },
  { name: "Urban-life", value: "urban-life" },
  { name: "Video-games", value: "video-games" },
  { name: "War", value: "war" },
  { name: "Wuxia", value: "wuxia" },
  { name: "Xianxia", value: "xianxia" },
  { name: "Xuanhuan", value: "xuanhuan" },
  { name: "Yaoi", value: "yaoi" },
  { name: "Yuri", value: "yuri" }
];

// Numeric post id (a#novel-report[report-post_id]) and slug of the novel
// whose info was parsed last. The chapters AJAX endpoint needs the post id,
// which is not part of the novel URL, so it is captured in novelInfo and
// consumed by chaptersApiUrl (same flow as the app: info first, chapters
// second, one runtime per provider).
var nfPostId = null;
var nfSlug = null;

function nfFilterIndex(f, id, max) {
  var v = f ? f[id] : undefined;
  if (typeof v === "number" && v >= 0 && v < max) return v;
  return 0;
}

/// Inner HTML of the first <div ... id="content" ...>, balancing nested
/// divs. Returns null when the block cannot be located.
function nfContentDiv(html) {
  var open = /<div[^>]*\bid\s*=\s*["']content["'][^>]*>/i.exec(html);
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

function nfParseNovelItems(html) {
  var results = [];
  var items = matchAll(
    html,
    /<li[^>]*class="[^"]*novel-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g
  );
  for (var i = 0; i < items.length; i++) {
    var card = items[i][1];
    var aOpen = first(card, /(<a[^>]*>)/);
    var href = aOpen ? attr(aOpen, "href") : null;
    var title = aOpen ? attr(aOpen, "title") : null;
    if (!title) {
      title = first(card, /<h4[^>]*class="[^"]*novel-title[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
    }
    if (!href || !title) continue;
    var img = first(card, /(<img[^>]*>)/);
    var cover = img ? attr(img, "data-src") || attr(img, "src") : null;
    results.push({
      title: textOf(title),
      url: absUrl(nfBaseUrl, href),
      cover: cover ? absUrl(nfBaseUrl, cover) : null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  var hasNextPage = /<a[^>]*>\s*Next\s*<\/a>/i.test(html) ||
    /rel="next"/i.test(html);
  return { results: results, hasNextPage: hasNextPage };
}

function nfStatusOf(html) {
  var stats = matchAll(
    html,
    /<span[^>]*>([\s\S]*?)<\/span>/g
  );
  for (var i = 0; i < stats.length; i++) {
    var inner = stats[i][1];
    if (inner.toLowerCase().indexOf("status") === -1) continue;
    var strong = first(inner, /<strong[^>]*>([\s\S]*?)<\/strong>/);
    var s = textOf(strong || "").toLowerCase().trim();
    if (!s) return null;
    if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1 ||
        s.indexOf("releasing") !== -1) return "ongoing";
    if (s.indexOf("complete") !== -1 || s === "done") return "completed";
    if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
    if (s.indexOf("drop") !== -1) return "dropped";
    if (s.indexOf("stub") !== -1) return "stubbed";
    return s;
  }
  return null;
}

register({
  id: "novelfire",
  name: "NovelFire",
  baseUrl: nfBaseUrl,
  lang: "en",
  nsfw: true,
  version: "1.0.0",

  filters: [
    {
      type: "select",
      id: "category",
      name: "Status",
      options: nfCategories.map(function(o) { return o.name; }),
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: nfOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: nfGenres.map(function(g) { return g.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var cat = nfCategories[nfFilterIndex(f, "category", nfCategories.length)].value;
    var order = nfOrders[nfFilterIndex(f, "order", nfOrders.length)].value;
    var genre = nfGenres[nfFilterIndex(f, "genre", nfGenres.length)].value;
    return nfBaseUrl + "/genre-" + genre + "/" + order + "/" + cat +
      "/all-novel?page=" + (page || 1);
  },

  // --- Latest (updates sort, any status) ---
  latestUrl: function(page) {
    return nfBaseUrl + "/genre-all/sort-latest-release/status-all/all-novel?page=" +
      (page || 1);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return nfBaseUrl + "/search/?keyword=" +
      encodeURIComponent((query || "").trim()).replace(/%20/g, "+") +
      "&page=" + (page || 1);
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return nfParseNovelItems(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(nfBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var infoBlock = first(
      html,
      /<div[^>]*class="[^"]*novel-info[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*novel-body[^"]*"/i
    ) || html;

    var title = first(infoBlock, /<h1[^>]*class="[^"]*novel-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
      first(html, /<h1[^>]*class="[^"]*novel-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    if (!title) return empty;

    var reportTag = first(html, /(<a[^>]*id="novel-report"[^>]*>)/i);
    var postId = reportTag ? attr(reportTag, "report-post_id") : null;
    nfPostId = postId || null;

    var authorBlock = first(infoBlock, /<div[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    var author = authorBlock
      ? textOf(first(authorBlock, /<a[^>]*>([\s\S]*?)<\/a>/i) || "")
      : null;

    var coverTag = first(html, /(<figure[^>]*class="[^"]*cover[^"]*"[^>]*>[\s\S]*?<\/figure>)/i);
    var coverImg = coverTag ? first(coverTag, /(<img[^>]*>)/) : null;
    var cover = coverImg ? attr(coverImg, "src") || attr(coverImg, "data-src") : null;

    var description = first(
      html,
      /<meta[^>]*itemprop="description"[^>]*content="([^"]*)"/i
    ) || first(
      html,
      /<meta[^>]*content="([^"]*)"[^>]*itemprop="description"[^>]*>/i
    );

    var genres = [];
    var catBlock = first(infoBlock, /<div[^>]*class="[^"]*categories[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (catBlock) {
      var lis = matchAll(catBlock, /<li[^>]*>([\s\S]*?)<\/li>/g);
      for (var i = 0; i < lis.length; i++) {
        var g = textOf(lis[i][1]);
        if (g) genres.push(g);
      }
    }

    var rating = null;
    var ratingText = first(
      html,
      /<div[^>]*class="[^"]*rating[^"]*"[^>]*>[\s\S]*?<strong[^>]*class="[^"]*nub[^"]*"[^>]*>([\s\S]*?)<\/strong>/i
    );
    if (ratingText) {
      var stars = parseFloat(ratingText.trim());
      if (!isNaN(stars)) rating = Math.round(stars * 200);
    }

    return {
      title: textOf(title),
      author: author || null,
      cover: cover ? absUrl(nfBaseUrl, cover) : null,
      status: nfStatusOf(infoBlock),
      genres: genres,
      description: description ? unescapeHtml(description) : "",
      chapters: [],
      rating: rating
    };
  },

  // --- Chapters (DataTables AJAX, all chapters in one request) ---
  chaptersApiUrl: function(bookId, page) {
    if ((page || 0) > 0) return null;
    if (!bookId) return null;
    nfSlug = String(bookId).replace(/\/$/, "").split("/").pop();
    var postId = nfPostId;
    if (!postId) return null;
    var q = [
      ["draw", "1"],
      ["columns[0][data]", "n_sort"],
      ["columns[0][name]", "cmm_posts_detail.n_sort"],
      ["columns[0][searchable]", "true"],
      ["columns[0][orderable]", "true"],
      ["columns[0][search][value]", ""],
      ["columns[0][search][regex]", "false"],
      ["columns[1][data]", "bookmark_created_at"],
      ["columns[1][name]", "bookmark_chapters.created_at"],
      ["columns[1][searchable]", "false"],
      ["columns[1][orderable]", "true"],
      ["columns[1][search][value]", ""],
      ["columns[1][search][regex]", "false"],
      ["order[0][column]", "0"],
      ["order[0][dir]", "asc"],
      ["order[0][name]", "cmm_posts_detail.n_sort"],
      ["start", "0"],
      ["length", "-1"],
      ["search[value]", ""],
      ["search[regex]", "false"],
      ["post_id", postId],
      ["only_bookmark", "false"]
    ].map(function(kv) {
      return encodeURIComponent(kv[0]) + "=" + encodeURIComponent(kv[1]);
    }).join("&");
    return nfBaseUrl + "/ajax/listChapterDataAjax?" + q;
  },

  chapterList: function(data) {
    var text = typeof data === "string" ? data.trim() : "";
    if (!text || !nfSlug) return [];
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return [];
    }
    var items = parsed && parsed.data;
    if (!items || !items.length) return [];
    var chapters = [];
    for (var i = 0; i < items.length; i++) {
      var ch = items[i];
      var nSort = ch.n_sort;
      if (nSort === undefined || nSort === null) continue;
      chapters.push({
        name: ch.title || ("Chapter " + nSort),
        url: nfBaseUrl + "/book/" + nfSlug + "/chapter-" + nSort
      });
    }
    return chapters;
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var title = first(
      html,
      /<span[^>]*class="[^"]*chapter-title[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );
    var content = nfContentDiv(html);
    if (!content) return out;
    content = content.replace(/<img[^>]*disable-blocker\.jpg[^>]*>/gi, "");
    var titleText = textOf(title || "");
    if (titleText) {
      var firstPara = first(content, /<p[^>]*>([\s\S]*?)<\/p>/i);
      var norm = function(s) {
        return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      };
      if (norm(firstPara) !== norm(titleText)) {
        content = "<p>" + titleText + "</p>" + content;
      }
    }
    out.html = content;
    return out;
  }
});
