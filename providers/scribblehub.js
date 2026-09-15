// ScribbleHub provider for scribblehub.com
// Port of the original Kotlin ScribblehubProvider (QuickNovel).
// Browse/search/novel pages are plain HTML. The full chapter list comes
// from the site's admin-ajax endpoint (wi_getreleases_pagination); the
// toc_show/toc_sorder cookies are what switch it from "latest 15,
// descending" to the full ascending list.
//
// STATUS: (as of 2026-09-15) NOT registered in registry.json.
// The chapter-read page (/read/<id>) is behind Cloudflare from datacenter
// IPs: the audit saw a 403 on the /read page and a transient CF challenge on
// the novel page earlier. Other issues:
//   - chapter list requires a POST with `toc_show=10000; toc_sorder=asc`
//     cookies to return the full ascending list (the app's normal flow does
//     this, but it's a fragility point if network conditions change).
//   - the `chaptersApiConfig` body is hardcoded; any change to the site's
//     admin-ajax action names would break the chapter list.
//   - the /read/<id> URL may be internally redirected by the site, which can
//     affect readers that rely on the original URL.
// We will revisit Cloudflare bypass / residential-IP testing later; right now
// ScribbleHub is unregistered until we can get a reliable read path.

var shBaseUrl = "https://www.scribblehub.com";

// Numeric series id + canonical novel URL captured in novelInfo. The
// chapters POST needs the numeric id (the runtime only passes the URL
// slug as bookId), so it is captured here and consumed by
// chaptersApiConfig (same flow as the app: info first, chapters second).
var shPostId = null;
var shNovelUrl = null;

/// Inner HTML of every top-level <div> whose class list contains [marker],
/// balancing nested divs (lazy `</div></div>` matching truncates cards).
function shBlocks(html, marker) {
  var out = [];
  var openRe = new RegExp(
    '<div[^>]*class="[^"]*' + marker + '[^"]*"[^>]*>', 'gi'
  );
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

/// Inner HTML of the first <tag ...> matched by [startRe], balancing
/// nested tags of the same kind. Returns null when not found.
function shInner(html, tag, startRe) {
  var m = startRe.exec(html);
  if (!m) return null;
  var pos = m.index + m[0].length;
  var depth = 1;
  var tagRe = new RegExp("<\\/?" + tag + "\\b[^>]*>", "gi");
  tagRe.lastIndex = pos;
  var t;
  while ((t = tagRe.exec(html)) !== null) {
    if (t[0].charAt(1) === "/") {
      depth--;
      if (depth === 0) return html.substring(pos, t.index);
    } else if (t[0].charAt(t[0].length - 2) !== "/") {
      depth++;
    }
  }
  return null;
}

/// hasNextPage from the site's simplePagination snippet:
/// `items: <total>, itemsOnPage: 1, ... currentPage: '<cur>'`.
function shHasNext(html, count) {
  var total = first(html, /items:\s*(\d+),\s*itemsOnPage:\s*1/);
  var cur = first(html, /currentPage:\s*'(\d+)'/);
  if (total && cur) return parseInt(cur, 10) < parseInt(total, 10);
  return count >= 15;
}

function shRatingOf(text) {
  var v = parseFloat(text);
  if (isNaN(v)) return null;
  return Math.round(v * 200);
}

function shParseSearchBox(box) {
  var link = /<div[^>]*class="[^"]*search_title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(box);
  if (!link) return null;
  var title = textOf(link[2]);
  if (!title || !link[1]) return null;

  var cover = null;
  var img = /<div[^>]*class="[^"]*search_img[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/.exec(box);
  if (img) cover = absUrl(shBaseUrl, img[1]);

  var rating = null;
  var score = first(box, /search_ratings"[^>]*>\s*\(([\d.]+)\)/);
  if (score) rating = shRatingOf(score);

  var author = null;
  var authorMatch = /title="Author"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/.exec(box);
  if (authorMatch) author = textOf(authorMatch[1]) || null;

  var latestChapter = null;
  var chMatch = /(\d[\d,]*)\s*Chapters</.exec(box);
  if (chMatch) latestChapter = chMatch[1] + " Chapters";

  var url = absUrl(shBaseUrl, link[1]);
  if (url) url = url.replace(/\/$/, "");
  return {
    title: title,
    url: url,
    cover: cover,
    author: author,
    summary: null,
    rating: rating,
    latestChapter: latestChapter
  };
}

function shStatusOf(html) {
  var s = first(html, /(Ongoing|Completed|Complete|Hiatus|Dropped|Stubbed|Stub)\s*-\s*Updated/i);
  if (!s) return null;
  s = s.toLowerCase();
  if (s.indexOf("ongoing") !== -1) return "ongoing";
  if (s.indexOf("complet") !== -1) return "completed";
  if (s.indexOf("hiatus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1) return "dropped";
  return "stubbed";
}

register({
  id: "scribblehub",
  name: "ScribbleHub",
  baseUrl: shBaseUrl,
  lang: "en",
  version: "1.0.0",

  // --- Browse (homepage "latest releases" feed) ---
  mainPageUrl: function(page, filters) {
    return shBaseUrl + "/?pg=" + (page || 1);
  },

  // --- Latest (same feed: the homepage lists the newest chapter updates) ---
  latestUrl: function(page) {
    return shBaseUrl + "/?pg=" + (page || 1);
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    return shBaseUrl + "/series-finder/?sf=1&sh=" +
      encodeURIComponent((query || "").trim()) +
      (page > 1 ? "&pg=" + page : "");
  },

  searchResults: function(html) {
    var out = { results: [], hasNextPage: false };
    if (!html || typeof html !== "string") return out;

    // Series-finder cards.
    var boxes = shBlocks(html, "search_main_box");
    if (boxes.length) {
      for (var i = 0; i < boxes.length; i++) {
        var item = shParseSearchBox(boxes[i]);
        if (item) out.results.push(item);
      }
      out.hasNextPage = shHasNext(html, out.results.length);
      return out;
    }

    // Homepage feed rows: <tr class="toc_w ..."> (no nested <tr> inside).
    var rows = matchAll(html, /<tr[^>]*class="[^"]*toc_w[^"]*"[^>]*>([\s\S]*?)<\/tr>/g);
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r][1];
      var a = /<a[^>]*class="[^"]*fp_title[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
      if (!a) continue;
      var title = textOf(a[2]);
      if (!title || !a[1]) continue;
      var imgTag = first(row, /(<img[^>]*>)/);
      var cover = null;
      if (imgTag) {
        var src = attr(imgTag, "data-src") || attr(imgTag, "src");
        if (src) cover = absUrl(shBaseUrl, src);
      }
      var rowAuthor = first(row, /<span[^>]*class="[^"]*fp_authorname[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      var url = absUrl(shBaseUrl, a[1]);
      if (url) url = url.replace(/\/$/, "");
      out.results.push({
        title: title,
        url: url,
        cover: cover,
        author: rowAuthor ? textOf(rowAuthor) : null,
        summary: null,
        rating: null,
        latestChapter: null
      });
    }
    out.hasNextPage = shHasNext(html, out.results.length);
    return out;
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    var url = absUrl(shBaseUrl, novelUrl) || novelUrl;
    return url ? url.replace(/\/$/, "") : url;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(html, /<div[^>]*class="[^"]*fic_title[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    title = title ? textOf(title) : "";
    if (!title) return empty;

    // Numeric series id + canonical URL for the chapters POST.
    shPostId = null;
    shNovelUrl = null;
    var canon = first(html, /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/) ||
      first(html, /<link[^>]*href="([^"]*)"[^>]*rel="canonical"/) ||
      first(html, /property="og:url"[^>]*content="([^"]*)"/) ||
      first(html, /content="([^"]*)"[^>]*property="og:url"/);
    if (canon) {
      shNovelUrl = canon;
      var idMatch = /\/series\/(\d+)\//.exec(canon);
      if (idMatch) shPostId = idMatch[1];
    }
    if (!shPostId) {
      var anySeries = /\/series\/(\d+)\//.exec(html);
      if (anySeries) shPostId = anySeries[1];
    }

    var author = first(html, /<span[^>]*class="[^"]*auth_name_fic[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    author = author ? textOf(author) : null;

    var cover = first(html, /<div[^>]*class="[^"]*fic_image[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/);
    if (cover) cover = absUrl(shBaseUrl, cover);

    var descHtml = shInner(html, "div", /<div[^>]*class="[^"]*wi_fic_desc[^"]*"[^>]*>/i);
    var description = descHtml ? textOf(descHtml) : "";

    var genres = [];
    var genreBlock = shInner(html, "span", /<span[^>]*class="[^"]*wi_fic_genre[^"]*"[^>]*>/i);
    if (genreBlock) {
      var links = matchAll(genreBlock, /<a[^>]*>([\s\S]*?)<\/a>/g);
      for (var i = 0; i < links.length; i++) {
        var g = textOf(links[i][1]);
        if (g) genres.push(g);
      }
    }

    var rating = null;
    var score = first(html, /<span[^>]*id="ratefic_user"[^>]*>[\s\S]*?<span>([\d.]+)<\/span>/);
    if (score) rating = shRatingOf(score);

    return {
      title: title,
      author: author || null,
      cover: cover || null,
      status: shStatusOf(html),
      genres: genres,
      description: description,
      chapters: [],
      rating: rating
    };
  },

  // --- Chapters (admin-ajax POST; the toc cookies select the full list) ---
  chaptersApiConfig: function(bookId, page) {
    if ((page || 0) > 0) return null;
    if (!shPostId) return null;
    var body = "action=wi_getreleases_pagination&pagenum=1&mypostid=" +
      encodeURIComponent(shPostId);
    return {
      url: shBaseUrl + "/wp-admin/admin-ajax.php",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "origin": shBaseUrl,
        "referer": shNovelUrl || (shBaseUrl + "/series/" + shPostId + "/"),
        "Cookie": "toc_show=10000; toc_sorder=asc"
      },
      body: _utf8Bytes(body)
    };
  },

  chapterList: function(data) {
    // The app hands the POST response over as raw bytes (Array of ints).
    var text;
    if (typeof data === "string") {
      text = data;
    } else if (data instanceof Array) {
      text = _utf8Decode(data, 0, data.length);
    } else {
      return [];
    }
    if (!text) return [];
    // <li> items hold no nested <li>, so a flat match is safe here.
    var items = matchAll(text, /<li[^>]*>([\s\S]*?)<\/li>/g);
    var chapters = [];
    for (var i = 0; i < items.length; i++) {
      var li = items[i][1];
      var a = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(li);
      if (!a || !a[1]) continue;
      var name = textOf(a[2]);
      if (!name) name = "Chapter " + chapters.length;
      var date = null;
      var dateMatch = /<span[^>]*>([\s\S]*?)<\/span>/.exec(li);
      if (dateMatch) date = textOf(dateMatch[1]) || null;
      chapters.push({
        name: name,
        url: absUrl(shBaseUrl, a[1]),
        date: date
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
    var content = shInner(html, "div", /<div[^>]*id="chp_raw"[^>]*>/i);
    if (!content) return out;
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    var imgs = matchAll(content, /<img[^>]*src="([^"]*)"/g);
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i][1]) out.images.push({ url: absUrl(shBaseUrl, imgs[i][1]) || imgs[i][1], alt: null });
    }
    out.html = content;
    return out;
  }
});
