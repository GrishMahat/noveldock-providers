// WuxiaClick provider for wuxia.click
// Port of the original Kotlin WuxiaClickProvider (QuickNovel).
//
// Browse/search run on the site's JSON APIs (/api/search/, /api/novels/);
// novel info and chapter text are HTML. Chapters are enumerated from the
// novel page's chapter count (no chapter-list API); chapter paragraphs
// carry id="chapterText" markers. All hashed mantine-* classes are matched
// on elements only (style/script blocks are stripped first).

var wcBaseUrl = "https://wuxia.click";
var wcApiUrl = "https://wuxia.click/api";

var wcCategories = [
  "", "mature", "psychological", "tragedy", "mystery", "seinen",
  "harem", "mecha", "xuanhuan", "josei", "horror", "adult", "sci-fi",
  "action", "smut", "drama", "yaoi", "school life", "comedy",
  "gender bender", "adventure", "shounen", "romance", "fantasy",
  "xianxia", "martial arts", "shounen ai", "supernatural",
  "slice of life", "ecchi", "sports", "shoujo", "historical", "wuxia",
  "yuri", "shoujo ai", "mtl"
];

var wcCategoryNames = [
  "All", "Mature", "Psychological", "Tragedy", "Mystery", "Seinen",
  "Harem", "Mecha", "Xuanhuan", "Josei", "Horror", "Adult", "Sci-fi",
  "Action", "Smut", "Drama", "Yaoi", "School life", "Comedy",
  "Gender bender", "Adventure", "Shounen", "Romance", "Fantasy",
  "Xianxia", "Martial arts", "Shounen ai", "Supernatural",
  "Slice of life", "Ecchi", "Sports", "Shoujo", "Historical", "Wuxia",
  "Yuri", "Shoujo ai", "Mtl"
];

var wcOrders = [
  { name: "Translated chapters", value: "-num_of_chaps" },
  { name: "Rating", value: "-rating" },
  { name: "Name", value: "-name" },
  { name: "Old", value: "-created_at" },
  { name: "New", value: "created_at" }
];

var wcTags = [
  "", "shotacon", "handsome male lead", "male protagonist",
  "beautiful female lead", "weak to strong", "transmigration",
  "calm protagonist", "clever protagonist", "female protagonist",
  "love interest falls in love first", "hard-working protagonist",
  "cultivation", "strong love interests", "modern day", "nobles",
  "schemes and conspiracies", "wealthy characters", "cunning protagonist",
  "misunderstandings", "royalty", "devoted love interests",
  "multiple realms", "character growth", "arrogant characters",
  "determined protagonist", "reincarnation", "past plays a big role",
  "romantic subplot", "magic", "time skip", "dragons", "adapted to manhua",
  "demons", "aristocracy", "alchemy", "hiding true identity",
  "special abilities", "multiple pov", "slow romance", "wars", "gods",
  "ruthless protagonist", "lucky protagonist", "monsters",
  "hiding true abilities", "overpowered protagonist", "polygamy",
  "game elements", "possessive characters", "older love interests",
  "sword and magic", "doting love interests", "beast companions",
  "caring protagonist", "death of loved ones", "loyal subordinates",
  "artifacts", "shameless protagonist", "sword wielder", "revenge",
  "second chance", "fantasy world", "tragic past", "cold love interests",
  "immortals", "marriage", "body tempering",
  "strength-based social hierarchy", "european ambience",
  "adapted to manhwa", "betrayal", "pregnancy", "genius protagonist",
  "underestimated protagonist", "hidden abilities", "kingdoms",
  "confident protagonist", "protagonist strong from the start",
  "bloodlines", "power couple", "friendship", "manipulative characters",
  "strong to stronger", "depictions of cruelty", "charismatic protagonist",
  "fast cultivation", "unique cultivation technique", "world travel",
  "academy", "dense protagonist", "elves", "previous life talent",
  "poor to rich", "alternate world", "cold protagonist", "politics",
  "pill concocting", "fast learner", "obsessive love",
  "long separations", "money grubber", "transported to another world",
  "cheats", "cautious protagonist", "mature protagonist", "familial love",
  "arranged marriage", "magical space", "comedic undertone",
  "mysterious past", "male yandere", "mysterious family background",
  "famous protagonist", "magic formations", "family conflict",
  "system administrator", "reincarnated in another world", "late romance",
  "heavenly tribulation", "proactive protagonist",
  "complex family relationships", "pets", "level system",
  "enemies become allies", "cute children", "death", "mythical beasts",
  "enemies become lovers", "soul power", "ancient china",
  "dao comprehension", "charming protagonist", "acting", "time travel",
  "multiple reincarnated individuals", "past trauma", "absent parents",
  "master-disciple relationship", "childcare",
  "family", "secret organizations", "phoenixes",
  "appearance different from actual age", "curses", "age progression",
  "secret identity", "sharp-tongued characters", "naive protagonist",
  "knights", "kingdom building", "spatial manipulation", "demon lord",
  "tsundere", "appearance changes", "cruel characters",
  "fantasy creatures", "assassins", "popular love interests",
  "spirit advisor", "time manipulation", "dark", "business management",
  "heartwarming", "broken engagement", "destiny", "cooking", "religions",
  "protagonist with multiple bodies", "cute protagonist", "r-18"
];

// Novel URL captured in novelInfoUrl so novelInfo can derive the slug for
// chapter enumeration (chapters live in the info payload, no chapter API).
var wcNovelUrl = null;

/// Strip style/script blocks so hashed mantine-* classes inside CSS/JS
/// cannot match element selectors below.
function wcBody(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

/// Escape plain text for embedding in the returned chapter HTML.
function wcEscapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wcParseApiResults(text) {
  var out = { results: [], hasNextPage: false };
  var data;
  try {
    data = JSON.parse(typeof text === "string" ? text.trim() : "");
  } catch (e) {
    return out;
  }
  if (!data) return out;
  var items = data.results || (data.data && data.data.items) || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.name || !item.slug) continue;
    var cover = item.image || item.cover || null;
    out.results.push({
      title: item.name,
      url: wcBaseUrl + "/novel/" + item.slug,
      cover: cover ? absUrl(wcBaseUrl, cover) : null,
      author: null,
      summary: null,
      rating: null,
      latestChapter: null
    });
  }
  out.hasNextPage = data.next !== undefined && data.next !== null;
  return out;
}

function wcStatusOf(s) {
  s = (s || "").toLowerCase().trim();
  if (!s) return null;
  if (s === "tr" || s.indexOf("ongoing") !== -1 ||
      s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("complete") !== -1 || s === "done") return "completed";
  if (s.indexOf("hiatus") !== -1 || s.indexOf("paus") !== -1) return "paused";
  if (s.indexOf("drop") !== -1) return "dropped";
  return s;
}

register({
  id: "wuxiaclick",
  name: "WuxiaClick",
  baseUrl: wcBaseUrl,
  lang: "en",
  nsfw: true,
  version: "1.0.0",

  filters: [
    {
      type: "select",
      id: "category",
      name: "Category",
      options: wcCategoryNames,
      defaultIndex: 0
    },
    {
      type: "sort",
      id: "order",
      name: "Sort by",
      options: wcOrders.map(function(o) { return o.name; }),
      defaultIndex: 0,
      defaultAscending: false
    },
    {
      type: "select",
      id: "tag",
      name: "Tag",
      options: ["All"].concat(wcTags.slice(1).map(function(t) {
        return t.charAt(0).toUpperCase() + t.slice(1);
      })),
      defaultIndex: 0
    }
  ],

  // --- Browse (JSON APIs; tag and category both narrow via /api/novels/) ---
  mainPageUrl: function(page, filters) {
    var f = filters || {};
    var catIdx = typeof f.category === "number" &&
      f.category >= 0 && f.category < wcCategories.length ? f.category : 0;
    var orderIdx = typeof f.order === "number" &&
      f.order >= 0 && f.order < wcOrders.length ? f.order : 0;
    var tagIdx = typeof f.tag === "number" &&
      f.tag >= 0 && f.tag < wcTags.length ? f.tag : 0;
    var cat = wcCategories[catIdx];
    var tag = wcTags[tagIdx];
    var order = wcOrders[orderIdx].value;
    var p = page || 1;
    var limit = 24;
    var offset = (p - 1) * limit;
    if (tag) {
      return wcApiUrl + "/novels/?format=json&tag=" + encodeURIComponent(tag) +
        "&limit=" + limit + "&offset=" + offset +
        "&order=" + encodeURIComponent(order);
    }
    if (cat) {
      return wcApiUrl + "/novels/?format=json&category_name=" + encodeURIComponent(cat) +
        "&limit=" + limit + "&offset=" + offset +
        "&order=" + encodeURIComponent(order);
    }
    return wcApiUrl + "/search/?format=json&search=&limit=" + limit + "&offset=" + offset +
      "&order=" + encodeURIComponent(order);
  },

  // --- Latest (newly added first) ---
  latestUrl: function(page) {
    var p = page || 1;
    var limit = 24;
    return wcApiUrl + "/search/?format=json&search=&limit=" + limit +
      "&offset=" + ((p - 1) * limit) + "&order=created_at";
  },

  // --- Search ---
  searchUrl: function(query, page, filters) {
    var p = 1;
    var limit = 24;
    return wcApiUrl + "/search/?format=json&search=" +
      encodeURIComponent((query || "").trim()) +
      "&limit=" + limit + "&offset=" + ((p - 1) * limit) + "&order=";
  },

  searchResults: function(html) {
    if (!html || typeof html !== "string") {
      return { results: [], hasNextPage: false };
    }
    return wcParseApiResults(html);
  },

  // --- Novel Info (HTML; chapters enumerated from the chapter count) ---
  novelInfoUrl: function(novelUrl) {
    wcNovelUrl = absUrl(wcBaseUrl, novelUrl) || novelUrl;
    return wcNovelUrl;
  },

  novelInfo: function(html) {
    var empty = {
      title: "", author: null, cover: null, status: null,
      genres: [], description: "", chapters: [], rating: null
    };
    if (!html || typeof html !== "string") return empty;
    var body = wcBody(html);

    var title = first(body, /<h5[^>]*>([\s\S]*?)<\/h5>/i);
    if (!title || !textOf(title)) return empty;

    // The novel page lazy-loads its cover (empty img/og:image), so the
    // detail screen falls back to the monogram tile; search/browse cards
    // carry the real covers.
    var cover = null;

    var synopsis = first(
      body,
      /<div[^>]*class="[^"]*mantine-Spoiler-content[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*mantine-Text-root[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );

    var author = null;
    var byLine = first(
      body,
      /<div[^>]*class="[^"]*mantine-lqk3v2[^"]*"[^>]*>[\s\S]*?<div[^>]*>\s*By\s*<!--[^>]*-->([^<]*)</i
    ) || first(
      body,
      /<div[^>]*class="[^"]*mantine-lqk3v2[^"]*"[^>]*>[\s\S]*?<div[^>]*>\s*By\s+([^<]*)</i
    );
    if (byLine) {
      var name = textOf(byLine);
      if (name && name.toLowerCase() !== "none") author = name;
    }

    var status = null;
    var statusBlock = first(
      body,
      /<div[^>]*class="[^"]*mantine-1uxmzbt[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
    );
    if (statusBlock) {
      var st = first(
        statusBlock,
        /<div[^>]*class="[^"]*mantine-1huvzos[^"]*"[^>]*>([^<]*)</i
      );
      status = wcStatusOf(st);
    }

    var genres = [];
    var tagsAt = body.indexOf(">Tags</h5>");
    if (tagsAt !== -1) {
      var tagScope = body.substring(tagsAt, tagsAt + 6000);
      var badges = matchAll(
        tagScope,
        /mantine-Badge-inner[^>]*>([^<]*)</g
      );
      for (var i = 0; i < badges.length; i++) {
        var g = textOf(badges[i][1]);
        if (g) genres.push(g);
      }
    }

    // Chapters are enumerated from the chapter count (no chapter API).
    var chapters = [];
    if (wcNovelUrl) {
      var slug = String(wcNovelUrl).replace(/\/$/, "").split("/").pop();
      var countEl = first(
        body,
        /<div[^>]*class="[^"]*mantine-19n0k2t[^"]*"[^>]*>(\d+)[^<]*</i
      );
      var total = countEl ? parseInt(countEl, 10) : 0;
      if (slug && total > 0) {
        for (var n = 1; n <= total; n++) {
          chapters.push({
            name: "Chapter " + n,
            url: wcBaseUrl + "/chapter/" + slug + "-" + n
          });
        }
      }
    }

    var rating = null;
    var ratingBadge = first(
      body,
      /⭐\s*<!--[^>]*-->([\d.]+)/i
    );
    if (ratingBadge) {
      var stars = parseFloat(ratingBadge.trim());
      if (!isNaN(stars)) rating = Math.round(stars * 200);
    }

    return {
      title: textOf(title),
      author: author,
      cover: cover,
      status: status,
      genres: genres,
      description: synopsis ? textOf(synopsis) : "",
      chapters: chapters,
      rating: rating
    };
  },

  // --- Chapter Content (id="chapterText" paragraphs) ---
  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var out = { html: "", images: [] };
    if (!html || typeof html !== "string") return out;
    var body = wcBody(html);
    var paras = matchAll(
      body,
      /<div[^>]*id="chapterText"[^>]*>([\s\S]*?)<\/div>/gi
    );
    if (!paras.length) return out;
    var parts = [];
    for (var i = 0; i < paras.length; i++) {
      var t = textOf(paras[i][1]);
      if (t) parts.push("<p>" + wcEscapeHtml(t) + "</p>");
    }
    out.html = parts.join("");
    return out;
  }
});
