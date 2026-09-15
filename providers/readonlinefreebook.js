// ReadOnlineFreeBook provider for readonlinefreebook.com
// Port of the original Kotlin ReadOnlineFreeBookProvider (QuickNovel).
// Search, genre listings, novel and chapter pages are plain HTML served
// as GET; chapters are listed inline on the novel page.

var rofbBaseUrl = "https://readonlinefreebook.com";

var rofbGenres = [
  { name: "Fantasy", slug: "fantasy-c1" },
  { name: "Romance", slug: "romance-c9" },
  { name: "Adventure", slug: "adventure-c2" },
  { name: "Thriller", slug: "thriller-c3" },
  { name: "Mystery", slug: "mystery-c4" },
  { name: "Horror", slug: "horror-c5" },
  { name: "Historical", slug: "historical-c6" },
  { name: "Science Fiction", slug: "science-fiction-c7" },
  { name: "Young Adult", slug: "young-adult-c8" },
  { name: "Billionaire Romance", slug: "billionaire-romance-c15" },
  { name: "Mystery & Suspense", slug: "mystery-suspense-c16" },
  { name: "Humorous", slug: "humorous-c10" },
  { name: "Christian", slug: "christian-c11" }
];

/// Inner HTML of the first <div ...> whose open tag matches [openRe],
/// balancing nested divs. Returns null when the block cannot be located.
function rofbDivFrom(html, openRe) {
  var open = openRe.exec(html);
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

/// Inner HTML of every <div ...> whose open tag matches [openRe],
/// in document order.
function rofbAllDivs(html, openRe) {
  var blocks = [];
  var re = new RegExp(openRe.source, "g");
  var m;
  while ((m = re.exec(html)) !== null) {
    var pos = m.index + m[0].length;
    var depth = 1;
    var tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = pos;
    var t;
    while ((t = tag.exec(html)) !== null) {
      if (t[0].charAt(1) === "/") {
        depth--;
        if (depth === 0) {
          blocks.push(html.substring(pos, t.index));
          re.lastIndex = t.index + t[0].length;
          break;
        }
      } else if (t[0].charAt(t[0].length - 2) !== "/") {
        depth++;
      }
    }
    if (depth !== 0) break;
  }
  return blocks;
}
/// Inner HTML of every top-level <div class="item"> card on listing pages.
function rofbItemBlocks(html) {
  return rofbAllDivs(html, /<div class="item"[^>]*>/);
}

function rofbParseItems(html) {
  var results = [];
  var blocks = rofbItemBlocks(html);
  for (var i = 0; i < blocks.length; i++) {
    var card = blocks[i];
    var link = /<div class="title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    if (!link) continue;
    var title = textOf(link[2]).replace(/\s*\([\d,]+\s*view\)\s*$/i, "");
    if (!title) continue;
    var imgTag = first(card, /(<img[^>]*>)/);
    var cover = imgTag ? attr(imgTag, "src") : null;
    results.push({
      title: title,
      url: absUrl(rofbBaseUrl, link[1]),
      cover: cover ? absUrl(rofbBaseUrl, unescapeHtml(cover)) : null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  var hasNextPage = /\/p\/\d+/.test(html);
  return { results: results, hasNextPage: hasNextPage };
}

register({
  id: "readonlinefreebook",
  name: "ReadOnlineFreeBook",
  baseUrl: rofbBaseUrl,
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
      options: rofbGenres.map(function(g) { return g.name; }),
      defaultIndex: 0
    }
  ],

  // --- Browse (genre listing, /slug/p/N past page 1) ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var genreIndex = 0;
    if (typeof f.genre === "number" && f.genre >= 0 && f.genre < rofbGenres.length) {
      genreIndex = f.genre;
    }
    var slug = rofbGenres[genreIndex].slug;
    return (
      rofbBaseUrl + "/" + slug +
      ((page || 1) > 1 ? "/p/" + page : "")
    );
  },

  // --- Latest (genre listing is update-sorted) ---
  latestUrl: function(page) {
    return (
      rofbBaseUrl + "/fantasy-c1" +
      ((page || 1) > 1 ? "/p/" + page : "")
    );
  },

  // --- Search ---
  // The site's own links slugify the keyword (/index/search/q/frank-herbert);
  // %20 is flaky server-side (sometimes a 15-byte empty page), so match the
  // link format: lowercase, runs of non-alphanumerics -> single hyphen.
  searchUrl: function(query, page, filters) {
    var slug = (query || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return rofbBaseUrl + "/index/search/q/" + encodeURIComponent(slug);
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return rofbParseItems(html);
  },

  // --- Novel Info ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(rofbBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var descBlock = rofbDivFrom(html, /<div class="desc">/);
    if (!descBlock) return empty;
    var title = first(descBlock, /<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!title) return empty;

    var author = null;
    var authorPos = descBlock.indexOf("Author :");
    if (authorPos !== -1) {
      author = first(
        descBlock.substring(authorPos),
        /<a[^>]*>([^<]*)<\/a>/
      );
      author = author ? textOf(author) : null;
    }

    var genres = [];
    var catPos = descBlock.indexOf("Category :");
    if (catPos !== -1) {
      var catLinks = matchAll(
        descBlock.substring(catPos),
        /<a[^>]*>([^<]*)<\/a>/g
      );
      for (var i = 0; i < catLinks.length; i++) {
        var g = textOf(catLinks[i][1]).replace(/,\s*$/, "");
        if (g) genres.push(g);
      }
    }

    var imagesBlock = rofbDivFrom(html, /<div class="images">/);
    var cover = null;
    if (imagesBlock) {
      var imgTag = first(imagesBlock, /(<img[^>]*>)/);
      cover = imgTag ? attr(imgTag, "src") : null;
    }

    var synBlock = rofbDivFrom(html, /<div class="des_novel"[^>]*>/);
    var description = synBlock ? textOf(synBlock) : "";

    var chapters = [];
    var listPos = html.indexOf("list-page-novel");
    if (listPos !== -1) {
      var tableEnd = html.indexOf("</table>", listPos);
      var listHtml = tableEnd !== -1
        ? html.substring(listPos, tableEnd)
        : html.substring(listPos);
      var links = matchAll(
        listHtml,
        /<td[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      );
      for (var c = 0; c < links.length; c++) {
        var name = textOf(links[c][2]);
        if (!name) continue;
        chapters.push({
          name: name,
          url: absUrl(rofbBaseUrl, links[c][1])
        });
      }
    }

    return {
      title: textOf(title),
      author: author || null,
      cover: cover ? absUrl(rofbBaseUrl, unescapeHtml(cover)) : null,
      status: null,
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
    var title = first(
      html,
      /<a[^>]*class="[^"]*title-chapter-novel[^"]*"[^>]*>([\s\S]*?)<\/a>/
    );
    // Chapter pages carry two content_novel divs (an ad shell first, the
    // story second): use the block holding the des_novel prose.
    var content = null;
    var candidates = rofbAllDivs(html, /<div class="content_novel"[^>]*>/);
    for (var k = 0; k < candidates.length; k++) {
      if (candidates[k].indexOf("des_novel") !== -1) {
        content = candidates[k];
        break;
      }
      if (textOf(candidates[k]).length > textOf(content || "").length) {
        content = candidates[k];
      }
    }
    if (!content || !textOf(content)) return out;
    var titleText = textOf(title || "");
    if (titleText) content = "<p><strong>" + titleText + "</strong></p>" + content;
    out.html = content;
    return out;
  }
});
