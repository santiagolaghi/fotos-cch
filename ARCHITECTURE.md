# Arquitectura propuesta

## Flujo de selección
1. Sincronizar metadatos de OneDrive usando `driveItem/delta`.
2. Generar una cola local de fotos y videos filtrada por fecha/carpeta/cuenta.
3. Cargar miniatura actual + precargar las próximas 3-5.
4. Swipe derecho = conservar; izquierdo = enviar a cola de descarte; arriba = agregar a álbum (futuro gesto opcional).
5. Las decisiones se guardan inmediatamente pero **no se ejecuta DELETE**.
6. La pantalla de descarte muestra miniaturas, cuenta, carpeta y fecha; permite restaurar individualmente.
7. Solo un lote confirmado ejecuta Graph DELETE. OneDrive lo manda a su Papelera.

## Álbumes virtuales
Un álbum virtual guarda referencias `(account_id, drive_item_id)` o una regla dinámica. No mueve ni duplica el archivo original. Ejemplos:
- `Miércoles`: `daysOfWeek=[3]`.
- `Domingos`: `daysOfWeek=[0]`.
- `Culto 27 Sep 2026`: rango de un solo día.
- `Septiembre + cuenta 2`: rango mensual + `accountIds`.

## Dos OneDrive
Cada cuenta se autoriza por OAuth por separado usando `prompt=select_account`. Se guarda su refresh token cifrado con AES-256-GCM en Supabase. Los tokens jamás deben ir a localStorage.

## Rendimiento
- UI basada en thumbnails, no originales.
- Prefetch de tarjetas siguientes.
- Índice local/cache de metadatos.
- Sincronización incremental con `deltaLink`.
- Operaciones de red fuera del gesto de swipe.
- Descarga de original solo al tocar Descargar/Enviar a Canva.

## Canva
La app puede autorizar Canva por OAuth. El usuario selecciona fotos y pulsa “Enviar a Canva”; el backend obtiene URLs temporales de OneDrive y las ofrece de forma controlada para que Canva cree assets. La acción debe ser iniciada por el usuario.

## Rostros
Los grupos de “Personas” que OneDrive muestra en su UI no deben tomarse como dependencia porque no hay una API pública Graph documentada que exponga ese agrupamiento. Si luego se necesita, se diseña una capa de clustering facial separada con consentimiento y política de retención específica.
