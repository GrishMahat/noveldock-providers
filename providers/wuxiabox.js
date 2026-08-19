// WuxiaBox provider for wuxiabox.com
// Ported from the original Kotlin WuxiaBoxProvider.

var baseUrl = "https://www.wuxiabox.com";

var wuxiaGenres = [
  { name: "All", slug: "all" },
  { name: "Fan-Fiction", slug: "fan-fiction" },
  { name: "Faloo", slug: "faloo" },
  { name: "Action", slug: "action" },
  { name: "Adventure", slug: "adventure" },
  { name: "Comedy", slug: "comedy" },
  { name: "Contemporary Romance", slug: "contemporary-romance" },
  { name: "Drama", slug: "drama" },
  { name: "Eastern Fantasy", slug: "eastern-fantasy" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Fantasy Romance", slug: "fantasy-romance" },
  { name: "Gender Bender", slug: "gender-bender" },
  { name: "Harem", slug: "harem" },
  { name: "Historical", slug: "historical" },
  { name: "Horror", slug: "horror" },
  { name: "Josei", slug: "josei" },
  { name: "Lolicon", slug: "lolicon" },
  { name: "Magical Realism", slug: "magical-realism" },
  { name: "Martial Arts", slug: "martial-arts" },
  { name: "Mecha", slug: "mecha" },
  { name: "Mystery", slug: "mystery" },
  { name: "Psychological", slug: "psychological" },
  { name: "Romance", slug: "romance" },
  { name: "School Life", slug: "school-life" },
  { name: "Sci-fi", slug: "sci-fi" },
  { name: "Seinen", slug: "seinen" },
  { name: "Shoujo", slug: "shoujo" },
  { name: "Shounen", slug: "shounen" },
  { name: "Shounen Ai", slug: "shounen-ai" },
  { name: "Slice of Life", slug: "slice-of-life" },
  { name: "Sports", slug: "sports" },
  { name: "Supernatural", slug: "supernatural" },
  { name: "Tragedy", slug: "tragedy" },
  { name: "Video Games", slug: "video-games" },
  { name: "Wuxia", slug: "wuxia" },
  { name: "Xianxia", slug: "xianxia" },
  { name: "Xuanhuan", slug: "xuanhuan" },
  { name: "Yaoi", slug: "yaoi" },
  { name: "Two-dimensional", slug: "two-dimensional" },
  { name: "Erciyuan", slug: "erciyuan" },
  { name: "Game", slug: "game" },
  { name: "Military", slug: "military" },
  { name: "Urban Life", slug: "urban-life" },
  { name: "Yuri", slug: "yuri" },
  { name: "Chinese", slug: "chinese" },
  { name: "Japanese", slug: "japanese" },
  { name: "Hentai", slug: "hentai" },
  { name: "Isekai", slug: "isekai" },
  { name: "Magic", slug: "magic" },
  { name: "Shoujo Ai", slug: "shoujo-ai" },
  { name: "Urban", slug: "urban" },
  { name: "Virtual Reality", slug: "virtual-reality" },
  { name: "Wuxia Xianxia", slug: "wuxia_xianxia" },
  { name: "Official Circles", slug: "official_circles" },
  { name: "Science Fiction", slug: "science_fiction" },
  { name: "Suspense Thriller", slug: "suspense_thriller" },
  { name: "Travel Through Time", slug: "travel_through_time" }
];

var wuxiaStatus = ["All", "Completed", "Ongoing"];
var wuxiaSort = [
  { name: "Popular", slug: "onclick" },
  { name: "New", slug: "newstime" },
  { name: "Updates", slug: "lastdotime" }
];

function applyWuxiaFilters(filters) {
  var out = {
    genre: { index: 0, slug: "all" },
    status: { index: 0, value: "all" },
    sort: { index: 1, slug: "newstime" }
  };
  var f = filters || {};
  if (typeof f.genre === "number" && f.genre >= 0 && f.genre < wuxiaGenres.length) {
    out.genre = { index: f.genre, slug: wuxiaGenres[f.genre].slug };
  }
  if (typeof f.status === "number" && f.status >= 0 && f.status < wuxiaStatus.length) {
    // The site only accepts the lowercase "all" slug for the unfiltered
    // status; "All" (capitalized) returns an empty list page.
    var statusValue = wuxiaStatus[f.status];
    if (statusValue === "All") statusValue = "all";
    out.status = { index: f.status, value: statusValue };
  }
  if (f.sort instanceof Array && f.sort.length >= 1 && typeof f.sort[0] === "number") {
    var s = f.sort[0];
    if (s >= 0 && s < wuxiaSort.length) {
      out.sort = { index: s, slug: wuxiaSort[s].slug };
      if (f.sort.length >= 2) out.sort.ascending = !!f.sort[1];
    }
  }
  return out;
}

register({
  id: "wuxiabox",
  name: "WuxiaBox",
  lang: "en",
  baseUrl: baseUrl,

  // WuxiaBox search is ECMS keyword-only, so genre/status/sort cannot be
  // expressed in search. Let the app run normal search when filters are
  // active instead of sending them into a search URL that ignores (or
  // breaks on) them.
  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: wuxiaGenres.map(function(g) { return g.name; }),
      defaultIndex: 0
    },
    {
      type: "select",
      id: "status",
      name: "Status",
      options: wuxiaStatus,
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "sort",
      name: "Sort by",
      options: wuxiaSort.map(function(s) { return s.name; }),
      defaultIndex: 1,
      defaultAscending: false
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = applyWuxiaFilters(filters);
    return baseUrl + "/list/" + f.genre.slug + "/" + f.status.value + "-" + f.sort.slug + "-" + ((page || 1) - 1) + ".html";
  },

  // --- Latest (respects genre/status; always sorted by last update) ---
  latestUrl: function(page, filters) {
    var f = applyWuxiaFilters(filters);
    return baseUrl + "/list/" + f.genre.slug + "/" + f.status.value + "-lastdotime-" + ((page || 1) - 1) + ".html";
  },

  // --- Search ---
  searchConfig: function() {
    return {
      method: "POST",
      url: "https://www.wuxiabox.com/e/search/index.php",
      fields: {
        show: "title",
        tempid: "1",
        tbname: "news",
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://www.wuxiabox.com/",
        "Origin": "https://www.wuxiabox.com",
        "X-Requested-With": "XMLHttpRequest",
      },
      resultUrlPattern: "https://www.wuxiabox.com/e/search/result/index.php?page={page}&searchid={searchid}",
      searchIdRegex: "searchid=(\\d+)",
    };
  },

  searchUrl: function(query, page, filters) {
    var encoded = encodeURIComponent(query);
    return "https://www.wuxiabox.com/e/search/index.php?show=title&tempid=1&tbname=news&keyboard=" + encoded;
  },

  searchResults: function(html) {
    var results = [];

    // Each item: <li class="novel-item"> with <a title="..." href="..."> and <img>
    var items = matchAll(html, /<li class="novel-item">[\s\S]*?<\/li>/g);
    for (var i = 0; i < items.length; i++) {
      var item = items[i][0];

      // Extract title from a[title] attribute or h4.novel-title
      var title = attr(item, "title") || "";
      if (!title) {
        var h4Match = /<h4 class="novel-title">([^<]*)<\/h4>/.exec(item);
        title = h4Match ? h4Match[1].trim() : "";
      }

      // Extract URL from a href
      var href = attr(item, "href");
      var url = href ? absUrl(baseUrl, href) : "";

      // Extract cover image from img data-src or src
      var cover = attr(item, "data-src") || attr(item, "src");
      cover = cover ? absUrl(baseUrl, cover) : null;

      if (title && url) {
        results.push({
          title: title,
          url: url,
          cover: cover,
          author: null,
          summary: null,
        });
      }
    }

    // Next page: assume there is one when the page is full.
    var hasNextPage = results.length >= 20;

    return {
      results: results,
      hasNextPage: hasNextPage,
    };
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(baseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    // Title: <h1 itemprop="name" class="novel-title text2row">...
    var title = first(html, /<h1[^>]*class="[^"]*novel-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || "";

    // Author: <div class="author"> with [itemprop=author]
    var author = first(html, /<div class="author"[^>]*>[\s\S]*?itemprop="author"[^>]*>([^<]*)<\/span>/);
    author = author ? author.trim() : null;

    // Synopsis: meta[itemprop=description] content attribute
    var description = first(html, /<meta[^>]*itemprop="description"[^>]*content="([^"]*)"/) || "";
    if (!description) {
      var descMatch = /<div class="summary[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html);
      description = descMatch ? textOf(descMatch[1]) : "";
    }

    // Cover: div.fixed-img img data-src (or src)
    var cover = null;
    var coverDiv = first(html, /(<div class="fixed-img">[\s\S]*?<img[^>]*>)/);
    if (coverDiv) {
      var coverSrc = attr(coverDiv, "data-src") || attr(coverDiv, "src");
      cover = coverSrc ? absUrl(baseUrl, coverSrc) : null;
    }

    // Status: <strong>Ongoing</strong><small>Status</small> in header-stats
    var status = first(html, /<strong[^>]*>(Ongoing|Completed)<\/strong>\s*<small>Status<\/small>/);

    // Extract bookId from the "start reading" link:
    // <a id="readchapterbtn" href="/novel/trxs10939_1.html" ...>
    var bookId = first(html, /<a id="readchapterbtn"[^>]*href="\/novel\/([a-z0-9]+)_/);

    // Genres/tags: <a ... class="property-item">Fan-Fiction</a>
    var genres = [];
    var tagMatches = matchAll(html, /<a[^>]*class="property-item"[^>]*>([^<]*)<\/a>/g);
    for (var i = 0; i < tagMatches.length; i++) {
      var tagText = tagMatches[i][1].trim();
      if (tagText) genres.push(tagText);
    }

    // Chapters are loaded separately via AJAX
    var chapters = [];

    return {
      title: title,
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: description,
      chapters: chapters,
      bookId: bookId,
    };
  },

  // --- Chapter List (AJAX) ---
  chaptersApiUrl: function(bookId, page) {
    return "https://www.wuxiabox.com/e/extend/fy.php?page=" + (page || 0) + "&wjm=" + bookId + "&X-Requested-With=XMLHttpRequest&_=" + Date.now();
  },

  chapterList: function(html) {
    var chapters = [];
    var items = matchAll(html, /<li[^>]*>[\s\S]*?<\/li>/g);
    for (var i = 0; i < items.length; i++) {
      var item = items[i][0];
      var linkMatch = /<a[^>]*href="([^"]*)"[^>]*>/.exec(item);
      var titleMatch = /<strong class="chapter-title">([^<]*)<\/strong>/.exec(item);
      if (linkMatch && titleMatch) {
        chapters.push({
          name: titleMatch[1].trim(),
          url: absUrl(baseUrl, linkMatch[1]),
          date: null,
        });
      }
    }
    return chapters;
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    // Content is in div.chapter-content. Handle nested divs by counting depth.
    var startTag = '<div class="chapter-content">';
    var startIdx = html.indexOf(startTag);
    var content = html;

    if (startIdx !== -1) {
      var contentStart = startIdx + startTag.length;
      var depth = 1;
      var idx = contentStart;

      // Find the matching closing </div> by counting nesting depth
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
            content = html.substring(contentStart, nextClose);
          } else {
            idx = nextClose + 6;
          }
        }
      }
    }

    // Remove ad placeholders
    content = content.replace(/<img[^>]*disable-blocker[^>]*>/g, '');
    content = content.replace(/<script[\s\S]*?<\/script>/g, '');
    content = content.replace(/<div[^>]*align="center"[^>]*>[\s\S]*?<\/div>/g, '');

    // Extract images
    var images = [];
    var imgMatches = matchAll(content, /<img[^>]*src="([^"]*)"[^>]*>/g);
    for (var i = 0; i < imgMatches.length; i++) {
      var src = imgMatches[i][1];
      images.push({
        url: absUrl(baseUrl, src) || src,
        alt: null,
      });
    }

    return {
      html: content,
      images: images,
    };
  },
});