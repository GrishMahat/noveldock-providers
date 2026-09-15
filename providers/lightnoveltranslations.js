// Light Novel Translations provider for lightnovelstranslations.com
// Port of the original Kotlin LightNovelTranslationsProvider (QuickNovel),
// a WordPress novel site.
//
// NOTE (2026-09-15 fix): search was rebuilt. The old flow POSTed
// `field-search` to /read, which returns the unfiltered listing for every
// query (verified: 0 parsed items for "martial god" and for nonsense). The
// theme's admin-ajax actions are no better: `search_novel_header` and
// `search_novel` both return ONE fixed popular-title list for any query.
// Search therefore uses WordPress core search (`/?s=<query>`), which is
// genuinely query-dependent and whose a.more-link anchors resolve to real
// novel URLs. Browse/latest stay on the paginated /read/ listing
// (div.read_list-story-item cards, a.next.page-numbers paging). Novel info
// is the novel page + ?tab=table_contents (chapter list:
// li.chapter-item.unlock), chapter text is div.text_story.

var ltBaseUrl = "https://lightnovelstranslations.com";

var ltCategories = [
  { name: "Most Liked", value: "most-liked" },
  { name: "Most Recent", value: "most-recent" }
];

var ltStatuses = [
  { name: "All", value: "all" },
  { name: "Ongoing", value: "ongoing" },
  { name: "Completed", value: "completed" }
];

/// Inner HTML of <div ... class="...cls..." ...>, balancing nested divs.
function ltDivByClass(html, cls) {
  var open = new RegExp(
    '<div[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>', "i"
  ).exec(html);
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

/// Largest candidate from an <img> srcset, falling back to src.
function ltCover(imgTag) {
  if (!imgTag) return null;
  var srcset = attr(imgTag, "srcset") || attr(imgTag, "data-srcset");
  if (srcset) {
    var cands = srcset.split(",");
    var best = null;
    var bestW = -1;
    for (var i = 0; i < cands.length; i++) {
      var parts = cands[i].trim().split(/\s+/);
      var w = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      if (isNaN(w)) w = 0;
      if (w >= bestW) {
        bestW = w;
        best = parts[0];
      }
    }
    if (best) return absUrl(ltBaseUrl, unescapeHtml(best));
  }
  var src = attr(imgTag, "src") || attr(imgTag, "data-src");
  return src ? absUrl(ltBaseUrl, unescapeHtml(src)) : null;
}

function ltStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s.indexOf("ongoing") !== -1 || s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("cancel") !== -1 || s.indexOf("drop") !== -1) return "dropped";
  return s;
}

/// Parse homepage novel cards (div.novel-item > h4.novel_item_title > a).
/// Each card carries the novel URL + title in the h4 link and the cover in
/// .item_thumb img. Chapter-link cards ("New chapters available soon") are
/// skipped: their h4 link points at a /chapter-.../ URL instead of a novel.
function ltParseHomeCards(html, onlyNovelUrls) {
  var out = { results: [], hasNextPage: false };
  if (!html || typeof html !== "string") return out;
  var seen = {};
  var rest = html;
  while (true) {
    var open = /<div[^>]*class="[^"]*\bnovel-item\b[^"]*"[^>]*>/i.exec(rest);
    if (!open) break;
    var pos = open.index + open[0].length;
    var depth = 1;
    var tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = pos;
    var m;
    var end = -1;
    while ((m = tag.exec(rest)) !== null) {
      if (m[0].charAt(1) === "/") {
        depth--;
        if (depth === 0) {
          end = m.index;
          break;
        }
      } else if (m[0].charAt(m[0].length - 2) !== "/") {
        depth++;
      }
    }
    if (end === -1) break;
    var card = rest.substring(pos, end);
    rest = rest.substring(tag.lastIndex);
    var lm = /<h4[^>]*class="[^"]*novel_item_title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(card) ||
      /<h4[^>]*class="[^"]*novel_item_title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    if (!lm) continue;
    var href = lm[1];
    var title = textOf(unescapeHtml(lm[2] !== undefined && lm[3] !== undefined ? (lm[2] || lm[3]) : (lm[2] || "")));
    if (!href || !title) continue;
    // Drop chapter cards (href has a chapter slug after /novel/<slug>/...).
    var novelMatch = /\/novel\/([a-z0-9-]+)\/?(?:[?#]|$)/i.exec(href);
    if (onlyNovelUrls && !novelMatch) continue;
    var url = novelMatch
      ? ltBaseUrl + "/novel/" + novelMatch[1] + "/"
      : absUrl(ltBaseUrl, href);
    if (seen[url]) continue;
    seen[url] = true;
    var imgTag = /<img[^>]*>/.exec(card);
    out.results.push({
      title: title,
      url: url,
      cover: ltCover(imgTag ? imgTag[0] : null),
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  return out;
}

/// Parse the homepage LATEST UPDATES rows (div.lastest_wrap_item): the h4
/// link is the novel, .name_chapter carries the latest chapter title.
function ltParseLatestUpdates(html) {
  var out = { results: [], hasNextPage: false };
  if (!html || typeof html !== "string") return out;
  var seen = {};
  var blocks = matchAll(
    html,
    /<div[^>]*class="[^"]*lastest_wrap_item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi
  );
  for (var i = 0; i < blocks.length; i++) {
    var card = blocks[i][1];
    var lm = /<h4[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    if (!lm || !lm[1]) continue;
    var title = textOf(unescapeHtml(lm[2] || lm[3] || ""));
    if (!title) continue;
    var novelMatch = /\/novel\/([a-z0-9-]+)\/?(?:[?#]|$)/i.exec(lm[1]);
    var url = novelMatch
      ? ltBaseUrl + "/novel/" + novelMatch[1] + "/"
      : absUrl(ltBaseUrl, lm[1]);
    if (seen[url]) continue;
    seen[url] = true;
    var ch = /<div[^>]*class="[^"]*name_chapter[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    out.results.push({
      title: title,
      url: url,
      cover: null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: ch ? textOf(ch[1]) : null
    });
  }
  return out;
}

function ltParseListing(html) {
  var out = { results: [], hasNextPage: false };
  var rest = html;
  while (true) {
    var open = /<div[^>]*class="[^"]*read_list-story-item(?!-)[^"]*"[^>]*>/i.exec(rest);
    if (!open) break;
    var pos = open.index + open[0].length;
    var depth = 1;
    var tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = pos;
    var m;
    var end = -1;
    while ((m = tag.exec(rest)) !== null) {
      if (m[0].charAt(1) === "/") {
        depth--;
        if (depth === 0) {
          end = m.index;
          break;
        }
      } else if (m[0].charAt(m[0].length - 2) !== "/") {
        depth++;
      }
    }
    if (end === -1) break;
    var card = rest.substring(pos, end);
    rest = rest.substring(tag.lastIndex);
    var lm = /<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"/.exec(card);
    if (!lm || !lm[1]) continue;
    var title = textOf(unescapeHtml(lm[2] || ""));
    if (!title) continue;
    var imgTag = /<img[^>]*>/.exec(card);
    out.results.push({
      title: title,
      url: absUrl(ltBaseUrl, lm[1]),
      cover: ltCover(imgTag ? imgTag[0] : null),
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  out.hasNextPage = out.results.length > 0 &&
    /<a[^>]*class="[^"]*next page-numbers[^"]*"[^>]*>/.test(html);
  return out;
}

/// Novel URL for any site link ("/novel/<slug>/", "/novel/<slug>/<chapter>/").
function ltNovelUrlOf(href) {
  var m = /\/novel\/([a-z0-9-]+)(?:\/|$|\?)/i.exec(href || "");
  return m ? ltBaseUrl + "/novel/" + m[1] + "/" : null;
}

/// Human-ish title from a novel slug ("lunar-legacy" -> "Lunar Legacy").
/// The app replaces it with the real title once the novel page loads.
function ltTitleFromSlug(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b([a-z])/g, function(c) { return c.toUpperCase(); });
}

/// WordPress core search results (`/?s=<query>`). The theme prints only an
/// excerpt per hit, but each hit's a.more-link points at the novel itself
/// (and/or one of its chapters), so the novel URL is recovered from it.
function ltParseWpSearch(html) {
  var out = { results: [], hasNextPage: false };
  var seen = {};
  var anchors = matchAll(html, /<a\b[^>]*>/gi);
  for (var i = 0; i < anchors.length; i++) {
    var tag = anchors[i][0];
    if (!/\bmore-link\b/.test(tag)) continue;
    var url = ltNovelUrlOf(attr(tag, "href"));
    if (!url || seen[url]) continue;
    seen[url] = true;
    var slug = url.replace(/^.*\/novel\//, "").replace(/\/$/, "");
    out.results.push({
      title: ltTitleFromSlug(slug),
      url: url,
      cover: null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  out.hasNextPage = /<a[^>]*class="[^"]*next page-numbers[^"]*"[^>]*>/.test(html);
  return out;
}

register({
  id: "lightnoveltranslations",
  name: "Light Novel Translations",
  baseUrl: ltBaseUrl,
  lang: "en",
  version: "1.0.0",

  // Site search is keyword-only; browse filters don't apply there.
  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "category",
      name: "Category",
      options: ltCategories.map(function(o) { return o.name; }),
      defaultIndex: 0
    },
    {
      type: "select",
      id: "status",
      name: "Status",
      options: ltStatuses.map(function(o) { return o.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse (the /read/ paginated listing; verified live) ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var catIdx = typeof f.category === "number" &&
      f.category >= 0 && f.category < ltCategories.length ? f.category : 0;
    var statusIdx = typeof f.status === "number" &&
      f.status >= 0 && f.status < ltStatuses.length ? f.status : 0;
    return ltBaseUrl + "/read/page/" + (page || 1) +
      "?sortby=" + encodeURIComponent(ltCategories[catIdx].value) +
      "&status=" + encodeURIComponent(ltStatuses[statusIdx].value);
  },

  // --- Latest ---
  latestUrl: function(page) {
    return ltBaseUrl + "/read/page/" + (page || 1) +
      "?sortby=most-recent&status=all";
  },

  // --- Search (WordPress core search: /?s=<query>).
  // The theme's own search box is useless for this: the admin-ajax
  // `search_novel_header` action returns one fixed popular-title list for
  // every query, POSTing `field-search` to /read returns the unfiltered
  // listing, and `search_novel` is fixed too. `?s=` is genuinely
  // query-dependent, so results come from it.
  searchUrl: function(query, page, filters) {
    var p = page || 1;
    return ltBaseUrl + "/?s=" + encodeURIComponent((query || "").trim()) +
      (p > 1 ? "&paged=" + p : "");
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    // /read/ listing (browse/latest share this parser).
    if (html.indexOf("read_list-story-item") !== -1) {
      return ltParseListing(html);
    }
    // Homepage section cards.
    var cards = ltParseHomeCards(html, true);
    if (cards.results.length) return cards;
    // WordPress search results.
    return ltParseWpSearch(html);
  },

  // --- Novel Info ---
  // The novel page carries info; the ?tab=table_contents page carries the
  // chapter list (li.chapter-item.unlock). The app fetches ONE url, so
  // novelInfoUrl requests the ToC tab (it still embeds the full info block).
  novelInfoUrl: function(novelUrl) {
    var url = absUrl(ltBaseUrl, novelUrl) || novelUrl;
    if (url.indexOf("tab=") === -1) {
      url += (url.indexOf("?") === -1 ? "?" : "&") + "tab=table_contents";
    }
    return url;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    // Title: <title>Faceless Dropout</title> (novel_title h3 also works).
    var rawTitle = first(html, /<title>([^<]*)<\/title>/i) ||
      first(html, /<div[^>]*class="[^"]*novel_title[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!rawTitle || !textOf(rawTitle)) return empty;

    // Author: <li><span>Author:</span> NAME</li> inside .novel_detail_info.
    var author = null;
    var authorLi = first(html, /<li[^>]*>\s*<span[^>]*>Author:<\/span>([^<]*)<\/li>/);
    if (authorLi) {
      var an = textOf(authorLi).replace(/^[:\s]+/, "");
      if (an) author = an;
    }

    var cover = null;
    var novelImage = ltDivByClass(html, "novel-image");
    if (novelImage) {
      var imgTag = /<img[^>]*>/.exec(novelImage);
      if (imgTag) cover = ltCover(imgTag[0]);
    }

    var status = ltStatusOf(first(html, /<div[^>]*class="[^"]*novel_status[^"]*"[^>]*>([\s\S]*?)<\/div>/));

    var genres = [];
    var tagsBlock = ltDivByClass(html, "novel_tags_item");
    if (!tagsBlock) tagsBlock = ltDivByClass(html, "novel_tags_list");
    if (tagsBlock) {
      var spans = matchAll(tagsBlock, /<span[^>]*>([^<]*)<\/span>/g);
      for (var g = 0; g < spans.length; g++) {
        var gt = textOf(spans[g][1]);
        if (gt) genres.push(gt);
      }
    }

    // Synopsis: div.novel_text on the About tab; the ToC tab only has the
    // short alternate_titles block, so fall back gracefully.
    var synopsisBlock = ltDivByClass(html, "novel_text");
    var description = synopsisBlock ? textOf(synopsisBlock) : "";

    // Chapters: the real markup is
    //   <li class="chapter-item chapter-131454 unlock">
    //     <span>1:</span><a href=".../novel/<slug>/<ch-slug>/" title="...">NAME</a>
    // Locked (non-unlock) items are skipped.
    var chapters = [];
    var lis = matchAll(html, /<li[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g);
    for (var i = 0; i < lis.length; i++) {
      var cls = lis[i][1];
      if (cls.indexOf("chapter-item") === -1 || cls.indexOf("unlock") === -1) continue;
      var lm = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(lis[i][2]);
      if (!lm || !lm[1]) continue;
      var name = textOf(lm[2]);
      if (!name) continue;
      chapters.push({
        name: name,
        url: absUrl(ltBaseUrl, lm[1])
      });
    }
    // The ToC is already oldest-first (`<span>1:</span>`, `2:`, ...).

    return {
      title: textOf(rawTitle).replace(/\s*\|\s*Light Novels Translations\s*$/i, ""),
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: description,
      chapters: chapters,
      rating: null
    };
  },

  // --- Chapter Content ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var content = ltDivByClass(html, "text_story");
    if (!content) return out;
    // Strip ad containers (balanced; they nest divs).
    var rest = content;
    var cleaned = "";
    // Simple approach: remove <div ...ads_content...>(balanced)</div>.
    while (true) {
      var open = /<div[^>]*class="[^"]*ads_content[^"]*"[^>]*>/i.exec(rest);
      if (!open) {
        cleaned += rest;
        break;
      }
      cleaned += rest.substring(0, open.index);
      var pos = open.index + open[0].length;
      var depth = 1;
      var tag = /<\/?div\b[^>]*>/gi;
      tag.lastIndex = pos;
      var m;
      var end = -1;
      while ((m = tag.exec(rest)) !== null) {
        if (m[0].charAt(1) === "/") {
          depth--;
          if (depth === 0) {
            end = m.index + m[0].length;
            break;
          }
        } else if (m[0].charAt(m[0].length - 2) !== "/") {
          depth++;
        }
      }
      if (end === -1) {
        cleaned += rest.substring(open.index);
        break;
      }
      rest = rest.substring(end);
    }
    out.html = cleaned;
    return out;
  }
});
