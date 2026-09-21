# Landing de captacion

Landing de una pagina con salida a WhatsApp y metricas propias.

## Como funciona

La pagina **no contiene ningun link de WhatsApp**. El boton pega contra `/ir`
y el servidor responde un 302 hacia WhatsApp. Eso mantiene el numero fuera del
HTML y permite contar el clic del lado del servidor, donde no lo frena un
bloqueador de anuncios.

## Rutas

| Ruta | Que hace |
|---|---|
| `/` | la landing |
| `/ir?ref=CODIGO` | redirige a WhatsApp y cuenta el clic |
| `/ok?ref=CODIGO` | baliza de permanencia a los 2s (la manda la pagina sola) |
| `/stats?key=CLAVE` | panel de metricas |
| `/api/stats?key=CLAVE` | las mismas metricas en JSON |
| `/health` | chequeo de salud para Render |

## Variables de entorno

| Variable | Para que sirve |
|---|---|
| `WA_PHONES` | numero o numeros separados por coma. Acepta local (`1135734768`) o internacional. Con varios, reparte los leads por turno. |
| `ADMIN_KEY` | clave del panel de metricas. Sin esta variable el panel queda cerrado. |
| `WA_TEXTO` | primer mensaje que aparece escrito en WhatsApp. |
| `STATS_FILE` | donde guardar las metricas. Por defecto `/tmp`, que se borra al reiniciar. |

## Medir que creativo trae los leads

Pone un codigo corto en `utm_content` en cada anuncio:

    https://TU-DOMINIO/?utm_content=CREATIVO-A

Ese codigo viaja hasta el primer mensaje de WhatsApp ("...(ref CREATIVO-A)") y
aparece abierto por creativo en `/stats`.
