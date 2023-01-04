"use strict";
(() => {
  // src/config.ts
  var APP_CACHE = "app-v1";

  // src/lib/shabah/backend.ts
  var rootDocumentFallBackUrl = (origin) => `${removeSlashAtEnd(origin)}/offline.html`;
  var serviceWorkerCacheHitHeader = {
    key: "X-Cache-Hit",
    value: "SW HIT"
  };
  var serviceWorkerErrorCatchHeader = "Sw-Net-Err";
  var serviceWorkerPolicyHeader = "Sw-Policy";
  var NETWORK_FIRST_POLICY = 1;
  var NETWORK_ONLY_POLICY = 2;
  var CACHE_FIRST_POLICY = 3;
  var CACHE_ONLY_POLICY = 4;
  var serviceWorkerPolicies = {
    networkOnly: { "Sw-Policy": NETWORK_ONLY_POLICY.toString() },
    networkFirst: { "Sw-Policy": NETWORK_FIRST_POLICY.toString() },
    cacheFirst: { "Sw-Policy": CACHE_FIRST_POLICY.toString() },
    cacheOnly: { "Sw-Policy": CACHE_ONLY_POLICY.toString() }
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
  var operationCodes = {
    updatedExisting: 0,
    createdNew: 1,
    notFound: 2,
    removed: 3,
    saved: 4
  };
  var errDownloadIndexUrl = (storageRootUrl) => `${removeSlashAtEnd(storageRootUrl)}/__err-download-index__.json`;
  var isRelativeUrl = (url) => !url.startsWith("http://") && !url.startsWith("https://");
  var saveErrorDownloadIndex = async (storageRootUrl, index, fileCache2) => {
    if (isRelativeUrl(storageRootUrl)) {
      throw new Error("error download indices storage url must be a full url and not a relative one. Got " + storageRootUrl);
    }
    const url = errDownloadIndexUrl(storageRootUrl);
    const text = JSON.stringify(index);
    const response = new Response(text, { status: 200, statusText: "OK" });
    await fileCache2.putFile(url, response);
    return operationCodes.saved;
  };
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

  // src/lib/shabah/serviceWorker/backgroundFetchHandler.ts
  var makeBackgroundFetchHandler = (options) => {
    const { fileCache: fileCache2, origin, log, type: eventType } = options;
    return async (event) => {
      const eventName = `[\u{1F415}\u200D\u{1F9BA} bg-fetch ${eventType}]`;
      const bgfetch = event.registration;
      log(eventName, "registration:", bgfetch);
      const targetId = bgfetch.id;
      const fetchedResources = await bgfetch.matchAll();
      log(
        eventName,
        "resources downloaded",
        fetchedResources.map((r) => r.request.url)
      );
      if (fetchedResources.length < 0) {
        return;
      }
      const [downloadIndices, cargoIndices] = await Promise.all([
        getDownloadIndices(origin, fileCache2),
        getCargoIndices(origin, fileCache2)
      ]);
      const downloadIndexPosition = downloadIndices.downloads.findIndex(({ id: id2 }) => id2 === targetId);
      const cargoIndexPosition = cargoIndices.cargos.findIndex((cargo) => cargo.id === targetId);
      log(
        eventName,
        `found: cargo=${cargoIndexPosition > -1}, download=${downloadIndexPosition > -1}`
      );
      if (downloadIndexPosition < 0 || cargoIndexPosition < 0) {
        return;
      }
      const targetDownloadIndex = downloadIndices.downloads[downloadIndexPosition];
      const { map: urlMap, title: updateTitle, id } = targetDownloadIndex;
      const len = fetchedResources.length;
      log(eventName, "processing download for pkg", id);
      const maxFileProcessed = 30;
      let start = 0;
      let end = Math.min(len, maxFileProcessed);
      let resourcesProcessed = 0;
      let failedResources = 0;
      const errorDownloadIndex = {
        ...targetDownloadIndex,
        map: {},
        bytes: 0,
        startedAt: Date.now()
      };
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
              return log(
                eventName,
                `orphaned resource found url=${targetUrl}, couldn't map to resource`
              );
            }
            resourcesProcessed++;
            const { storageUrl, bytes, mime } = targetResource;
            if (!response.ok) {
              errorDownloadIndex.map[targetUrl] = {
                ...targetResource,
                status: response.status,
                statusText: response.statusText || "UNKNOWN STATUS"
              };
              failedResources++;
              errorDownloadIndex.bytes += bytes;
              return;
            }
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
      log(
        eventName,
        `processed ${resourcesProcessed} out of ${len}. orphan_count=${len - resourcesProcessed}, fail_count=${failedResources}`
      );
      removeDownloadIndex(downloadIndices, targetId);
      updateCargoIndex(cargoIndices, {
        ...cargoIndices.cargos[cargoIndexPosition],
        state: ((event2) => {
          switch (event2) {
            case "abort":
              return "update-aborted";
            case "fail":
              return "update-failed";
            case "success":
            default:
              return "cached";
          }
        })(eventType)
      });
      await Promise.all([
        saveCargoIndices(cargoIndices, origin, fileCache2),
        saveDownloadIndices(downloadIndices, origin, fileCache2)
      ]);
      if (eventType === "abort" || eventType === "fail") {
        const { storageRootUrl } = targetDownloadIndex;
        let targetUrl = storageRootUrl;
        if (!targetUrl.startsWith("https://") && !targetUrl.startsWith("http://")) {
          const base = removeSlashAtEnd(origin);
          const extension = ((str) => {
            if (str.startsWith("./")) {
              return str.slice(2);
            } else if (str.startsWith("/")) {
              return str.slice(1);
            } else {
              return str;
            }
          })(targetUrl);
          targetUrl = `${base}/${extension}`;
          log(
            eventName,
            `detected storage root url as a relative url - full url is required. Adding origin to url original=${storageRootUrl}, new=${targetUrl}`
          );
        }
        await saveErrorDownloadIndex(
          targetUrl,
          errorDownloadIndex,
          fileCache2
        );
        log(eventName, "successfully saved error log");
      }
      log(eventName, "successfully persisted changes");
      if ((eventType === "fail" || eventType === "success") && event.updateUI) {
        const suffix = eventType === "fail" ? "failed" : "finished";
        await event.updateUI({
          title: `${updateTitle} ${suffix}!`
        });
      }
    };
  };

  // src/lib/shabah/serviceWorker/fetchHandler.ts
  var CACHE_HIT_HEADER = serviceWorkerCacheHitHeader.key;
  var CACHE_HIT_VALUE = serviceWorkerCacheHitHeader.value;
  var CACHE_FIRST = serviceWorkerPolicies.cacheFirst["Sw-Policy"];
  var errorResponse = (err) => new Response("", {
    status: 500,
    statusText: "Internal Server Error",
    headers: {
      [serviceWorkerErrorCatchHeader]: String(err) || "1"
    }
  });
  var NOT_FOUND_RESPONSE = new Response("not in cache", {
    status: 404,
    statusText: "NOT FOUND"
  });
  var makeFetchHandler = (options) => {
    const { origin, fileCache: fileCache2, fetchFile, log } = options;
    const rootDoc = origin.endsWith("/") ? origin : origin + "/";
    const rootDocFallback = rootDocumentFallBackUrl(origin);
    return async (event) => {
      const { request } = event;
      log(`incoming request (mode=${request.mode}) from: ${request.referrer}`);
      const strippedQuery = request.url.split("?")[0];
      const isRootDocument = strippedQuery === rootDoc;
      if (isRootDocument) {
        try {
          const res = await fetchFile(request);
          log(`requesting root document (network-first): url=${request.url}, status=${res.status}`);
          return res;
        } catch (err) {
          const cached = await fileCache2.getFile(rootDocFallback);
          log(`root doc request failed: fallback_url=${rootDocFallback}, network_err=true, status=${cached?.status || "none"}, status_text=${cached?.statusText || "none"}`);
          if (cached && cached.ok) {
            cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
            return cached;
          }
          return errorResponse(err);
        }
      }
      const isRootFallback = strippedQuery === rootDocFallback;
      if (isRootFallback) {
        const cached = await fileCache2.getFile(rootDocFallback);
        log(`requesting root document fallback (cache-only): url=${request.url}, exists=${!!cached}, status=${cached?.status || "none"}`);
        if (cached && cached.ok) {
          cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
          return cached;
        }
        return NOT_FOUND_RESPONSE;
      }
      const policyHeader = request.headers.get(serviceWorkerPolicyHeader) || CACHE_FIRST;
      const policy = parseInt(policyHeader, 10);
      switch (policy) {
        case NETWORK_FIRST_POLICY: {
          try {
            const res = await fetchFile(request);
            log(`incoming request (network-first): url=${request.url}, status=${res.status}`);
            return res;
          } catch (err) {
            const cached = await fileCache2.getFile(request.url);
            const validCachedDoc = cached && cached.ok;
            log(`incoming request (network-first): url=${request.url}, network_err=true, cache_fallback=${validCachedDoc}`);
            if (cached && cached.ok) {
              cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
              return cached;
            }
            return errorResponse(err);
          }
        }
        case NETWORK_ONLY_POLICY: {
          log(`incoming request (network-only): url=${event.request.url}`);
          return fetchFile(request);
        }
        case CACHE_ONLY_POLICY: {
          const cached = await fileCache2.getFile(request.url);
          log(`incoming request (cache-only): url=${request.url}, found=${!!cached}, status=${cached?.status || "none"}`);
          if (cached && cached.ok) {
            cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
            return cached;
          }
          return NOT_FOUND_RESPONSE;
        }
        case CACHE_FIRST_POLICY:
        default: {
          const cached = await fileCache2.getFile(request.url);
          log(`incoming request (cache-first): url=${request.url}, cache_hit=${!!cached}, status=${cached?.status || "none"}`);
          if (cached && cached.ok) {
            cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE);
            return cached;
          }
          return fetchFile(event.request);
        }
      }
    };
  };

  // src/lib/shabah/adaptors/fileCache/webCache.ts
  var webCacheFileCache = (cacheName) => {
    const cache = {
      getFile: async (url) => {
        const targetCache = await caches.open(cacheName);
        const res = await targetCache.match(url);
        return res || null;
      },
      putFile: async (url, file) => {
        const targetCache = await caches.open(cacheName);
        await targetCache.put(url, file);
        return true;
      },
      deleteFile: async (url) => {
        const targetCache = await caches.open(cacheName);
        return targetCache.delete(url);
      },
      listFiles: async () => {
        const targetCache = await caches.open(cacheName);
        return await targetCache.keys();
      },
      deleteAllFiles: async () => await caches.delete(cacheName),
      queryUsage: async () => {
        const { quota = 0, usage = 0 } = await navigator.storage.estimate();
        return { quota, usage };
      },
      isPersisted: async () => await navigator.storage.persisted(),
      requestPersistence: async () => await navigator.storage.persist()
    };
    return cache;
  };

  // serviceWorkers/index.ts
  var sw = globalThis.self;
  var CONFIG_URL = `${sw.location.origin}/__sw-config__.json`;
  var config = {
    version: 1,
    log: true,
    updatedAt: -1,
    createdAt: Date.now()
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
    config.updatedAt = Date.now();
    return cache.put(
      CONFIG_URL,
      new Response(JSON.stringify(config), { status: 200 })
    );
  };
  sw.oninstall = (event) => event.waitUntil(sw.skipWaiting());
  sw.onactivate = (event) => {
    event.waitUntil((async () => {
      await sw.clients.claim();
      console.info("[\u{1F4E5} install] new service-worker installed");
      console.info(`[\u{1F525} activate] new sevice worker in control, started with config`, config);
    })());
  };
  var fileCache = webCacheFileCache(APP_CACHE);
  var logger = (...msgs) => {
    if (config.log) {
      console.info(...msgs);
    }
  };
  var fetchHandler = makeFetchHandler({
    fileCache,
    origin: sw.location.origin,
    fetchFile: fetch,
    log: logger
  });
  sw.onfetch = (event) => event.respondWith(fetchHandler(event));
  var bgFetchSuccessHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "success"
  });
  sw.onbackgroundfetchsuccess = (event) => event.waitUntil(bgFetchSuccessHandle(event));
  sw.onbackgroundfetchclick = () => sw.clients.openWindow("/");
  var bgFetchAbortHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "abort"
  });
  sw.onbackgroundfetchabort = (event) => event.waitUntil(bgFetchAbortHandle(event));
  var bgFetchFailHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "fail"
  });
  sw.onbackgroundfetchfail = (event) => event.waitUntil(bgFetchFailHandle(event));
  var swAction = {
    "config:silent_logs": () => {
      config.log = false;
    },
    "config:verbose_logs": () => {
      config.log = true;
    },
    "list:connected_clients": async (id) => {
      const clients = await sw.clients.matchAll();
      console.info(
        `connected clients (${clients.length}): ${clients.map((c) => {
          return `(id=${c.id || "unknown"}, url=${c.url}, type=${c.type})
`;
        }).join(",")}`
      );
    },
    "list:config": (id) => {
      console.info("config:", config);
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
