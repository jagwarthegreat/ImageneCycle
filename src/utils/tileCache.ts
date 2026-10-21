import L from 'leaflet';

const CACHE_NAME = 'magene-c706-tiles-v1';

/**
 * Custom Leaflet TileLayer that caches map raster tiles in the browser's CacheStorage API.
 * Ensures smooth performance and offline map availability during outdoor rides with intermittent coverage.
 */
export class CachedTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.setAttribute('role', 'presentation');
    tile.alt = '';

    const url = this.getTileUrl(coords);

    // If browser supports CacheStorage, check cache first
    if (typeof caches !== 'undefined') {
      caches.open(CACHE_NAME)
        .then(cache => {
          return cache.match(url).then(cachedResponse => {
            if (cachedResponse) {
              // Tile found in cache! Serve from local blob without network latency
              return cachedResponse.blob().then(blob => {
                const objectUrl = URL.createObjectURL(blob);
                tile.onload = () => {
                  URL.revokeObjectURL(objectUrl);
                  done(undefined, tile);
                };
                tile.onerror = () => {
                  URL.revokeObjectURL(objectUrl);
                  done(new Error('Cached tile load error'), tile);
                };
                tile.src = objectUrl;
              });
            } else {
              // Not cached yet: fetch, store in cache for offline use, and display
              return fetch(url, { mode: 'cors' })
                .then(response => {
                  if (response.ok) {
                    // Clone response to put into cache
                    cache.put(url, response.clone()).catch(() => {});
                    return response.blob();
                  }
                  throw new Error('Tile network error: ' + response.status);
                })
                .then(blob => {
                  const objectUrl = URL.createObjectURL(blob);
                  tile.onload = () => {
                    URL.revokeObjectURL(objectUrl);
                    done(undefined, tile);
                  };
                  tile.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    done(new Error('Tile blob error'), tile);
                  };
                  tile.src = objectUrl;
                })
                .catch(() => {
                  // Network unavailable or offline: fallback to standard img loading
                  tile.src = url;
                  tile.onload = () => done(undefined, tile);
                  tile.onerror = (e) => done(e as any, tile);
                });
            }
          });
        })
        .catch(() => {
          // CacheStorage failed, fallback to direct tile URL
          tile.src = url;
          tile.onload = () => done(undefined, tile);
          tile.onerror = (e) => done(e as any, tile);
        });
    } else {
      tile.src = url;
      tile.onload = () => done(undefined, tile);
      tile.onerror = (e) => done(e as any, tile);
    }

    return tile;
  }
}

export function createCachedTileLayer(url: string, options?: L.TileLayerOptions): CachedTileLayer {
  return new CachedTileLayer(url, options);
}
