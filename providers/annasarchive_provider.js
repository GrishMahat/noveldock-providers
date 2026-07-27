// Anna's Archive Provider — annas-archive.gl
// Parses Anna's Archive HTML for book search and info (epub download provider).

module.exports = {
  // --- Metadata ---
  id: "annasarchive",
  name: "Annas Archive",
  lang: "en",
  baseUrl: "https://annas-archive.gl",

  // --- Main Page ---
  getMainPageUrl: function (page) {
    return (
      "https://annas-archive.gl/search?index=&page=" +
      (page || 1) +
      "&sort=&ext=epub"
    );
  },

  // --- Search ---
  search: function (query, page) {
    return {
      url:
        "https://annas-archive.gl/search?index=&page=" +
        (page || 1) +
        "&sort=&ext=epub&q=" +
        encodeURIComponent(query),
    };
  },

  getSearchUrl: function (query, page) {
    return (
      "https://annas-archive.gl/search?index=&page=" +
      (page || 1) +
      "&sort=&ext=epub&q=" +
      encodeURIComponent(query)
    );
  },

  parseSearchResults: function (html) {
    var results = [];
    var seen = {};

    // Use indexOf-based parsing to avoid regex issues on large HTML
    var searchStr = "js-vim-focus";
    var pos = 0;

    while (true) {
      var vimIdx = html.indexOf(searchStr, pos);
      if (vimIdx === -1) break;

      // Walk back to find the href="/md5/..." before this element
      var chunk = html.substring(Math.max(0, vimIdx - 300), vimIdx);
      var md5HrefIdx = chunk.lastIndexOf('href="/md5/');
      if (md5HrefIdx === -1) { pos = vimIdx + searchStr.length; continue; }

      var hrefStart = md5HrefIdx + 6; // skip 'href="'
      var hrefEnd = html.indexOf('"', hrefStart + 5);
      if (hrefEnd === -1) { pos = vimIdx + searchStr.length; continue; }

      var href = html.substring(hrefStart, hrefEnd);

      // Find > after js-vim-focus, then text until </a>
      var gtIdx = html.indexOf(">", vimIdx);
      if (gtIdx === -1) { pos = vimIdx + searchStr.length; continue; }

      var closeIdx = html.indexOf("</a>", gtIdx);
      if (closeIdx === -1) { pos = vimIdx + searchStr.length; continue; }

      var title = html.substring(gtIdx + 1, closeIdx);
      // Strip any inner HTML tags
      title = title.replace(/<[^>]*>/g, "").trim();
      if (!title) { pos = closeIdx + 4; continue; }

      var url = "https://annas-archive.gl" + href;
      if (!seen[url]) {
        seen[url] = true;
        results.push({ title: title, url: url });
      }
      pos = closeIdx + 4;
    }

    var hasNextPage = html.indexOf("js-pagination-next-page") !== -1;

    return { results: results, hasNextPage: hasNextPage };
  },

  // --- Novel Info ---
  getNovelInfoUrl: function (novelUrl) {
    return novelUrl;
  },

  parseNovelInfo: function (html) {
    // Title: <div class="font-semibold text-2xl ...">TITLE</div>
    var title = "";
    var t2idx = html.indexOf('text-2xl');
    if (t2idx !== -1) {
      var gt = html.indexOf(">", t2idx);
      var close = html.indexOf("</div>", gt);
      if (gt !== -1 && close !== -1) {
        title = html.substring(gt + 1, close).replace(/<[^>]*>/g, "").trim();
      }
    }

    // Cover: first <img> inside list_cover div
    var cover = null;
    var coverIdx = html.indexOf("list_cover_aarecord_id");
    if (coverIdx !== -1) {
      var imgIdx = html.indexOf("<img", coverIdx);
      if (imgIdx !== -1 && imgIdx < coverIdx + 1000) {
        var srcIdx = html.indexOf('src="', imgIdx);
        if (srcIdx !== -1) {
          var srcEnd = html.indexOf('"', srcIdx + 5);
          if (srcEnd !== -1) cover = html.substring(srcIdx + 5, srcEnd);
        }
      }
    }

    // Download links: <a href="/slow_download/..." class="js-download-link">
    var chapters = [];
    var dlPos = 0;
    while (true) {
      var dlIdx = html.indexOf("js-download-link", dlPos);
      if (dlIdx === -1) break;

      // Find href before this element
      var before = html.substring(Math.max(0, dlIdx - 200), dlIdx);
      var hrefIdx = before.lastIndexOf('href="');
      if (hrefIdx === -1) { dlPos = dlIdx + 16; continue; }

      var hrefStart = hrefIdx + 6;
      var hrefEnd = html.indexOf('"', hrefStart);
      if (hrefEnd === -1) { dlPos = dlIdx + 16; continue; }

      var dlUrl = html.substring(hrefStart, hrefEnd);

      // Skip fast_download and dataset links
      if (dlUrl.indexOf("fast_download") !== -1 || dlUrl.indexOf("/datasets") !== -1) {
        dlPos = dlIdx + 16;
        continue;
      }

      // Extract link text
      var gt2 = html.indexOf(">", dlIdx);
      var close2 = html.indexOf("</a>", gt2);
      var dlName = "";
      if (gt2 !== -1 && close2 !== -1) {
        dlName = html.substring(gt2 + 1, close2).replace(/<[^>]*>/g, "").trim();
      }

      if (dlUrl.indexOf("http") !== 0) {
        dlUrl = "https://annas-archive.gl" + dlUrl;
      }

      chapters.push({ name: dlName || "Download", url: dlUrl });
      dlPos = dlIdx + 16;
    }

    return {
      title: title,
      author: null,
      cover: cover,
      status: null,
      genres: [],
      description: "",
      chapters: chapters,
    };
  },

  // --- Chapter Content ---
  getChapterContentUrl: function (chapterUrl) {
    return chapterUrl;
  },

  parseChapterContent: function (html) {
    // Anna's Archive provides epub downloads, not HTML chapters.
    return { html: html, images: [] };
  },
};
