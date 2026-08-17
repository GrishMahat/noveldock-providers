// NovelFull Provider — novelfull.com
// Parses NovelFull's HTML for novel search, info, and chapter content.
//
// Notes on chapter URLs:
// - The AJAX chapter list returns RELATIVE urls (/slug/chapter-N-title.html);
//   they are resolved against the baseUrl here. Constructed chapter-N.html
//   urls (without the title slug) return 404, so never build them yourself.
// - The /ajax-chapter-option endpoint returns 403 when the request referer
//   is a chapter page (2+); the app sends a neutral referer, which is fine.

var novelfullBase = "https://novelfull.com";

var novelfullGenres = [
  "All", "Action", "Adult", "Adventure", "Anime", "Comedy", "Drama",
  "Eastern", "Ecchi", "Fantasy", "Gender Bender", "Harem", "Historical",
  "Horror", "Josei", "Martial Arts", "Mature", "Mecha", "Military",
  "Modern Life", "Mystery", "Psychological", "Romance", "School Life",
  "Sci-fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai",
  "Slice of Life", "Smut", "Sports", "Supernatural", "Tragedy", "Wuxia",
  "Xianxia", "Xuanhuan"
];

var novelfullLists = ["Hot Novel", "Latest Release", "Completed Novel", "Most Popular"];
var novelfullListUrls = ["hot-novel", "latest-release-novel", "completed-novel", "most-popular"];

// Module-level state and helpers: provider functions are invoked with
// apply(null, ...), so `this` is not available inside them.
var novelId = null;

function fixPosterUrl(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return novelfullBase + url;
  return novelfullBase + "/" + url;
}

function novelfullAbs(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return novelfullBase + url;
  return novelfullBase + "/" + url;
}

function novelfullMainUrl(page, filters) {
  var f = filters || {};
  var listIndex = typeof f.list === "number" ? f.list : 0;
  var genreIndex = typeof f.genre === "number" ? f.genre : 0;
  if (listIndex < 0 || listIndex >= novelfullLists.length) listIndex = 0;

  var p = (page || 1);
  if (genreIndex > 0 && genreIndex < novelfullGenres.length) {
    return novelfullBase + "/genre/" + encodeURIComponent(novelfullGenres[genreIndex]) + "?page=" + p;
  }
  return novelfullBase + "/" + novelfullListUrls[listIndex] + "?page=" + p;
}

module.exports = {
  // --- Metadata ---
  id: "allnovel",
  name: "AllNovel",
  lang: "en",
  baseUrl: novelfullBase,
  version: "1.2.0",

  getProviderMetadata: function() {
    return {
      hasMainPage: true,
      hasSearch: true,
      hasChapterApi: true,
      hasLatest: true,
      hasFilters: true
    };
  },

  // Internal state: holds the numeric novel ID extracted from parseNovelInfo
  _novelId: null,

  // --- Main Page ---
  getMainPageUrl: function(page, filters) {
    return novelfullMainUrl(page, filters);
  },

  // --- Latest ---
  getLatestUrl: function(page) {
    return novelfullBase + "/latest-release-novel?page=" + (page || 1);
  },

  // --- Filters ---
  getFilters: function() {
    return [
      {
        type: "select",
        id: "list",
        name: "List",
        options: novelfullLists,
        defaultIndex: 0
      },
      {
        type: "select",
        id: "genre",
        name: "Genre",
        options: novelfullGenres,
        defaultIndex: 0
      }
    ];
  },

  // --- Search ---
  search: function (query, page) {
    return {
      url:
        novelfullBase + "/search?keyword=" +
        encodeURIComponent(query) +
        "&page=" +
        (page || 1),
    };
  },

  getSearchUrl: function (query, page) {
    return (
      novelfullBase + "/search?keyword=" +
      encodeURIComponent(query) +
      "&page=" +
      (page || 1)
    );
  },

  parseSearchResults: function (html) {
    var results = [];

    // Each result row: <div class="row"><div class="col-xs-2"><div><img
    // src="cover" class="cover"...> ... <h3 class="truyen-title">...<a
    // href="url" title="Title">Title</a> ... <span class="author">...
    var cardRe =
      /<div class="row">\s*<div class="col-xs-[23]">\s*<div>\s*<img[^>]*src="([^"]*)"[\s\S]*?<h3 class="truyen-title">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*title="([^"]*)"[^>]*>/gi;
    var match;

    while ((match = cardRe.exec(html)) !== null) {
      var title = match[3].trim();
      var url = match[2];
      if (!title || !url) continue;

      var cover = fixPosterUrl(match[1]);

      // Author appears right after the anchor, outside match[0]; look in a
      // bounded region past the end of this row.
      var author = null;
      var authorRe =
        /class="author">[\s\S]*?<span[^>]*>\s*<\/span>\s*([\s\S]*?)<\/span>/i.exec(
          html.slice(match.index, match.index + match[0].length + 1500)
        );
      if (authorRe) {
        author = authorRe[1].replace(/<[^>]*>/g, "").trim() || null;
      }

      results.push({
        title: title,
        url: novelfullAbs(url),
        cover: novelfullAbs(cover),
        author: author
      });
    }

    // Next page: <li class="next"> followed by an <a> link (the last page
    // uses <li class="next disabled"> with a <span>, which does not match).
    var hasNextPage = /<li class="next">\s*<a[^>]*href="/i.test(html);

    return { results: results, hasNextPage: hasNextPage };
  },

  // --- Novel Info ---
  getNovelInfoUrl: function (novelUrl) {
    return novelfullAbs(novelUrl);
  },

  parseNovelInfo: function (html) {
    // Title
    var titleMatch =
      /<h3[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(html);
    var title = titleMatch
      ? titleMatch[1].replace(/<[^>]*>/g, "").trim()
      : "";

    // Numeric novel ID for AJAX chapter fetch — store for getChaptersApiUrl
    var novelIdMatch =
      /id="rating"[^>]*data-novel-id="([^"]*)"/i.exec(html);
    novelId = novelIdMatch ? novelIdMatch[1] : null;

    // Author: <div><h3>Author:</h3><a href="...">Name</a>, <a ...>Name2</a></div>
    var author = null;
    var authorMatch = /Author:<\/h3>\s*([\s\S]*?)<\/div>/i.exec(html);
    if (authorMatch) {
      var authorNames = [];
      var nameRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
      var nameMatch;
      while ((nameMatch = nameRe.exec(authorMatch[1])) !== null) {
        var name = nameMatch[1].replace(/<[^>]*>/g, "").trim();
        if (name) authorNames.push(name);
      }
      if (authorNames.length > 0) author = authorNames.join(", ");
    }

    // Cover image
    var coverMatch =
      /<div[^>]*class="[^"]*book[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/i.exec(
        html
      );
    if (!coverMatch) {
      coverMatch =
        /<div[^>]*class="[^"]*book[^"]*"[^>]*>[\s\S]*?<img[^>]*data-src="([^"]*)"/i.exec(
          html
        );
    }
    var cover = coverMatch ? fixPosterUrl(coverMatch[1]) : null;

    // Synopsis
    var synopsisMatch =
      /<div[^>]*class="[^"]*desc-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
        html
      );
    var description = synopsisMatch
      ? synopsisMatch[1].replace(/<[^>]*>/g, "").trim()
      : "";

    // Genres / tags
    var genres = [];
    var genreMatch = /Genre:<\/h3>\s*([\s\S]*?)<\/div>/i.exec(html);
    if (genreMatch) {
      var tagRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
      var tagMatch;
      while ((tagMatch = tagRe.exec(genreMatch[1])) !== null) {
        var tag = tagMatch[1].replace(/<[^>]*>/g, "").trim();
        if (tag) genres.push(tag);
      }
    }

    // Status
    var statusMatch = /Status:<\/h3>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(html);
    var status = statusMatch
      ? statusMatch[1].replace(/<[^>]*>/g, "").trim()
      : null;

    // Rating (site shows 0-10 float → scale to 0-1000) and people voted
    // "Rating: <strong><span>8.6</span></strong>/10 from <strong><span>256</span> ratings</strong>"
    var ratingMatch =
      /<span>([\d.]+)<\/span><\/strong>\s*\/\s*<span[^>]*>10<\/span>[\s\S]*?<span>(\d+)<\/span>/i.exec(
        html
      );
    var rating = ratingMatch
      ? Math.round(parseFloat(ratingMatch[1]) * 100) || null
      : null;
    var peopleVoted = ratingMatch
      ? parseInt(ratingMatch[2], 10) || null
      : null;

    // Return empty chapters so the Dart side triggers the AJAX path
    // via getChaptersApiUrl / parseChapterList.
    return {
      title: title,
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: description,
      chapters: [],
      rating: rating,
      peopleVoted: peopleVoted,
    };
  },

  // --- AJAX Chapter Loading (Dart-side fallback) ---
  // Called by Dart when parseNovelInfo returns empty chapters.
  // bookId = slug from URL, page = pagination index (starts at 0).
  // The response contains the full chapter list (753+ entries) in one go,
  // so only page 0 is fetched.
  getChaptersApiUrl: function (bookId, page) {
    if (!novelId || page > 0) return null;
    return (
      novelfullBase + "/ajax-chapter-option?novelId=" + novelId
    );
  },

  // Parses the AJAX chapter list HTML response.
  // <select id="chapter-nav"><option value="/slug/chapter-N.html">Name</option></select>
  // Relative urls are resolved to absolute against the baseUrl.
  parseChapterList: function (html) {
    var chapters = [];

    var optionRe = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
    var match;
    while ((match = optionRe.exec(html)) !== null) {
      var url = match[1];
      var name = match[2].replace(/<[^>]*>/g, "").trim();
      if (url) {
        chapters.push({
          name: name || "Untitled",
          url: novelfullAbs(url)
        });
      }
    }

    return chapters;
  },

  // --- Chapter Content ---
  getChapterContentUrl: function (chapterUrl) {
    return novelfullAbs(chapterUrl);
  },

  parseChapterContent: function (html) {
    // Extract content from #chapter-content (or #chr-content). The content
    // block ends at <hr class="chapter-end">; a plain lazy </div> match
    // would stop at the first ad block inside the content.
    var contentMatch =
      /<div[^>]*id="chapter-content"[^>]*>([\s\S]*?)<hr class="chapter-end"/i.exec(
        html
      );
    if (!contentMatch) {
      contentMatch =
        /<div[^>]*id="chr-content"[^>]*>([\s\S]*?)<hr class="chapter-end"/i.exec(
          html
        );
    }

    var content = contentMatch ? contentMatch[1] : "";

    // Strip ads and error messages
    content = content
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
      .replace(/<a[^>]*id="dl-banner[^"]*"[\s\S]*?<\/a>/gi, " ")
      .replace(
        /If you find any errors.*?fix it as soon as possible\./gi,
        " "
      )
      .replace(
        /\[Updated from F r e e w e b n o v e l\. c o m\]/g,
        ""
      );

    // Extract images
    var images = [];
    var imgRe = /<img[^>]*src="([^"]*)"[^>]*>/gi;
    var imgMatch;
    while ((imgMatch = imgRe.exec(content)) !== null) {
      images.push({ url: imgMatch[1], alt: "" });
    }

    return { html: content, images: images };
  },

  // --- Helpers ---
  // Kept for backward compatibility; parseSearchResults/parseNovelInfo use
  // the module-level `fixPosterUrl` (functions are called with apply(null)).
  _fixPosterUrl: function (url) {
    if (!url) return url;
    // Prevent zoom on images (matching Kotlin fullPosterFix)
    return url
      .replace(
        "fc05345726d3e134d2f7187dc70f047b",
        "4d27e0af8cf6e971f7ee3c995fc55190"
      )
      .replace(
        "9798407846f8032e6a88fa71b2c62ce9",
        "9c3d392ccc7c95187a8c6e37c6bdac6f"
      );
  },
};