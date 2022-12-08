// consts.ts
var APP_CACHE = "app-v1";

// serviceWorkers/index.ts
var sw = globalThis.self;
var ROOT_DOC = sw.location.origin + "/";
var CONFIG_URL = ROOT_DOC + "__sw-config__.json";
var config = {
  log: true,
  savedAt: -1
};
var CACHE = caches.open(APP_CACHE).then(async (cache) => {
  const file = await cache.match(CONFIG_URL);
  if (!file) {
    persistConfig(Promise.resolve(cache));
    return cache;
  }
  const parsed = await file.json();
  config.log = parsed.log ?? true;
  config.savedAt = parsed.savedAt || -1;
  return cache;
});
var persistConfig = async (cache) => {
  config.savedAt = Date.now();
  return (await cache).put(
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
  if (!config.log || forceMsg) {
    return msgAll("info", msg, id);
  }
};
var errorMsg = (msg, id = "all") => msgAll("error", msg, id);
sw.oninstall = (event) => event.waitUntil(sw.skipWaiting());
sw.onactivate = (event) => {
  event.waitUntil((async () => {
    await sw.clients.claim();
    infoMsg("{\u{1F4E5} install} new script installed", "all", true);
    infoMsg(`{\u{1F525} activate} new script in control, started with args: silent_log=${config.log}`, "all", true);
  })());
};
var networkErr = (err) => {
  return new Response("", {
    status: 500,
    statusText: "Internal Server Error",
    headers: { "Sw-Net-Err": String(err) || "1" }
  });
};
var networkFirst = async (event) => {
  try {
    const res = await fetch(event.request);
    return res;
  } catch (err) {
    const cached = await (await CACHE).match(event.request);
    if (!cached || !cached.ok) {
      return networkErr(err);
    }
    return cached;
  }
};
var cacheFirst = async (event) => {
  const cached = await (await CACHE).match(event.request);
  if (cached && cached.ok) {
    return cached;
  }
  try {
    return await fetch(event.request);
  } catch (err) {
    return networkErr(err);
  }
};
sw.onfetch = (event) => {
  const isRoot = event.request.url === ROOT_DOC;
  if (isRoot) {
    event.respondWith(networkFirst(event));
  } else {
    event.respondWith(cacheFirst(event));
  }
};
var swAction = {
  "config:silent_logs": () => {
    config.log = true;
  },
  "config:verbose_logs": () => {
    config.log = false;
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
sw.onmessage = async (msg) => {
  const d = msg.data;
  const id = msg.source.id;
  if (!swAction[d?.action]) {
    errorMsg(
      `received incorrectly encoded message ${msg.data}`,
      id
    );
    return;
  }
  await swAction[d.action](id);
  if (d.action.startsWith("config:")) {
    persistConfig(CACHE);
    infoMsg(`persisted new config @ ${CONFIG_URL}`);
  }
};
