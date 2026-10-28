// Defense in depth beside CSP: the worker can fetch only bundled model/runtime GETs.
// The bounded audit contains asset URLs, never samples, transcripts or request bodies.
export function installLocalAssetPolicy(origin: string) {
  const original = globalThis.fetch.bind(globalThis),
    requests: string[] = [],
    expected = new URL(`${origin}/`);
  globalThis.fetch = (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), `${origin}/`);
    if (
      url.protocol !== expected.protocol ||
      url.host !== expected.host ||
      !/^\/(models|runtime)\//.test(url.pathname) ||
      (init?.method ?? request?.method ?? 'GET').toUpperCase() !== 'GET' ||
      init?.body != null ||
      request?.body != null
    )
      return Promise.reject(
        new Error('Only bundled model assets may be fetched'),
      );
    if (requests.length === 40) requests.shift();
    requests.push(url.href);
    return original(input, init);
  };
  return requests;
}
