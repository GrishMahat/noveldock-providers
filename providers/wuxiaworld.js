// WuxiaWorld provider (port of the QuickNovel/Kotlin WuxiaWorldProvider).
//
// All list/novel/chapter data goes through the site's gRPC-Web API
// (protobuf over HTTP/2), while chapter content is plain HTML. The Kotlin
// port uses app-level "grpcPost" helpers; here the same requests are built
// with protoEncode/grpcWebFrame/grpcWebFrames from provider_helpers.js.
//
// Request flow:
//  - search/browse:   POST api2.wuxiaworld.com/...Novels/SearchNovels
//  - chapters:        POST api2.wuxiaworld.com/...Chapters/GetChapterList
//  - novel info:      GET  wuxiaworld.com/novel/<slug>  (React Query state)
//  - chapter content: GET  wuxiaworld.com/novel/<slug>/<chSlug>
//
// Contract notes:
//  - searchConfig(query, page) returns {url, headers, body}, a raw binary
//    gRPC-Web frame. The app POSTs it as bytes and feeds the response byte
//    list to parseSearchResults (the engine's binary POST path).
//  - browseConfig(mode, filters) is the same shape for browse/latest.
//  - chaptersApiConfig(bookId, page) mirrors allnovel's single-request
//    convention; page 0 returns the config, later pages return null.
//  - parseNovelInfo caches the numeric novel id + slug in module state;
//    chaptersApiConfig builds its request from those (bookId arg is the
//    app's slug-derived id and is ignored, like AllNovel).

var baseUrl = "https://www.wuxiaworld.com";
var apiUrl = "https://api2.wuxiaworld.com/wuxiaworld.api.v2";
var searchNovelsUrl = apiUrl + ".Novels/SearchNovels";
var getChapterListUrl = apiUrl + ".Chapters/GetChapterList";

var wwStatus = ["All", "Finished", "Active", "Hiatus"];
var wwStatusValue = [-1, 0, 1, 2];
var wwSort = ["Popular", "New", "Chapters", "Name", "Rating", "Trending"];
var wwSortValue = [1, 2, 3, 4, 6, 7];
var wwGenres = [
  "All", "Romance", "Fantasy", "Comedy", "Mystery", "Thriller",
  "Sci-fi", "Cultivation", "Cheat Systems", "LitRPG", "Sports", "Slice of Life",
];

var moduleNovelId = null;
var moduleSlug = null;

function grpcHeaders() {
  return {
    "Content-Type": "application/grpc-web+proto",
    "Accept": "application/grpc-web+proto",
    "X-User-Agent": "grpc-web-javascript/0.1",
    "x-grpc-web": "1",
  };
}

// Mirror of Kotlin buildARequestBody.
function searchRequest(title, status, sortType, sortDirection, count, genres) {
  var pairs = [];
  if (title != null && title !== "") pairs.push([1, [[1, title]]]);
  pairs.push([3, status === undefined || status === null ? -1 : status]);
  pairs.push([4, sortType === undefined || sortType === null ? 1 : sortType]);
  pairs.push([5, sortDirection === undefined ? 1 : sortDirection]);
  pairs.push([7, count === undefined ? 500 : count]);
  if (genres && genres.length) {
    var inner = [];
    for (var i = 0; i < genres.length; i++) inner.push([1, genres[i]]);
    inner.push([2, 1]);
    pairs.push([10, inner]);
  }
  return grpcWebFrame(protoEncode(pairs));
}

// Decode SearchNovels response bytes → [{title, url, cover}].
function decodeNovels(bytes) {
  var novels = [];
  grpcWebFrames(bytes, function(frame) {
    var reader = protoReader(frame);
    while (!reader.exhausted()) {
      var tag = reader.readVarint();
      var field = tag >>> 3;
      var wire = tag & 7;
      if (field === 1) {
        var item = reader.enter();
        var name = "";
        var slug = "";
        var cover = "";
        while (!item.exhausted()) {
          var itemTag = item.readVarint();
          var itemField = itemTag >>> 3;
          var itemWire = itemTag & 7;
          if (itemField === 2) name = item.readString();
          else if (itemField === 3) slug = item.readString();
          else if (itemField === 10) {
            var coverMsg = item.enter();
            while (!coverMsg.exhausted()) {
              var coverTag = coverMsg.readVarint();
              if ((coverTag >>> 3) === 1) cover = coverMsg.readString();
              else skipField(coverMsg, coverTag & 7);
            }
          } else skipField(item, itemWire);
        }
        if (name !== "" && slug !== "") {
          novels.push({
            title: name,
            url: baseUrl + "/novel/" + slug,
            cover: cover || null,
          });
        }
      } else skipField(reader, wire);
    }
  });
  return novels;
}

function skipField(reader, wireType) {
  if (wireType === 0) {
    reader.readVarint();
  } else if (wireType === 1) {
    reader.readBytes(8);
  } else if (wireType === 2) {
    var len = reader.readVarint();
    reader.readBytes(len);
  } else if (wireType === 5) {
    reader.readBytes(4);
  } else {
    throw new Error("Unknown wire type " + wireType);
  }
}

// The novel page embeds React Query state with the full novel object.
// Returns the novel JSON object or null.
function extractNovelItem(html) {
  var marker = "__REACT_QUERY_STATE__ = ";
  var idx = html.indexOf(marker);
  if (idx === -1) return null;
  var start = idx + marker.length;
  var jsonEnd = html.indexOf("window.__APP_CONTEXT__", start);
  var raw;
  if (jsonEnd === -1) {
    var scriptEnd = html.indexOf("</script>", start);
    if (scriptEnd === -1) return null;
    raw = html.substring(start, scriptEnd);
  } else {
    raw = html.substring(start, jsonEnd);
  }
  raw = raw.trim();
  if (raw.endsWith(";")) raw = raw.slice(0, -1);
  var state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  var queries = state && state.queries;
  if (!(queries instanceof Array)) return null;
  for (var i = 0; i < queries.length; i++) {
    var query = queries[i];
    var key = query && query.queryKey;
    if (!(key instanceof Array) || key[0] !== "novel") continue;
    var data = query.state && query.state.data;
    if (data == null) continue;
    // The state.data may be the parsed object or a JSON string.
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        continue;
      }
    }
    var item = data && data.item;
    if (item && typeof item === "object" && item.id != null) return item;
  }
  return null;
}

register({  id: "wuxiaworld",
  name: "WuxiaWorld",
  lang: "en",
  baseUrl: baseUrl,
  version: "1.0.0",

  // gRPC listing supports the full filter set, so search stays filter-free.
  flags: { searchFilters: false },

  filters: [
    { type: "select", id: "status", name: "Status", options: wwStatus, defaultIndex: 0 },
    { type: "sort", id: "sort", name: "Sort by", options: wwSort, defaultIndex: 0 },
    { type: "select", id: "genre", name: "Genre", options: wwGenres, defaultIndex: 0 },
  ],

  // Browse/latest via POST gRPC (the site has no browsable GET list).
  browseConfig: function(mode, filters) {
    var f = filters || {};
    var status = -1;
    var sortType = 1;
    if (mode === "latest") sortType = 2; // New
    if (typeof f.status === "number" && f.status >= 0 && f.status < wwStatusValue.length) {
      status = wwStatusValue[f.status];
    }
    if (f.sort instanceof Array && f.sort.length >= 1 && typeof f.sort[0] === "number") {
      var s = f.sort[0];
      if (s >= 0 && s < wwSortValue.length) sortType = wwSortValue[s];
    }
    var genres = null;
    if (typeof f.genre === "number" && f.genre > 0 && f.genre < wwGenres.length) {
      genres = [wwGenres[f.genre]];
    }
    return {
      url: searchNovelsUrl,
      headers: grpcHeaders(),
      body: searchRequest(null, status, sortType, 1, 500, genres),
    };
  },

  // Search via POST gRPC; the query is baked into the proto payload.
  searchConfig: function(query, page) {
    return {
      url: searchNovelsUrl,
      headers: grpcHeaders(),
      body: searchRequest(query, -1, 1, 1, 20, null),
    };
  },

  searchResults: function(data) {
    // Binary POST path: data is a byte array. HTML path (defensive): empty.
    if (typeof data === "string" || !(data instanceof Array)) {
      return { results: [], hasNextPage: false };
    }
    return {
      results: decodeNovels(data),
      hasNextPage: false,
    };
  },

  // Identity: the browse results are already absolute novel URLs.
  searchUrl: function(query, page, filters) {
    return null;
  },

  novelInfoUrl: function(novelUrl) {
    return novelUrl;
  },

  novelInfo: function(html) {
    var item = extractNovelItem(html);
    if (item == null) return null;

    moduleNovelId = item.id;
    moduleSlug = item.slug;

    var statusText = "ongoing";
    if (item.status === 0) statusText = "completed";
    else if (item.status === 2) statusText = "hiatus";

    var genres = [];
    if (item.genres instanceof Array) {
      for (var i = 0; i < item.genres.length; i++) {
        if (typeof item.genres[i] === "string") genres.push(item.genres[i]);
      }
    }

    var synopsis = textOf(
      (item.synopsis && item.synopsis.value) ||
        (item.description && item.description.value) ||
        ""
    );

    return {
      title: item.name || "",
      author: item.authorName && item.authorName.value || "",
      cover: item.coverUrl && item.coverUrl.value || "",
      status: statusText,
      genres: genres,
      description: synopsis,
      chapters: [],
    };
  },

  // Single gRPC request returns every free chapter (like the Kotlin port).
  chaptersApiConfig: function(bookId, page) {
    if (page > 0 || moduleNovelId == null) return null;
    return {
      url: getChapterListUrl,
      headers: grpcHeaders(),
      body: grpcWebFrame(protoEncode([[1, moduleNovelId]])),
    };
  },

  chapterList: function(data) {
    if (typeof data === "string" || !(data instanceof Array)) return [];
    var chapters = [];
    grpcWebFrames(data, function(frame) {
      var reader = protoReader(frame);
      while (!reader.exhausted()) {
        var tag = reader.readVarint();
        var field = tag >>> 3;
        var wire = tag & 7;
        if (field === 1) {
          var group = reader.enter();
          while (!group.exhausted()) {
            var groupTag = group.readVarint();
            var groupField = groupTag >>> 3;
            var groupWire = groupTag & 7;
            if (groupField === 6) {
              var ch = group.enter();
              var name = "";
              var chSlug = "";
              var isFree = false;
              while (!ch.exhausted()) {
                var chTag = ch.readVarint();
                var chField = chTag >>> 3;
                var chWire = chTag & 7;
                if (chField === 2) name = ch.readString();
                else if (chField === 3) chSlug = ch.readString();
                else if (chField === 20) {
                  var access = ch.enter();
                  while (!access.exhausted()) {
                    var accTag = access.readVarint();
                    if ((accTag >>> 3) === 1) isFree = access.readVarint() === 1;
                    else skipField(access, accTag & 7);
                  }
                } else skipField(ch, chWire);
              }
              if (name !== "" && isFree && moduleSlug != null && chSlug !== "") {
                chapters.push({
                  name: name,
                  url: baseUrl + "/novel/" + moduleSlug + "/" + chSlug,
                });
              }
            } else skipField(group, groupWire);
          }
        } else skipField(reader, wire);
      }
    });
    return chapters;
  },

  chapterContentUrl: function(chapterUrl) {
    return chapterUrl;
  },

  chapterContent: function(html) {
    var openRe = /<div[^>]*class="[^"]*chapter-content[^"]*"[^>]*>/;
    var openMatch = openRe.exec(html);
    if (!openMatch) return { html: "", images: [] };
    var start = openMatch.index + openMatch[0].length;
    // Find the matching closing </div> by tracking nested divs.
    var depth = 1;
    var end = html.length;
    var tagRe = /<div\b[\s\S]*?>|<\/div>/g;
    tagRe.lastIndex = start;
    var m;
    while ((m = tagRe.exec(html)) !== null) {
      if (m[0] === "</div>") {
        depth--;
        if (depth === 0) {
          end = m.index;
          break;
        }
      } else {
        depth++;
      }
    }
    var content = html.substring(start, end);

    var images = [];
    var imgRe = /<img[^>]*src="([^"]*)"/g;
    while ((m = imgRe.exec(content)) !== null) {
      var src = absUrl(baseUrl, m[1]);
      images.push(src);
    }
    content = content.replace(/<img[^>]*>/g, "");
    content = content.replace(/\s+/g, " ").trim();

    return { html: content, images: images };
  },
});