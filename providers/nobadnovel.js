// NoBadNovel provider for nobadnovel.com
// The series listing, keyword search, series and chapter pages are plain
// HTML served as GET; chapters are listed inline on the series page.

var nbnBaseUrl = "https://www.nobadnovel.com";

// Page requested by the last mainPageUrl/searchUrl call, used to detect
// the next page in searchResults (which only receives html).
var nbnPage = 1;

function nbnStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("on-going") !== -1) {
    return "ongoing";
  }
  if (s.indexOf("completed") !== -1 || s.indexOf("complete") !== -1) {
    return "completed";
  }
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1) return "dropped";
  return null;
}

function nbnParseCards(html) {
  var results = [];
  // Cards share no single wrapper class (Astro-scoped), so collect the
  // repeated fields in document order and zip them: one cover, one
  // status badge and one h4 title link per card.
  var covers = matchAll(
    html,
    /<img[^>]*src="([^"]*cdn\.nobadnovel[^"]*)"/g
  );
  var badges = matchAll(
    html,
    /<span[^>]*rounded-bl[^>]*>([^<]*)<\/span>/g
  );
  var titles = matchAll(
    html,
    /<h4[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g
  );
  var n = Math.min(covers.length, titles.length);
  for (var i = 0; i < n; i++) {
    var title = textOf(titles[i][2]);
    if (!title) continue;
    var status = i < badges.length ? nbnStatusOf(badges[i][1]) : null;
    results.push({
      title: title,
      url: absUrl(nbnBaseUrl, titles[i][1]),
      cover: absUrl(nbnBaseUrl, unescapeHtml(covers[i][1])),
      author: null,
      summary: null,
      rating: null,
      latestChapter: status
    });
  }
  var hasNextPage = html.indexOf("/page/" + (nbnPage + 1)) !== -1;
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "nobadnovel",
  name: "NoBadNovel",
  baseUrl: nbnBaseUrl,
  lang: "en",
  version: "1.0.0",
  author: "noveldock",

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    nbnPage = page || 1;
    return nbnBaseUrl + "/series/page/" + nbnPage;
  },

  // --- Latest (series sorted by update time, newest first) ---
  latestUrl: function(page) {
    nbnPage = page || 1;
    return (
      nbnBaseUrl + "/series?sort=updatedAt&order=desc&page=" + nbnPage
    );
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    nbnPage = page || 1;
    return (
      nbnBaseUrl + "/series?keyword=" +
      encodeURIComponent((query || "").trim()) +
      (nbnPage > 1 ? "&page=" + nbnPage : "")
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return nbnParseCards(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(nbnBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!title || !textOf(title)) return empty;

    var status = nbnStatusOf(
      first(html, /<div[^>]*class="[^"]*\bbadge\b[^"]*"[^>]*>([\s\S]*?)<\/div>/) || ""
    );

    // The site misspells the author element as <spna>.
    var author = first(html, /<spna[^>]*>([\s\S]*?)<\/spna>/);
    if (!author) {
      author = first(html, /<span[^>]*>\s*Author:\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    }

    var cover = first(
      html,
      /<a[^>]*class="[^"]*overflow-hidden[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/
    );
    if (!cover) {
      cover = first(html, /<img[^>]*src="([^"]*cdn\.nobadnovel[^"]*)"/);
    }

    // #intro .content holds <br>-separated prose (no nested divs).
    var description = first(
      html,
      /<div[^>]*id="intro"[^>]*>\s*<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );

    var chapters = [];
    var listPos = html.indexOf("chapter-list");
    if (listPos !== -1) {
      var links = matchAll(
        html.substring(listPos),
        /<a[^>]*href="([^"]*\/chapter-[^"]*)"[^>]*>([^<]*)<\/a>/g
      );
      for (var i = 0; i < links.length; i++) {
        var name = textOf(links[i][2]);
        if (!name) continue;
        chapters.push({
          name: name,
          url: absUrl(nbnBaseUrl, links[i][1])
        });
      }
    }

    return {
      title: textOf(title),
      author: author ? textOf(author) : null,
      cover: cover ? absUrl(nbnBaseUrl, unescapeHtml(cover)) : null,
      status: status,
      genres: [],
      description: description ? textOf(description) : "",
      chapters: chapters,
      rating: null
    };
  },

  // --- Chapter Content (p.para paragraphs) ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var paras = matchAll(
      html,
      /<p[^>]*class="[^"]*\bpara\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g
    );
    var body = "";
    for (var i = 0; i < paras.length; i++) {
      var text = textOf(paras[i][1]);
      if (!text) continue;
      body += "<p>" + paras[i][1] + "</p>";
    }
    if (!body) return out;
    out.html = body;
    return out;
  }
});
