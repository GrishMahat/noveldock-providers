// NovelFull.NET provider for novelfull.net
// NOTE: despite the name this is NOT the novelfull.com engine — pages carry
// fwn (freewebnovel-derived) theme markers, novels live at /slug.html and
// chapters at /slug/chapter-N-....html with the list inline on the novel
// page (ul.ul-list5, newest first).

var nfnBaseUrl = "https://novelfull.net";

// data-novel-id + data-total-page captured in novelInfo; the chapter list
// is paged (40/page, 1-based) via /ajax-chapter-list.
var nfnNovelId = null;
var nfnTotalPages = 0;

var nfnLists = [
  { name: "Hot Novel", value: "hot-novel" },
  { name: "Latest Release", value: "latest-release-novel" },
  { name: "Completed Novel", value: "completed-novel" },
  { name: "Most Popular", value: "most-popular" }
];

/// Inner HTML of every <div class="li-row"> block, balancing nested divs.
function nfnRows(html) {
  var out = [];
  var openRe = /<div[^>]*class="li-row"[^>]*>/gi;
  var m;
  while ((m = openRe.exec(html)) !== null) {
    var pos = m.index + m[0].length;
    var depth = 1;
    var tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = pos;
    var t;
    var end = -1;
    while ((t = tag.exec(html)) !== null) {
      if (t[0].charAt(1) === "/") {
        depth--;
        if (depth === 0) { end = t.index; break; }
      } else if (t[0].charAt(t[0].length - 2) !== "/") {
        depth++;
      }
    }
    if (end === -1) break;
    out.push(html.substring(pos, end));
    openRe.lastIndex = tag.lastIndex;
  }
  return out;
}

/// Inner HTML of the first <div ... class~="chapter-content" ...>.
function nfnContentDiv(html) {
  var open = /<div[^>]*chapter-content[^>]*>/i.exec(html);
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

function nfnParseRows(html) {
  var results = [];
  var rows = nfnRows(html);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var link = first(row, /<a[^>]*href="(\/[^"]+\.html)"[^>]*title="([^"]+)"[^>]*>/i);
    if (!link) continue;
    var href = link;
    var titleTag = first(
      row,
      /<h3[^>]*class="[^"]*tit[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
    ) || "";
    var title = textOf(titleTag);
    if (!title) {
      var alt = first(row, /<a[^>]*href="\/[^"]+\.html"[^>]*title="([^"]+)"[^>]*>/i);
      title = alt ? textOf(alt) : "";
    }
    if (!title) continue;
    var img = first(row, /(<img[^>]*>)/);
    var cover = img ? attr(img, "src") : null;
    var rating = null;
    var ratingText = first(row, /title="Rating ([\d.]+)\/5"/i) ||
      first(row, /<div[^>]*class="[^"]*core[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\d.]+)<\/span>/i);
    if (ratingText) {
      var stars = parseFloat(ratingText.trim());
      if (!isNaN(stars)) rating = Math.round(stars * 200);
    }
    var latestChapter = first(row, /title="(\d+\s*Chapters?)"/i);
    results.push({
      title: title,
      url: absUrl(nfnBaseUrl, href),
      cover: cover ? absUrl(nfnBaseUrl, cover) : null,
      author: null,
      summary: null,
      rating: rating,
      latestChapter: latestChapter ? textOf(latestChapter) : null
    });
  }
  var hasNextPage = /<li[^>]*class="[^"]*next[^"]*"[^>]*>\s*<a/i.test(html);
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "novelfullnet",
  name: "NovelFull.NET",
  baseUrl: nfnBaseUrl,
  lang: "en",
  nsfw: true,
  version: "1.0.0",

  filters: [
    {
      type: "select",
      id: "list",
      name: "List",
      options: nfnLists.map(function(o) { return o.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var idx = typeof f.list === "number" &&
      f.list >= 0 && f.list < nfnLists.length ? f.list : 0;
    return nfnBaseUrl + "/" + nfnLists[idx].value + "?page=" + (page || 1);
  },

  // --- Latest ---
  latestUrl: function(page) {
    return nfnBaseUrl + "/latest-release-novel?page=" + (page || 1);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return nfnBaseUrl + "/search?keyword=" +
      encodeURIComponent((query || "").trim()) + "&page=" + (page || 1);
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return nfnParseRows(html);
  },

  // --- Novel Info (chapter list inline, newest first) ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(nfnBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!title || !textOf(title)) return empty;

    var author = null;
    var authorLink = first(
      html,
      /<a[^>]*href="\/author\/[^"]+"[^>]*>([^<]+)<\/a>/i
    );
    if (authorLink) author = textOf(authorLink) || null;

    var cover = null;
    var coverImg = first(html, /(<img[^>]*uploads\/thumbs[^>]*>)/i);
    if (coverImg) cover = attr(coverImg, "src");

    var description = "";
    var summary = first(
      html,
      /<div[^>]*id="novel-summary-inner"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
    ) || first(
      html,
      /<div[^>]*id="novel-summary-inner"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (summary) description = textOf(summary);

    var genres = [];
    var genreLinks = matchAll(
      html,
      /<a[^>]*href="\/genre\/[^"]+"[^>]*class="[^"]*a1[^"]*"[^>]*>([^<]+)<\/a>/gi
    );
    for (var i = 0; i < genreLinks.length; i++) {
      var g = textOf(genreLinks[i][1]);
      if (g) genres.push(g);
    }

    // No status marker on novel pages; the Completed list implies it.
    var status = null;

    var rating = null;
    var ratingText = first(html, /Rating ([\d.]+)/i);
    if (ratingText) {
      var stars = parseFloat(ratingText.trim());
      if (!isNaN(stars)) rating = Math.round(stars * 200);
    }

    var chapters = [];
    // Inline lists are partial (latest-6 + first page); the full list
    // comes from the paged AJAX endpoint below. Capture its parameters.
    var listDiv = first(
      html,
      /(<div[^>]*id="list-chapter"[^>]*>)/i
    );
    if (listDiv) {
      nfnNovelId = attr(listDiv, "data-novel-id") || null;
      var total = parseInt(attr(listDiv, "data-total-page") || "0", 10);
      nfnTotalPages = isNaN(total) ? 0 : total;
    } else {
      nfnNovelId = null;
      nfnTotalPages = 0;
    }

    return {
      title: textOf(title),
      author: author,
      cover: cover ? absUrl(nfnBaseUrl, cover) : null,
      status: status,
      genres: genres,
      description: description,
      chapters: chapters,
      rating: rating
    };
  },

  // --- Chapters (paged AJAX: 40/page, 1-based, oldest first) ---
  chaptersApiUrl: function(bookId, page) {
    var p = (page || 0) + 1;
    if (!nfnNovelId || p > nfnTotalPages) return null;
    return nfnBaseUrl + "/ajax-chapter-list?novelId=" +
      encodeURIComponent(nfnNovelId) + "&page=" + p;
  },

  chapterList: function(data) {
    var text = typeof data === "string" ? data.trim() : "";
    if (!text) return [];
    var html = text;
    if (text.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(text);
        html = parsed.html || "";
      } catch (e) {
        return [];
      }
    }
    var chapters = [];
    var items = matchAll(
      html,
      /<a[^>]*href="(\/[^"]+\.html)"[^>]*class="[^"]*con[^"]*"[^>]*title="([^"]*)"[^>]*>/gi
    );
    if (!items.length) {
      items = matchAll(
        html,
        /<a[^>]*class="[^"]*con[^"]*"[^>]*href="(\/[^"]+\.html)"[^>]*title="([^"]*)"[^>]*>/gi
      );
    }
    for (var i = 0; i < items.length; i++) {
      var name = textOf(items[i][2]);
      if (!name) continue;
      chapters.push({
        name: name,
        url: absUrl(nfnBaseUrl, items[i][1])
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
    var content = nfnContentDiv(html);
    if (!content) return out;
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
    content = content.replace(/<div[^>]*data-ad-slot[^>]*>[\s\S]*?<\/div>/gi, "");
    var images = [];
    var imgs = matchAll(content, /<img[^>]*src="([^"]*)"[^>]*>/gi);
    for (var i = 0; i < imgs.length; i++) {
      images.push({ url: absUrl(nfnBaseUrl, imgs[i][1]), alt: null });
    }
    out.html = content;
    out.images = images;
    return out;
  }
});
