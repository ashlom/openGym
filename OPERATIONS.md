# Operación de openGym — RJ Agrimensura

## Servicio

- URL pública: `https://gym.rjagrimensura.com`
- Origen local: `http://127.0.0.1:8787`
- Proyecto: `/home/rafa/openGym`
- Persistencia: `/home/rafa/openGym/data`
- Publicación: Cloudflare Tunnel `6058c359-8365-4914-aa59-f0d2856e7433`
- Acceso habitual: usuario y contraseña; perfiles separados para `Rafa`, `Fer`, `Nico` y `Rodri`
- Administración: sólo el perfil `Rafa` tiene permisos de administrador
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

Los perfiles, sesiones, rutinas e historial viven en `data/`. Los hashes scrypt de las contraseñas están en `data/password-users.json`, configurado mediante `PASSWORD_USERS_FILE` en `.env`; las contraseñas claras no se almacenan.

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
3. Cada usuario tiene estado, rutinas e historial independientes. El perfil `Rafa` conserva sus datos existentes y tiene permisos de administrador.

El backend conserva únicamente hashes scrypt con salts independientes, limita los intentos por IP y globalmente, admite como máximo dos verificaciones simultáneas y emite una cookie `HttpOnly; Secure; SameSite=Lax`.

## Planes iniciales

Los perfiles vacíos pueden elegir desde Inicio, Plan o Configuración entre:

- Cuerpo completo, 2 días por semana.
- Cuerpo completo, 3 días por semana.
- Torso/Pierna, 4 días por semana.
- Empuje/Tirón/Piernas, 3 días por semana.

El plan elegido reemplaza las rutinas y la asignación semanal actuales; luego todos los ejercicios, series, repeticiones y días se pueden editar manualmente. El historial de entrenamientos completados se conserva.

## Balanza Huawei AH100 / CH100

La carga de peso admite conexión directa por Web Bluetooth desde **Chrome en Android**. Se accede desde `Configuración → Datos → Conectar balanza Huawei` o desde la ficha de registro de peso.

En el primer uso se solicitan la dirección Bluetooth/MAC de la balanza, edad, altura y sexo. La MAC puede consultarse con una herramienta de escaneo BLE como nRF Connect. La clave local, la MAC y esos datos quedan separados por perfil exclusivamente en el almacenamiento local de ese navegador; no se sincronizan ni forman parte del backup del servidor. La opción `Configurar balanza → Olvidar balanza` los elimina del dispositivo.

Si la balanza ya está vinculada con Huawei Health u otra aplicación, openGym pide confirmación explícita antes de reemplazar esa vinculación. Nunca ejecuta `BIND` automáticamente. Después de recibir una medición válida y verificar su checksum, completa el peso y, cuando están disponibles, conserva grasa corporal e impedancia. El usuario todavía debe pulsar `Guardar`, por lo que una emisión repetida o accidental no modifica el perfil por sí sola.

Safari/Chrome en iPhone no incluyen Web Bluetooth; allí queda disponible la carga manual. La prueba final del enlace BLE necesita la balanza física cerca del teléfono.

No cambiar `RP_ID` después de registrar passkeys: WebAuthn las vincula al hostname exacto.
