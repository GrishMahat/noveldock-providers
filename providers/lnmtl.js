// LnMTL provider for lnmtl.com
//
// The novel catalog is a static JSON file prefetched from the homepage
// (same source the Kotlin provider uses); browse and search both read it.
// Chapters are synthesized per volume exactly like the Kotlin provider:
// the novel page embeds lnmtl.volumes plus the first volume's chapter
// response, and every volume (including the first) is fetched through the
// paged chapters API (/chapter?page=1&volumeId=<id>). Chapter text is the
// site's machine-translated sentences (sentence.translated).

var lmBaseUrl = "https://lnmtl.com";

// Prefetch URL for the full novel catalog, extracted from the homepage
// (`prefetch: '/build/storage/novels-<hash>.json'`). The hash rotates when
// the site rebuilds its catalog, so this URL may need refreshing.
var lmCatalogUrl = "https://lnmtl.com/build/storage/novels-942e52eede.json";

// Volumes of the novel parsed most recently (sorted by volume number),
// captured during novelInfo; consumed by the chapters paging loop.
var lmVolumes = [];

// Lowercase search terms from the last searchUrl call; applied in
// searchResults (the catalog JSON is fetched fresh for every request, but
// module state carries the query between the two calls, like lnori).
var lmQuery = "";

function lmCover(url) {
  if (!url) return null;
  url = unescapeHtml(url);
  // Listing art is 40px thumbs; novel pages use the 200px variant.
  url = url.replace("40.", "200.");
  return absUrl(lmBaseUrl, url);
}

function lmParseCatalog(text) {
  var out = { results: [], hasNextPage: false };
  var data;
  try {
    data = JSON.parse(typeof text === "string" ? text.trim() : "");
  } catch (e) {
    return out;
  }
  if (!data || !(data instanceof Array)) return out;
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (!item.name || !item.url) continue;
    out.results.push({
      title: item.name,
      url: item.url,
      cover: lmCover(item.image),
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  return out;
}

function lmVolumeNumber(volumeId) {
  for (var i = 0; i < lmVolumes.length; i++) {
    if (String(lmVolumes[i].id) === String(volumeId)) return lmVolumes[i].number;
  }
  return null;
}

register({
  id: "lnmtl",
  name: "LnMTL",
  baseUrl: lmBaseUrl,
  lang: "en",
  version: "1.0.0",

  // The site has no server-side search or listing filters; the catalog is
  // a single static file.
  flags: { searchFilters: false },

  // --- Browse (full catalog, like the Kotlin provider) ---
  mainPageUrl: function(page, filters) {
    lmQuery = ""; // a stale search filter must not apply to browse results
    return lmCatalogUrl;
  },

  // --- Latest ---
  latestUrl: function(page) {
    lmQuery = "";
    return lmCatalogUrl;
  },

  // --- Search (no server endpoint exists; the site filters the same
  // catalog file client-side. The query is captured here and applied in
  // searchResults below, so a search only returns matching titles instead
  // of dumping all 891 catalog entries into the results list) ---
  searchUrl: function(query, page, filters) {
    lmQuery = String(query || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return lmCatalogUrl;
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    var parsed = lmParseCatalog(html.trim());
    if (!lmQuery) return parsed;
    var terms = lmQuery.split(" ");
    parsed.results = parsed.results.filter(function(r) {
      var hay = String(r.title || "").toLowerCase();
      for (var i = 0; i < terms.length; i++) {
        if (terms[i] && hay.indexOf(terms[i]) === -1) return false;
      }
      return true;
    });
    return parsed;
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(lmBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;
    lmVolumes = [];

    var nameBlock = first(html, /<span class="novel-name"[^>]*>([\s\S]*?)<\/span>/);
    if (!nameBlock) {
      nameBlock = first(html, /<[^>]*class="novel-name"[^>]*>([\s\S]*?)<\/[a-z]+>/);
    }
    if (!nameBlock) return empty;
    var title = textOf(nameBlock.replace(/<small[\s\S]*?<\/small>/gi, ""));
    if (!title) return empty;

    var cover = null;
    var mediaBlock = first(html, /<div class="media-left[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (mediaBlock) cover = lmCover(first(mediaBlock, /<img[^>]*src="([^"]+)"/));
    if (!cover) {
      cover = lmCover(first(html, /<img[^>]*class="[^"]*img-rounded[^"]*"[^>]*src="([^"]+)"/));
    }
    if (!cover) {
      cover = lmCover(first(html, /<img class="media-object img-rounded"[^>]*src="([^"]+)"/));
    }

    var descParts = matchAll(html, /<div class="description"[^>]*>([\s\S]*?)<\/div>/g);
    var descParas = [];
    for (var d = 0; d < descParts.length; d++) {
      var paras = matchAll(descParts[d][1], /<p[^>]*>([\s\S]*?)<\/p>/g);
      for (var q = 0; q < paras.length; q++) {
        var t = textOf(paras[q][1]);
        if (t) descParas.push(t);
      }
    }
    var description = descParas.join("\n\n");

    // Volumes for the chapters paging loop (mirrors the Kotlin provider:
    // sorted by volume number).
    var volsRaw = first(html, /lnmtl\.volumes = ([\s\S]*?);lnmtl\.route/);
    if (volsRaw) {
      try {
        var vols = JSON.parse(volsRaw);
        if (vols instanceof Array) {
          vols.sort(function(a, b) { return (a.number || 0) - (b.number || 0); });
          lmVolumes = vols;
        }
      } catch (e) {
        lmVolumes = [];
      }
    }

    return {
      title: title,
      author: null,
      cover: cover,
      status: null,
      genres: [],
      description: description,
      chapters: [],
      rating: null
    };
  },

  // --- Chapters (one API page per volume; page N fetches volumes[N]) ---
  chaptersApiUrl: function(bookId, page) {
    var p = page || 0;
    if (p < 0 || p >= lmVolumes.length) return null;
    return lmBaseUrl + "/chapter?page=1&volumeId=" +
      encodeURIComponent(lmVolumes[p].id);
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
    var items = (parsed && parsed.data) || [];
    var total = (parsed && parsed.total) || 0;
    if (!items.length || !total) return [];

    var volNumber = lmVolumeNumber(items[0].volume_id);
    if (volNumber === null || volNumber === undefined) volNumber = 0;

    // Mirrors the Kotlin provider: chapter URLs are synthesized from the
    // first chapter's slug stem plus a running number over the volume's
    // total, falling back to generated titles past the fetched window.
    var firstSlug = String(items[0].slug || "");
    var dash = firstSlug.lastIndexOf("-");
    if (dash < 0) return [];
    var slugBase = firstSlug.substring(0, dash + 1);
    var firstNum = parseInt(firstSlug.substring(dash + 1), 10);
    if (isNaN(firstNum)) return [];

    var out = [];
    for (var i = 0; i < total; i++) {
      var currentNum = firstNum + i;
      var actual = items[i];
      var name = (actual && actual.title) ?
        actual.title : ("Vol " + volNumber + " Ch " + currentNum);
      out.push({
        name: name,
        url: lmBaseUrl + "/chapter/" + slugBase + currentNum
      });
    }
    return out;
  },

  // --- Chapter Content (machine-translated sentences) ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var parts = matchAll(
      html,
      /<sentence[^>]*class="[^"]*translated[^"]*"[^>]*>([\s\S]*?)<\/sentence>/g
    );
    if (!parts.length) return out;
    var paras = [];
    for (var i = 0; i < parts.length; i++) {
      var t = textOf(parts[i][1]);
      if (t) paras.push("<p>" + t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</p>");
    }
    out.html = paras.join("");
    return out;
  }
});
