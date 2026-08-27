# Operación de openGym — RJ Agrimensura

## Servicio

- URL pública: `https://gym.rjagrimensura.com`
- Origen local: `http://127.0.0.1:8787`
- Proyecto: `/home/rafa/openGym`
- Persistencia: `/home/rafa/openGym/data`
- Publicación: Cloudflare Tunnel `6058c359-8365-4914-aa59-f0d2856e7433`
- Acceso habitual: usuario y contraseña; perfil `Rafa` con permisos de administrador
- Passkeys: conservadas sólo como compatibilidad interna; no aparecen en la pantalla de acceso
- Registro adicional: sólo por invitación (`INVITE_ONLY=1`)

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
git pull --rebase
docker compose up -d --build
```

## Copia de seguridad

Los perfiles, sesiones, rutinas e historial viven en `data/`. La configuración y el hash scrypt de la contraseña viven en `.env`; la contraseña clara no se almacena.

```bash
cd /home/rafa/openGym
umask 077
tar -czf "$HOME/backups/opengym-$(date +%F-%H%M%S).tar.gz" data/ .env
```

La clave privada de cada passkey permanece en el dispositivo del usuario y no se almacena en el servidor.

## DNS y publicación

El CNAME proxied `gym.rjagrimensura.com` apunta al túnel Cloudflare `6058c359-8365-4914-aa59-f0d2856e7433`, cuya ruta termina en `http://localhost:8787`.

## Acceso y administración

1. Abrir `https://gym.rjagrimensura.com`.
2. Ingresar con el usuario entregado y su contraseña.
3. El perfil `Rafa` ya está asociado al estado existente y tiene permisos de administrador.

El backend conserva únicamente un hash scrypt con salt, limita los intentos por IP y globalmente, admite como máximo dos verificaciones simultáneas y emite una cookie `HttpOnly; Secure; SameSite=Lax`.

No cambiar `RP_ID` después de registrar passkeys: WebAuthn las vincula al hostname exacto.
