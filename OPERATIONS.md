# Operación de openGym — RJ Agrimensura

## Servicio

- URL pública prevista: `https://gym.rjagrimensura.com`
- Origen local: `http://127.0.0.1:8787`
- Proyecto: `/home/rafa/openGym`
- Persistencia: `/home/rafa/openGym/data`
- Publicación: Cloudflare Tunnel `6058c359-8365-4914-aa59-f0d2856e7433`
- Registro: sólo por invitación (`INVITE_ONLY=1`)

## Estado y logs

```bash
cd /home/rafa/openGym
docker compose ps -a
docker compose logs --tail=100 api web
curl -fsS http://127.0.0.1:8787/api/health
```

El contenedor `media` termina con código 0 por diseño: sólo comprueba o descarga los recursos una vez.

## Arranque, parada y actualización

```bash
cd /home/rafa/openGym
docker compose up -d
docker compose down
```

Las imágenes públicas originales no están disponibles en GHCR, por lo que las actualizaciones deben compilarse localmente:

```bash
cd /home/rafa/openGym
git pull
docker compose up -d --build
```

## Copia de seguridad

Todos los perfiles, passkeys públicas, sesiones, rutinas e historial viven en `data/`.

```bash
cd /home/rafa/openGym
tar -czf "$HOME/backups/opengym-$(date +%F-%H%M%S).tar.gz" data/
```

La clave privada de cada passkey permanece en el dispositivo del usuario y no se almacena en el servidor.

## DNS pendiente

Crear en Cloudflare, dentro de `rjagrimensura.com`:

- Tipo: `CNAME`
- Nombre: `gym`
- Destino: `6058c359-8365-4914-aa59-f0d2856e7433.cfargotunnel.com`
- Proxy: activado

El túnel ya contiene la ruta `gym.rjagrimensura.com -> http://localhost:8787`.

## Primer acceso y administración

1. Abrir `https://gym.rjagrimensura.com`.
2. Crear el perfil inicial con el código de invitación entregado por separado.
3. Después del alta, obtener el identificador del usuario desde `data/db.json` y asignarlo a `ADMIN_UIDS` en `.env`.
4. Recrear la API: `docker compose up -d api`.

No cambiar `RP_ID` después de registrar passkeys: WebAuthn las vincula al hostname exacto.
