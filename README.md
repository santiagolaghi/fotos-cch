# Culto Media

PWA para curar rápidamente fotos de dos cuentas de OneDrive mediante swipe, crear álbumes virtuales sin mover archivos, descargar originales y preparar integración con Canva.

## Seguridad de borrado
- El swipe **no borra**: solo registra intención.
- Los descartes deben pasar a una cola de revisión.
- El endpoint de borrado exige confirmación `ELIMINAR` y limita el lote.
- Microsoft Graph `DELETE driveItem` mueve el archivo a la papelera de OneDrive.

## Configuración
1. Crear una app en Microsoft Entra ID con cuentas personales y/o organizacionales según tus OneDrive.
2. Redirect URI: `https://TU-DOMINIO/api/onedrive/callback`.
3. Permisos delegados: `openid profile email offline_access Files.ReadWrite`.
4. Crear un proyecto Supabase y ejecutar `supabase/schema.sql`.
5. Configurar variables de `.env.example`.
6. Generar `TOKEN_ENCRYPTION_KEY` con 32 bytes aleatorios codificados en base64.
7. `npm install && npm run dev`.

## Rendimiento
La interfaz debe trabajar con thumbnails y prefetch de las siguientes tarjetas. No descargar originales para el swipe. Para sincronización incremental usar `driveItem/delta` y cachear metadatos, no reenumerar todo el OneDrive en cada apertura.

## Álbumes
- `virtual_albums`: álbumes propios, incluso mezclando dos cuentas.
- OneDrive Personal también soporta bundles/albums nativos; se puede sincronizar opcionalmente.
- Las reglas inteligentes pueden incluir día de semana, fecha, rango, carpeta, cuenta y nombre.

## Canva
Canva puede integrarse mediante su Developers SDK / REST API. Para imágenes desde OneDrive conviene servir una URL temporal controlada por backend para que Canva pueda importar el asset, evitando exponer tokens de Microsoft.
