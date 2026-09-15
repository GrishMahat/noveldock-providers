// Lnori provider for lnori.com
// The whole catalog lives on a single /library page (article.card per
// series); search filters those cards client-side by normalized title,
// browse applies the genre tag + sort client-side with page slicing.
// Novel pages list one volume per article.card; volume pages carry the
// full chapter prose in main > article.content-body.

var lnBaseUrl = "https://lnori.com";
var lnPageSize = 24;

var lnOrders = [
  { name: "Relevance", value: "" },
  { name: "Title", value: "data-t" },
  { name: "Year Released", value: "data-d" },
  { name: "Volumes", value: "data-v" }
];

var lnTags = [
  "All", "Academy", "Action", "Adult Protagonist", "Adventure", "Age Gap",
  "Airhead", "Alchemy", "Animals", "Anime Tie-in", "Aristocracy", "Battle",
  "Books", "Boys Love", "Business", "Camping", "Childhood Friend",
  "Chuunibyou", "Combat", "Comedy", "Contract Marriage", "Cooking", "Crime",
  "Cross-dressing", "Dark", "Dark Fantasy", "Demon Lord", "Demons", "Dragons",
  "Drama", "Dungeon", "Dungeon Diving", "Dystopian", "Ecchi", "Elf",
  "Enemies to Lovers", "Fairies", "Familiars", "Family", "Fanservice",
  "Fantasy", "Fantasy World", "Female Protagonist", "First Person",
  "Fish Out of Water", "Food", "Friendship", "Futuristic", "Game Elements",
  "Gamer Protagonist", "Gender Bender", "Genius", "Girls Love", "Guns",
  "Harem", "Heartwarming", "High Fantasy", "High School", "Historical",
  "Historical Fantasy", "Horror", "Humor", "Invention", "Isekai", "Josei",
  "Knights", "Lgbtq", "Lighthearted", "Literary", "Magic", "Magic Academy",
  "Magical Weapons", "Maid", "Male Protagonist", "Marriage", "Martial Arts",
  "Master And Servant", "Mature", "Mecha", "Medieval", "Military",
  "Modern Day", "Moe", "Monster Girls", "Monster Taming", "Monsters",
  "Multiple Pov", "Mystery", "Nobility", "Not The Hero", "Op Power",
  "Op Protagonist", "Ordinary Protagonist", "Otaku", "Otome", "Otome Game",
  "Overpowered", "Paranormal", "Past Life", "Period Piece", "Personal Growth",
  "Political Marriage", "Politics", "Princess", "Reincarnation", "Revenge",
  "Reverse Harem", "Rewriting History", "Romance", "Romantic Fantasy", "Rpg",
  "Satire", "School", "School Life", "Sci-fi", "Seinen", "Shoujo", "Shounen",
  "Slice Of Life", "Slow Life", "Snarky Protagonist", "Sorcery", "Strategy",
  "Strong Female Lead", "Supernatural", "Superpowers", "Survival",
  "Sword And Sorcery", "Thriller", "Time Travel", "Tsundere", "Underdog",
  "Unique Ability", "Vampire", "Video Game", "Video Game Related",
  "Video Game Tie-in", "Villainess", "Violence", "Vrmmo", "War",
  "Weak Protagonist", "Witch", "Zero To Hero"
];

function lnTagSlug(name) {
  return String(name).toLowerCase().replace(/\s+/g, "-");
}

// Request context captured by searchUrl/mainPageUrl and consumed by
// searchResults (the catalog page is the same HTML either way).
var lnIsSearch = false;
var lnQuery = "";
var lnPage = 1;
var lnOrderIdx = 0;
var lnTagIdx = 0;

function lnNormalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/// Split the catalog into per-card chunks delimited by the next card
/// start, so nested markup cannot truncate the match.
function lnCards(html) {
  var chunks = String(html).split('<article class="card"');
  var cards = [];
  for (var i = 1; i < chunks.length; i++) {
    cards.push(chunks[i]);
  }
  return cards;
}

function lnCardResult(card) {
  var aOpen = first(card, /(<a[^>]*href="([^"]+)"[^>]*>)/);
  var href = aOpen ? attr(aOpen, "href") : null;
  var title = first(
    card,
    /<h[23][^>]*class="[^"]*card-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
  ) || attr(card, "data-t");
  if (!href || !title || !textOf(title)) return null;
  var img = first(card, /(<img[^>]*>)/);
  var cover = img ? attr(img, "src") : null;
  return {
    title: textOf(unescapeHtml(title)),
    url: absUrl(lnBaseUrl, unescapeHtml(href)),
    cover: cover ? absUrl(lnBaseUrl, unescapeHtml(cover)) : null,
    author: null,
    summary: null,
    rating: null,
    latestChapter: null
  };
}

/// Inner HTML of the first <tag ...>, balancing nested tags of the same
/// name. Returns null when the block cannot be located.
function lnBalancedTag(html, tag) {
  var open = new RegExp("<" + tag + "\\b[^>]*>", "i").exec(html);
  if (!open) return null;
  var pos = open.index + open[0].length;
  var depth = 1;
  var re = new RegExp("<\\/?" + tag + "\\b[^>]*>", "gi");
  re.lastIndex = pos;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].charAt(1) === "/") {
      depth--;
      if (depth === 0) return html.substring(pos, m.index);
    } else if (m[0].charAt(m[0].length - 2) !== "/") {
      depth++;
    }
  }
  return null;
}

register({
  id: "lnori",
  name: "Lnori",
  baseUrl: lnBaseUrl,
  lang: "en",
  version: "1.0.0",

  filters: [
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: lnOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: true
    },
    {
      type: "select",
      id: "tag",
      name: "Genre",
      options: lnTags,
      defaultIndex: 0
    }
  ],

  // --- Browse (whole catalog on one page; filter/sort/slice locally) ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    lnIsSearch = false;
    lnQuery = "";
    lnPage = page || 1;
    lnOrderIdx = typeof f.order === "number" &&
      f.order >= 0 && f.order < lnOrders.length ? f.order : 0;
    lnTagIdx = typeof f.tag === "number" &&
      f.tag >= 0 && f.tag < lnTags.length ? f.tag : 0;
    return lnBaseUrl + "/library";
  },

  // --- Latest (library sorted by year, newest first) ---
  latestUrl: function(page) {
    lnIsSearch = false;
    lnQuery = "";
    lnPage = page || 1;
    lnOrderIdx = 2;
    lnTagIdx = 0;
    return lnBaseUrl + "/library";
  },

  // --- Search (same catalog page; filtered by title locally) ---
  searchUrl: function(query) {
    lnIsSearch = true;
    lnQuery = lnNormalize(query);
    lnPage = 1;
    lnOrderIdx = 0;
    lnTagIdx = 0;
    return lnBaseUrl + "/library";
  },

  searchResults: function(html) {
    var out = { results: [], hasNextPage: false };
    if (!html || typeof html !== "string") return out;
    var cards = lnCards(html);
    var want = lnTagIdx > 0 ? lnTagSlug(lnTags[lnTagIdx]) : null;
    var paired = [];
    for (var i = 0; i < cards.length; i++) {
      var r = lnCardResult(cards[i]);
      if (!r) continue;
      if (lnIsSearch) {
        if (lnQuery && lnNormalize(r.title).indexOf(lnQuery) === -1) continue;
      } else if (want) {
        var tags = (attr(cards[i], "data-tags") || "").toLowerCase();
        if ((" " + tags.replace(/,/g, " ") + " ").indexOf(" " + want + " ") === -1) {
          continue;
        }
      }
      paired.push({ r: r, k: attr(cards[i], lnOrders[lnOrderIdx].value) || "" });
    }
    if (lnIsSearch || lnOrderIdx === 0) {
      out.results = paired.map(function(p) { return p.r; });
      out.hasNextPage = false;
      return out;
    }
    if (lnOrders[lnOrderIdx].value === "data-t") {
      paired.sort(function(a, b) {
        var x = lnNormalize(a.r.title);
        var y = lnNormalize(b.r.title);
        return x < y ? -1 : (x > y ? 1 : 0);
      });
    } else {
      paired.sort(function(a, b) {
        return (parseInt(b.k, 10) || 0) - (parseInt(a.k, 10) || 0);
      });
    }
    var sorted = paired.map(function(p) { return p.r; });
    var start = (lnPage - 1) * lnPageSize;
    out.results = sorted.slice(start, start + lnPageSize);
    out.hasNextPage = start + lnPageSize < sorted.length;
    return out;
  },

  // --- Novel Info (volumes listed as chapters) ---
  novelInfoUrl: function(novelUrl) {
    return absUrl(lnBaseUrl, novelUrl) || novelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;

    var title = first(
      html,
      /<h1[^>]*class="[^"]*s-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
    );
    if (!title || !textOf(title)) return empty;

    var author = first(
      html,
      /<p[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );

    var coverWrap = first(
      html,
      /<figure[^>]*class="[^"]*cover-wrap[^"]*"[^>]*>([\s\S]*?)<\/figure>/i
    );
    var coverImg = coverWrap ? first(coverWrap, /(<img[^>]*>)/) : null;
    var cover = coverImg ? attr(coverImg, "src") : null;

    var description = first(
      html,
      /<p[^>]*class="[^"]*description[^"]*desc-wrapper[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    ) || first(
      html,
      /<p[^>]*class="[^"]*desc-wrapper[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );

    var genres = [];
    var tagsScope = html.indexOf("tags-box desktop");
    if (tagsScope !== -1) {
      var tagHtml = html.substring(tagsScope, tagsScope + 4000);
      var links = matchAll(tagHtml, /<a[^>]*>([\s\S]*?)<\/a>/gi);
      for (var i = 0; i < links.length; i++) {
        var g = textOf(links[i][1]);
        if (g) genres.push(g);
      }
    }

    // Volumes are the readable units (one article.card per volume).
    var chapters = [];
    var volAt = html.indexOf("vol-grid");
    var volHtml = volAt !== -1 ? html.substring(volAt) : html;
    var volCards = lnCards(volHtml);
    for (var j = 0; j < volCards.length; j++) {
      var card = volCards[j];
      if (card.indexOf("/book/") === -1) continue;
      var r = lnCardResult(card);
      if (!r) continue;
      chapters.push({ name: r.title, url: r.url });
    }

    return {
      title: textOf(unescapeHtml(title)),
      author: author ? textOf(unescapeHtml(author)) : null,
      cover: cover ? absUrl(lnBaseUrl, unescapeHtml(cover)) : null,
      status: null,
      genres: genres,
      description: description ? textOf(unescapeHtml(description)) : "",
      chapters: chapters,
      rating: null
    };
  },

  // --- Chapter Content (volume page prose) ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var main = lnBalancedTag(html, "main");
    if (!main) return out;
    var article = lnBalancedTag("<article>" + main, "article");
    var body = article || main;
    // Flatten responsive pictures to plain images.
    body = body.replace(/<picture[^>]*>([\s\S]*?)<\/picture>/gi, function(m, inner) {
      var img = first(inner, /(<img[^>]*>)/i);
      return img || "";
    });
    var imgs = matchAll(body, /(<img[^>]*>)/gi);
    for (var i = 0; i < imgs.length; i++) {
      var src = attr(imgs[i][1], "src");
      if (src && src.indexOf("data:") !== 0) {
        out.images.push(absUrl(lnBaseUrl, unescapeHtml(src)));
      }
    }
    if (!textOf(body)) return out;
    out.html = body;
    return out;
  }
});
