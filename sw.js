const CACHE_VERSION = 'v2'; // <-- Меняйте эту версию, когда обновляете файлы в APP_SHELL_URLS
const CACHE_NAME = `map-analytics-cache-${CACHE_VERSION}`;

// "Оболочка приложения" - все, что нужно для запуска интерфейса
const APP_SHELL_URLS = [
    '/', // Главная страница
    '/index.html', // Укажите точное имя вашего HTML-файла
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/vanilla-calendar-pro@2.9.6/build/vanilla-calendar.min.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-polylinedecorator@1.6.0/dist/leaflet.polylineDecorator.js',
    'https://cdn.jsdelivr.net/npm/vanilla-calendar-pro@2.9.6/build/vanilla-calendar.min.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    // Добавьте сюда пути к вашим иконкам для манифеста
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Установка Service Worker и кэширование "оболочки"
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('SW: Кэширование оболочки приложения');
                return cache.addAll(APP_SHELL_URLS);
            })
            .then(() => self.skipWaiting()) // Активируем SW сразу, не дожидаясь перезагрузки
    );
});

// Активация Service Worker и очистка старого кэша
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('SW: Удаление старого кэша:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Берем под контроль открытые страницы
    );
});

// Перехват сетевых запросов
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Стратегия "Network First" для данных из Google Sheets
    if (url.href.startsWith('https://script.google.com/macros/s/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Если запрос успешен, кэшируем его и возвращаем
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseToCache);
                    });
                    return response;
                })
                .catch(() => {
                    // Если сети нет, пытаемся отдать из кэша
                    console.log('SW: Сеть недоступна, отдаем данные из кэша');
                    return caches.match(request);
                })
        );
        return;
    }

    // 2. Стратегия "Stale-While-Revalidate" для тайлов карт и шрифтов
    if (url.hostname === 'server.arcgisonline.com' || url.hostname.endsWith('.tile.openstreetmap.org') || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(request).then(cachedResponse => {
                    const fetchPromise = fetch(request).then(networkResponse => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                    // Возвращаем из кэша сразу, а в фоне обновляем
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // 3. Стратегия "Cache First" для всего остального (оболочка приложения)
    event.respondWith(
        caches.match(request)
            .then(response => {
                // Если ресурс есть в кэше, отдаём его. Иначе — делаем запрос к сети.
                return response || fetch(request);
            })
    );
});
