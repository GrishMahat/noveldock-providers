// ReadFromNet provider for readfrom.net
// Port of the original Kotlin ReadfromnetProvider (QuickNovel).
// Search, genre listings, book and page views are plain HTML served as
// GET. A book's "chapters" are its numbered pages (page,1,...), listed
// inline on the book page; page text lives in #textToRead.

var rfnBaseUrl = "https://readfrom.net";

// Page requested by the last mainPageUrl/searchUrl call, used to detect
// the next page in searchResults (which only receives html).
var rfnPage = 1;

// Absolute URL of the novel whose info was parsed last. The page-1
// chapter URL is derived from it (the pager only links pages 2+).
var rfnNovelUrl = null;

var rfnGenres = [
  { name: "All Books", slug: "allbooks" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Romance", slug: "romance" },
  { name: "Fiction", slug: "fiction" },
  { name: "Mystery", slug: "mystery" },
  { name: "Thriller", slug: "thriller" },
  { name: "Horror", slug: "horror" },
  { name: "Suspense", slug: "suspense" },
  { name: "Adventure", slug: "adventure" },
  { name: "Science Fiction", slug: "science-fiction" },
  { name: "Historical", slug: "historical" },
  { name: "Historical Fiction", slug: "historical-fiction" },
  { name: "Contemporary", slug: "contemporary" },
  { name: "Young Adult", slug: "young-adult" },
  { name: "New Adult", slug: "new-adult" },
  { name: "Paranormal", slug: "paranormal" },
  { name: "Paranormal Romance", slug: "paranormal-romance" },
  { name: "Urban Fantasy", slug: "urban-fantasy" },
  { name: "Fantasy Romance", slug: "fantasy-romance" },
  { name: "Mystery & Thrillers", slug: "mystery-thrillers" },
  { name: "Crime", slug: "crime" },
  { name: "Detective", slug: "detective" },
  { name: "Dystopia", slug: "dystopia" },
  { name: "Literature & Fiction", slug: "literature-fiction" },
  { name: "Classics", slug: "classics" },
  { name: "Short Stories", slug: "short-stories" },
  { name: "Humor", slug: "humor" },
  { name: "Poetry", slug: "poetry" },
  { name: "Biography", slug: "biography" },
  { name: "Memoir", slug: "memoir" },
  { name: "History", slug: "history" },
  { name: "Science", slug: "science" },
  { name: "Children's Books", slug: "children-s-books" }
];

/// Inner HTML of the first <div ... id="..." ...>, balancing nested divs.
/// Returns null when the block cannot be located.
function rfnDivById(html, id) {
  var open = new RegExp(
    '<div[^>]*\\bid\\s*=\\s*["\']' + id + '["\'][^>]*>'
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

function rfnParseArticles(html) {
  var results = [];
  // One <article> per result; articles never nest, so a lazy match is
  // exact here.
  var articles = matchAll(html, /<article[^>]*>([\s\S]*?)<\/article>/g);
  for (var i = 0; i < articles.length; i++) {
    var card = articles[i][1];
    // The link must live INSIDE the <h2> — an unbounded `([\s\S]*?)<\/a>`
    // used to reach past the heading and pick up unrelated links (the
    // search page's own form block is an <article> too, and it matched the
    // A–Z authors index far below it).
    var headBlock = first(card, /<h2[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    if (!headBlock) continue;
    var link = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(headBlock);
    if (!link) continue;
    var href = link[1];
    // Skip ad/placeholder blocks: book links end in .html, never images.
    if (!href || !/\.html(\?|#|$)/i.test(href)) continue;
    if (/\.(jpg|jpeg|png|gif|webp)/i.test(href)) continue;
    var title = textOf(link[2]);
    if (!title) continue;
    var imgTag = first(card, /(<img[^>]*>)/);
    var cover = imgTag ? attr(imgTag, "src") : null;
    var author = first(
      card,
      /series by <a[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!author) {
      author = first(card, /\bby <a[^>]*>([\s\S]*?)<\/a>/i);
    }
    results.push({
      title: title,
      url: absUrl(rfnBaseUrl, href),
      cover: cover ? absUrl(rfnBaseUrl, unescapeHtml(cover)) : null,
      author: author ? textOf(author) : null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  var hasNextPage = html.indexOf("/page/" + (rfnPage + 1)) !== -1;
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "readfromnet",
  name: "ReadFromNet",
  baseUrl: rfnBaseUrl,
  lang: "en",
  version: "1.0.0",
  author: "noveldock",

  // Site search is keyword-only; browse filters don't apply there.
  flags: { searchFilters: false },

  filters: [
    {
      type: "select",
      id: "genre",
      name: "Genre",
      options: rfnGenres.map(function(g) { return g.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var genreIndex = 0;
    if (typeof f.genre === "number" && f.genre >= 0 && f.genre < rfnGenres.length) {
      genreIndex = f.genre;
    }
    rfnPage = page || 1;
    return (
      rfnBaseUrl + "/" + rfnGenres[genreIndex].slug +
      "/page/" + rfnPage + "/"
    );
  },

  // --- Latest ---
  latestUrl: function(page) {
    rfnPage = page || 1;
    return rfnBaseUrl + "/allbooks/page/" + rfnPage + "/";
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    rfnPage = page || 1;
    return (
      rfnBaseUrl + "/build_in_search/?q=" +
      encodeURIComponent((query || "").trim())
    );
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return rfnParseArticles(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    rfnNovelUrl = absUrl(rfnBaseUrl, novelUrl) || novelUrl;
    return rfnNovelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var rawTitle = first(html, /<h2 class="title"[^>]*>([\s\S]*?)<\/h2>/);
    if (!rawTitle) return empty;
    var title = textOf(rawTitle).split(", page")[0].split("#")[0].trim();
    if (!title) return empty;

    // Author is the last breadcrumb name (the first crumb is "Author").
    var author = null;
    var crumbs = matchAll(
      html,
      /<span itemprop="name">([^<]*)<\/span>/g
    );
    for (var ci = crumbs.length - 1; ci >= 0; ci--) {
      var crumb = textOf(crumbs[ci][1]);
      if (crumb && crumb.toLowerCase() !== "author") {
        author = crumb;
        break;
      }
    }

    var cover = first(
      html,
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/
    );
    if (!cover) {
      cover = first(
        html,
        /<meta[^>]*content="([^"]+)"[^>]*property="og:image"/
      );
    }

    var description = first(
      html,
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/
    );
    if (!description) {
      description = first(
        html,
        /<meta[^>]*content="([^"]+)"[^>]*name="description"/
      );
    }

    var chapters = [];
    var seen = {};
    var pager = first(
      html,
      /<div[^>]*class="[^"]*splitnewsnavigation2[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/
    );
    // The pager nests one extra div level (center > div.pages), so fall
    // back to scanning the whole page for page links when needed.
    var pageLinks = pager
      ? matchAll(pager, /<a[^>]*href="([^"]*page,\d+,[^"]*)"[^>]*>([^<]*)<\/a>/g)
      : [];
    if (!pageLinks.length) {
      pageLinks = matchAll(
        html,
        /<a[^>]*href="([^"]*page,\d+,[^"]*)"[^>]*>([^<]*)<\/a>/g
      );
    }
    // Page 1 has no pager link of its own; rebuild it from the book URL
    // (same scheme as the Kotlin provider).
    if (rfnNovelUrl) {
      var clean = rfnNovelUrl.replace(/\/$/, "");
      var slash = clean.lastIndexOf("/");
      var pageOne = clean.substring(0, slash + 1) + "page,1," +
        clean.substring(slash + 1);
      chapters.push({ name: "page 1", url: pageOne });
      seen[pageOne] = true;
    }
    for (var p = 0; p < pageLinks.length; p++) {
      var href = pageLinks[p][1];
      if (seen[href]) continue;
      seen[href] = true;
      var label = textOf(pageLinks[p][2]);
      chapters.push({
        name: label ? "page " + label : "page " + (chapters.length + 1),
        url: absUrl(rfnBaseUrl, href)
      });
    }
    chapters.sort(function(a, b) {
      var na = parseInt((a.name.match(/(\d+)/) || [0, 0])[1], 10);
      var nb = parseInt((b.name.match(/(\d+)/) || [0, 0])[1], 10);
      return na - nb;
    });

    return {
      title: title,
      author: author,
      cover: cover ? absUrl(rfnBaseUrl, unescapeHtml(cover)) : null,
      status: null,
      genres: [],
      description: description ? unescapeHtml(description) : "",
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
    // The book template ships commented-out #textToRead placeholders;
    // drop comments so the balanced-div search hits the live block.
    var clean = html.replace(/<!--[\s\S]*?-->/g, "");
    var content = rfnDivById(clean, "textToRead");
    if (!content || !textOf(content)) return out;
    out.html = content;
    return out;
  }
});
