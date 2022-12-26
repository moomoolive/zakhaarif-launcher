"use strict";
(() => {
  // consts.ts
  var APP_CACHE = "app-v1";

  // shabah/shared.ts
  var serviceWorkerCacheHitHeader = {
    key: "X-Cache-Hit",
    value: "SW HIT"
  };
  var serviceWorkerErrorCatchHeader = "Sw-Net-Err";
  var serviceWorkerPolicyHeader = "Sw-Policy";
  var serviceWorkerPolicies = {
    networkOnly: { "Sw-Policy": "network-only" },
    networkFirst: { "Sw-Policy": "network-first" },
    cacheFirst: { "Sw-Policy": "cache-first" }
  };
  var headers = (mimeType, contentLength) => ({
    "Last-Modified": new Date().toUTCString(),
    "Sw-Source": "shabah",
    "Content-Length": contentLength.toString(),
    "Content-Type": mimeType
  });
  var removeSlashAtEnd = (str) => str.endsWith("/") ? str.slice(0, -1) : str;
  var downloadIncidesUrl = (origin) => `${removeSlashAtEnd(origin)}/__download-indices__.json`;
  var cargoIndicesUrl = (origin) => `${removeSlashAtEnd(origin)}/__cargo-indices__.json`;
  var emptyDownloadIndex = () => ({
    downloads: [],
    totalBytes: 0,
    version: 1,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    savedAt: Date.now()
  });
  var getDownloadIndices = async (origin, fileCache2) => {
    const url = downloadIncidesUrl(origin);
    const cacheRes = await fileCache2.getFile(url);
    if (!cacheRes || !cacheRes.ok) {
      return emptyDownloadIndex();
    }
    try {
      return await cacheRes.json();
    } catch {
      return emptyDownloadIndex();
    }
  };
  var operationCodes = {
    updatedExisting: 0,
    createdNew: 1,
    notFound: 2,
    removed: 3,
    saved: 4
  };
  var removeDownloadIndex = (indices, targetId) => {
    const targetIndex = indices.downloads.findIndex((download) => download.id === targetId);
    if (targetIndex < 0) {
      return operationCodes.notFound;
    }
    const target = indices.downloads[targetIndex];
    indices.totalBytes -= target.bytes;
    indices.downloads.splice(targetIndex, 1);
    return operationCodes.removed;
  };
  var saveDownloadIndices = async (indices, origin, cache) => {
    indices.savedAt = Date.now();
    const text = JSON.stringify(indices);
    const url = downloadIncidesUrl(origin);
    await cache.putFile(url, new Response(text, {
      status: 200,
      statusText: "OK",
      headers: headers("application/json", stringBytes(text))
    }));
    return operationCodes.saved;
  };
  var emptyCargoIndices = () => ({
    cargos: [],
    updatedAt: Date.now(),
    createdAt: Date.now(),
    savedAt: Date.now(),
    version: 1
  });
  var getCargoIndices = async (origin, fileCache2) => {
    const url = cargoIndicesUrl(origin);
    const cacheRes = await fileCache2.getFile(url);
    if (!cacheRes || !cacheRes.ok) {
      return emptyCargoIndices();
    }
    try {
      return await cacheRes.json();
    } catch {
      return emptyCargoIndices();
    }
  };
  var updateCargoIndex = (indices, target) => {
    const updatedAt = Date.now();
    indices.updatedAt = updatedAt;
    const existingIndex = indices.cargos.findIndex((cargo) => cargo.id === target.id);
    if (existingIndex < 0) {
      indices.cargos.push({ ...target, updatedAt, createdAt: updatedAt });
      return operationCodes.createdNew;
    }
    const previousIndex = indices.cargos[existingIndex];
    const updatedIndex = {
      ...previousIndex,
      ...target,
      updatedAt
    };
    indices.cargos[existingIndex] = updatedIndex;
    return operationCodes.updatedExisting;
  };
  var stringBytes = (str) => new TextEncoder().encode(str).length;
  var saveCargoIndices = async (indices, origin, cache) => {
    indices.savedAt = Date.now();
    const text = JSON.stringify(indices);
    const url = cargoIndicesUrl(origin);
    await cache.putFile(url, new Response(text, {
      status: 200,
      statusText: "OK",
      headers: headers("application/json", stringBytes(text))
    }));
    return operationCodes.saved;
  };

  // serviceWorkers/handlers.ts
  var CACHE_HIT_HEADER = serviceWorkerCacheHitHeader.key;
  var CACHE_HIT_VALUE = serviceWorkerCacheHitHeader.value;
  var NETWORK_ONLY = serviceWorkerPolicies.networkOnly["Sw-Policy"];
  var NETWORK_FIRST = serviceWorkerPolicies.networkFirst["Sw-Policy"];
  var makeFetchHandler = (options) => {
    const { rootDoc, cache, fetchFile, log } = options;
    return async (event) => {
      const { request } = event;
      const policy = request.headers.get(serviceWorkerPolicyHeader);
      if (policy === NETWORK_ONLY) {
        log(`incoming request (network-only): url=${event.request.url}`);
        return fetchFile(request);
      }
      if (policy === NETWORK_FIRST || request.url === rootDoc) {
        try {
          const res = await fetchFile(event.request);
          log(`incoming request (network-first): url=${event.request.url}, status=${res.status}`);
          return res;
        } catch (err) {
          const cached2 = await cache.getFile(event.request.url);
          const validCachedDoc = cached2 && cached2.ok;
          log(`incoming request (network-first): url=${event.request.url}, network_err=true, cache_fallback=${validCachedDoc}`);
          if (cached2 && cached2.ok) {
            cached2.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
            return cached2;
          }
          return new Response("", {
            status: 500,
            statusText: "Internal Server Error",
            headers: {
              [serviceWorkerErrorCatchHeader]: String(err) || "1"
            }
          });
        }
      }
      const cached = await cache.getFile(event.request.url);
      log(`incoming request (cache-first): url=${event.request.url}, cache_hit=${!!cached}, status=${cached?.status || "none"}`);
      if (cached && cached.ok) {
        cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
        return cached;
      }
      return fetchFile(event.request);
    };
  };
  var makeBackgroundFetchSuccessHandler = (options) => {
    const { fileCache: fileCache2, origin, log } = options;
    return async (event) => {
      const bgfetch = event.registration;
      log("bg-fetch registration:", bgfetch);
      if (!bgfetch.recordsAvailable || bgfetch.result !== "success") {
        return;
      }
      const targetId = bgfetch.id;
      const fetchedResources = await bgfetch.matchAll();
      log(
        "bg-fetch resources downloaded",
        fetchedResources.map((r) => r.request.url)
      );
      if (fetchedResources.length < 0) {
        return;
      }
      const [downloadIndices, cargoIndices] = await Promise.all([
        getDownloadIndices(origin, fileCache2),
        getCargoIndices(origin, fileCache2)
      ]);
      const downloadIndexPosition = downloadIndices.downloads.findIndex(({ id }) => id === targetId);
      const cargoIndexPosition = cargoIndices.cargos.findIndex((cargo) => cargo.id === targetId);
      log(`bg-fetch found: cargo=${cargoIndexPosition > -1}, download=${downloadIndexPosition > -1}`);
      if (downloadIndexPosition < 0 || cargoIndexPosition < 0) {
        return;
      }
      const { map: urlMap, title: updateTitle } = downloadIndices.downloads[downloadIndexPosition];
      const len = fetchedResources.length;
      const maxFileProcessed = 30;
      let start = 0;
      let end = Math.min(len, maxFileProcessed);
      let resourcesProcessed = 0;
      while (start < len) {
        const promises = [];
        for (let i = start; i < end; i++) {
          const resource = fetchedResources[i];
          promises.push((async () => {
            const response = await resource.responseReady;
            const targetUrl = ((url) => {
              if (url.startsWith("https://") || url.startsWith("http://")) {
                return url;
              }
              const extension = url.startsWith("/") ? url : "/" + url;
              return `${removeSlashAtEnd(origin)}/${extension}`;
            })(resource.request.url);
            const targetResource = urlMap[targetUrl];
            if (!targetResource) {
              return log(`bg-fetch orphaned resource found url=${targetUrl}, couldn't map to resource`);
            }
            resourcesProcessed++;
            const { storageUrl, bytes, mime } = targetResource;
            const text = await response.text();
            return fileCache2.putFile(
              storageUrl,
              new Response(text, {
                status: 200,
                statusText: "OK",
                headers: headers(mime, bytes)
              })
            );
          })());
        }
        await Promise.all(promises);
        start += maxFileProcessed;
        end = Math.min(len, end + maxFileProcessed);
      }
      log(`processed ${resourcesProcessed} out of ${len}. orphan_count=${len - resourcesProcessed}`);
      removeDownloadIndex(downloadIndices, targetId);
      updateCargoIndex(cargoIndices, {
        ...cargoIndices.cargos[cargoIndexPosition],
        state: "cached"
      });
      await Promise.all([
        saveCargoIndices(cargoIndices, origin, fileCache2),
        saveDownloadIndices(downloadIndices, origin, fileCache2)
      ]);
      log("bg-fetch successfully persisted changes");
      await event.updateUI({ title: `${updateTitle} finished!` });
    };
  };

  // serviceWorkers/index.ts
  var sw = globalThis.self;
  var ROOT_DOC = sw.location.origin + "/";
  var CONFIG_URL = ROOT_DOC + "__sw-config__.json";
  var config = {
    version: 1,
    log: true,
    savedAt: -1
  };
  caches.open(APP_CACHE).then(async (cache) => {
    const file = await cache.match(CONFIG_URL);
    if (!file) {
      return persistConfig();
    }
    const parsed = await file.json();
    config = { ...config, ...parsed };
  });
  var persistConfig = async () => {
    const cache = await caches.open(APP_CACHE);
    config.savedAt = Date.now();
    return cache.put(
      CONFIG_URL,
      new Response(JSON.stringify(config), {
        status: 200,
        statusText: "OK"
      })
    );
  };
  var msgAll = async (type, contents, id = "all") => {
    const clients = id === "all" || !id ? await sw.clients.matchAll({}) : ((val) => !val ? [] : [val])(await sw.clients.get(id));
    for (const client of clients) {
      client.postMessage({ type, contents });
    }
  };
  var infoMsg = (msg, id = "all", forceMsg = false) => {
    if (config.log || forceMsg) {
      return msgAll("info", msg, id);
    }
  };
  sw.oninstall = (event) => event.waitUntil(sw.skipWaiting());
  sw.onactivate = (event) => {
    event.waitUntil((async () => {
      await sw.clients.claim();
      console.info("{\u{1F4E5} install} new script installed");
      console.info(`{\u{1F525} activate} new script in control, started with config`, config);
    })());
  };
  var fileCache = {
    getFile: async (url) => {
      const cache = await caches.open(APP_CACHE);
      return await cache.match(url) || null;
    },
    putFile: async (url, file) => {
      const cache = await caches.open(APP_CACHE);
      await cache.put(url, file);
      return true;
    },
    queryUsage: async () => ({ quota: 0, usage: 0 }),
    deleteAllFiles: async () => true,
    deleteFile: async () => true
  };
  var logger = (...msgs) => {
    if (config.log) {
      console.info(...msgs);
    }
  };
  var fetchHandler = makeFetchHandler({
    cache: fileCache,
    rootDoc: ROOT_DOC,
    fetchFile: fetch,
    log: logger
  });
  sw.onfetch = (event) => event.respondWith(fetchHandler(event));
  var bgFetchSuccessHandle = makeBackgroundFetchSuccessHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger
  });
  sw.addEventListener(
    "backgroundfetchsuccess",
    (event) => event.waitUntil(bgFetchSuccessHandle(event))
  );
  sw.addEventListener(
    "backgroundfetchclick",
    () => sw.clients.openWindow("/")
  );
  sw.addEventListener("backgroundfetchabort", () => {
    infoMsg("bg fetch aborted");
  });
  sw.addEventListener("backgroundfetchfailure", () => {
    infoMsg("bg fetch failed");
  });
  var swAction = {
    "config:silent_logs": () => {
      config.log = false;
    },
    "config:verbose_logs": () => {
      config.log = true;
    },
    "list:consts": (id) => {
      infoMsg(
        `listed constants: config_file_url=${CONFIG_URL}, ROOT_DOC=${ROOT_DOC}`,
        id,
        true
      );
    },
    "list:connected_clients": async (id) => {
      const clients = await sw.clients.matchAll();
      infoMsg(
        `connected clients (${clients.length}): ${clients.map((c) => {
          return `(id=${c.id || "unknown"}, url=${c.url}, type=${c.type})
`;
        }).join(",")}`,
        id,
        true
      );
    },
    "list:config": (id) => {
      infoMsg(`config: ${JSON.stringify(config)}`, id, true);
    }
  };
  sw.onmessage = (event) => event.waitUntil((async () => {
    const data = event.data;
    const id = event.source.id;
    if (!swAction[data?.action]) {
      return console.warn(`received incorrectly encoded message ${data} from client ${id}`);
    }
    await swAction[data.action](id);
    if (data.action.startsWith("config:")) {
      persistConfig();
      console.info(`config changed, new config:`, config);
    }
  })());
})();
