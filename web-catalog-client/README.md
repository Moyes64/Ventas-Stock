# web-catalog-client

Cliente web standalone para editar el catálogo web de Ventas-Stock desde otra
computadora en la misma LAN (ej. la Mac de Anabella), sin instalar nada ahí —
solo un navegador.

Habla por HTTP con el servidor que expone `electron/modules/web-catalog-server`
dentro de la app de escritorio (activable desde **Catálogo Web → Acceso
remoto** en Ventas-Stock). No comparte código con el resto del repo — es un
proyecto npm separado (como `mobile/`), no forma parte del workspace pnpm de
la raíz.

## Instalación

```
cd web-catalog-client
npm install
```

## Compilar para que Ventas-Stock lo sirva

Ventas-Stock sirve el contenido de `dist/` como el sitio del servidor LAN.
Antes de levantar `electron-vite dev` (o de empaquetar la app), hay que
compilar este cliente al menos una vez:

```
npm run build
```

Sin ese build, el servidor LAN responde 503 en cualquier ruta que no sea de
la API (`/api/...`, `/health`).

## Desarrollo con hot-reload

Para iterar en la UI sin recompilar cada vez, se puede correr contra un
Electron real ya levantado en la red, en vez de contra el build estático:

```
VITE_API_BASE=http://<ip-de-la-notebook>:4279 npm run dev
```

Y abrir `http://localhost:5180/?token=<token>` (el token se ve en Ventas-Stock,
en Catálogo Web → Acceso remoto).
