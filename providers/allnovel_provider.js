// AllNovel Provider — allnovel.org
// Parses AllNovel's HTML for novel search, info, and chapter content.

module.exports = {
  // --- Metadata ---
  id: "allnovel",
  name: "AllNovel",
  lang: "en",
  baseUrl: "https://allnovel.org",

  // Internal state: holds the numeric novel ID extracted from parseNovelInfo
  _novelId: null,

  // --- Main Page ---
  getMainPageUrl: function (page) {
    return "https://allnovel.org/hot-novel?page=" + (page || 1);
  },

  // --- Search ---
  search: function (query, page) {
    return {
      url:
        "https://allnovel.org/search?keyword=" +
        encodeURIComponent(query) +
        "&page=" +
        (page || 1),
    };
  },

  getSearchUrl: function (query, page) {
    return (
      "https://allnovel.org/search?keyword=" +
      encodeURIComponent(query) +
      "&page=" +
      (page || 1)
    );
  },

  parseSearchResults: function (html) {
    var results = [];

    // Each search result card is a .row div containing a title link and cover image.
    // We match blocks that contain a .truyen-title or .novel-title link.
    var cardRe =
      /<div[^>]*class="[^"]*row[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;
    var match;

    while ((match = cardRe.exec(html)) !== null) {
      var block = match[0];

      // Extract title from .truyen-title or .novel-title
      var titleMatch =
        /class="[^"]*(?:truyen-title|novel-title)[^"]*"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(
          block
        );
      if (!titleMatch) continue;

      var title = titleMatch[2].replace(/<[^>]*>/g, "").trim();
      var url = titleMatch[1];
      if (!title || !url) continue;

      // Extract cover image
      var coverMatch = /<img[^>]*src="([^"]*)"/i.exec(block);
      var cover = coverMatch ? this._fixPosterUrl(coverMatch[1]) : null;

      results.push({ title: title, url: url, cover: cover });
    }

    // Detect next page
    var hasNextPage =
      /class="[^"]*next[^"]*"[^>]*>[\s\S]*?<\/a>/i.test(html) ||
      /class="[^"]*page-item[^"]*next/i.test(html);

    return { results: results, hasNextPage: hasNextPage };
  },

  // --- Novel Info ---
  getNovelInfoUrl: function (novelUrl) {
    return novelUrl;
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
    this._novelId = novelIdMatch ? novelIdMatch[1] : null;

    // Author
    var authorMatch =
      /Author:\s*<\/[^>]+>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(html);
    if (!authorMatch) {
      authorMatch = /Author:([\s\S]*?)<\/div>/i.exec(html);
    }
    var author = authorMatch
      ? authorMatch[1].replace(/<[^>]*>/g, "").trim() || null
      : null;

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
    var cover = coverMatch ? this._fixPosterUrl(coverMatch[1]) : null;

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
    var genreSection = /(?:Genre|genre)([\s\S]*?)<\/div>/i.exec(html);
    if (genreSection) {
      var tagRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
      var tagMatch;
      while ((tagMatch = tagRe.exec(genreSection[1])) !== null) {
        var tag = tagMatch[1].replace(/<[^>]*>/g, "").trim();
        if (tag) genres.push(tag);
      }
    }

    // Rating (site shows 0-10 float → scale to 0-1000)
    var ratingMatch =
      /<div[^>]*class="[^"]*small[^"]*"[^>]*>[\s\S]*?<strong[^>]*>[\s\S]*?<span>([\s.0-9]*)<\/span>/i.exec(
        html
      );
    var rating = ratingMatch
      ? Math.round(parseFloat(ratingMatch[1]) * 100) || null
      : null;

    // People voted
    var votedMatch =
      /<strong[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/strong>[\s\S]*?<\/em>/i.exec(
        html
      );
    var peopleVoted = votedMatch
      ? parseInt(votedMatch[1].replace(/[^0-9]/g, ""), 10) || null
      : null;

    // Status
    var statusMatch =
      /Status:\s*<\/[^>]+>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(html);
    var status = statusMatch
      ? statusMatch[1].replace(/<[^>]*>/g, "").trim()
      : null;

    // Return empty chapters so the Dart side triggers the AJAX path
    // via getChaptersApiUrl / parseChapterList
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
  getChaptersApiUrl: function (bookId, page) {
    if (!this._novelId || page > 0) return null;
    return (
      "https://allnovel.org/ajax-chapter-option?novelId=" + this._novelId
    );
  },

  // Parses the AJAX chapter list HTML response.
  // Returns an array of { name, url } objects.
  parseChapterList: function (html) {
    var chapters = [];

    // Format 1: <select><option value="url">Chapter Name</option>...</select>
    var optionRe = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
    var match;
    while ((match = optionRe.exec(html)) !== null) {
      var url = match[1];
      var name = match[2].replace(/<[^>]*>/g, "").trim();
      if (url) {
        chapters.push({ name: name || "Untitled", url: url });
      }
    }

    // Format 2: <li data-chapter-item><a href="url">Chapter Name</a></li>
    if (chapters.length === 0) {
      var liRe =
        /<li[^>]*data-chapter-item[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = liRe.exec(html)) !== null) {
        var url2 = match[1];
        var name2 = match[2].replace(/<[^>]*>/g, "").trim();
        if (url2) {
          chapters.push({ name: name2 || "Untitled", url: url2 });
        }
      }
    }

    return chapters;
  },

  // --- Chapter Content ---
  getChapterContentUrl: function (chapterUrl) {
    return chapterUrl;
  },

  parseChapterContent: function (html) {
    // Extract content from #chapter-content or #chr-content
    var contentMatch =
      /<div[^>]*id="chapter-content"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (!contentMatch) {
      contentMatch =
        /<div[^>]*id="chr-content"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    }

    var content = contentMatch ? contentMatch[1] : "";

    // Strip ads and error messages
    content = content
      .replace(
        /<iframe[^>]*src="\/\/ad.{0,2}-ads\.com\/[^"]*"[^>]*><\/iframe>/gi,
        " "
      )
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
