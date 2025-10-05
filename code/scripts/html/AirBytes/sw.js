// Service Worker para notificaciones push
const CACHE_NAME = 'air-quality-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/config.js'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Manejar notificaciones push
self.addEventListener('push', (event) => {
    console.log('Push notification received:', event);
    
    const options = {
        body: event.data ? event.data.text() : 'Nueva alerta de calidad del aire',
        icon: '/airbytes_favicon.png',
        badge: '/airbytes_favicon.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Ver detalles',
                icon: '/airbytes_favicon.png'
            },
            {
                action: 'close',
                title: 'Cerrar',
                icon: '/airbytes_favicon.png'
            }
        ],
        requireInteraction: true,
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification('AirBytes - Calidad del Aire', options)
    );
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', (event) => {
    console.log('Notification click received:', event);
    
    event.notification.close();
    
    if (event.action === 'explore') {
        // Abrir la aplicación
        event.waitUntil(
            clients.openWindow('/')
        );
    } else if (event.action === 'close') {
        // Solo cerrar la notificación
        return;
    } else {
        // Clic en la notificación (no en acciones)
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Manejar mensajes del cliente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Manejar fetch requests
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Devolver desde cache si está disponible, sino fetch
                return response || fetch(event.request);
            })
    );
});
