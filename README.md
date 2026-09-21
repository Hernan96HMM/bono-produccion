# Bono de Producción — SICA Metalúrgica

Aplicación de gestión de bonos de producción: nómina, evaluaciones mensuales (horas, predisposición,
seguridad e higiene) y cálculo automático del incentivo. Corre 100% en red local, sin salida a
internet salvo para descargar las imágenes base de Docker la primera vez.

## Stack

- **Backend:** Node.js 22 + Express + PostgreSQL (`pg`)
- **Frontend:** HTML/CSS/JS estático servido por nginx, que proxya `/api` al backend
- **Auth:** bcrypt + JWT en cookie httpOnly
- **Base de datos:** PostgreSQL 16, datos persistidos en `./data/postgres`

## Requisitos

- Docker y Docker Compose (`docker compose version` debe funcionar)
- Ningún otro requisito: no hace falta Node ni Postgres instalados en el host

## Levantar el sistema

1. Copiar el archivo de variables de entorno y completar valores propios:

   ```bash
   cp .env.example .env
   ```

   Editar `.env`:
   - `DB_PASSWORD`: contraseña de la base de datos (elegir una propia, no dejar el valor de ejemplo)
   - `JWT_SECRET`: cadena aleatoria larga (32+ caracteres) para firmar las sesiones

2. Levantar los tres servicios:

   ```bash
   docker compose up -d --build
   ```

   Esto construye las imágenes de `backend` y `frontend`, y levanta `db` esperando a que el healthcheck
   de Postgres esté OK antes de arrancar el backend.

3. Sembrar los datos iniciales (usuarios, calendario 2026, factores, niveles, criterios):

   ```bash
   docker compose run --rm backend npm run seed
   ```

   Este paso deja la tabla `personal` **vacía a propósito** — la nómina real se carga después desde la
   sección "Personal" (alta manual o importando un Excel).

   > **Atención:** `npm run seed` está pensado para la puesta en marcha inicial. Volver a correrlo contra
   > una base de datos ya en uso **resetea en silencio** las contraseñas de los 4 usuarios por defecto y el
   > mes en curso a sus valores por defecto, aunque un administrador ya los haya cambiado. No lo ejecutes
   > sobre datos reales salvo que sepas que eso es lo que querés hacer.

4. Abrir `http://localhost:3000` en el navegador.

## Usuarios iniciales (creados por el seed)

| Usuario      | Contraseña    | Rol                    |
|--------------|---------------|------------------------|
| `admin`      | `Admin1234!`  | Administrador (RRHH)   |
| `foos`       | `Foos1234!`   | Supervisor             |
| `produccion` | `Prod1234!`   | Gerente de Producción  |
| `schmidt`    | `Syh1234!`    | Seguridad e Higiene    |

**Cambiar estas contraseñas apenas se levante el sistema** (Usuarios y permisos → Editar, como `admin`).

## Primeros pasos como administrador

1. Iniciar sesión con `admin` / `Admin1234!` y cambiar la contraseña.
2. Ir a **Personal** → "↑ Importar nómina" (o dar de alta manualmente) para cargar la nómina real,
   incluyendo la columna **Evaluador** con el nombre exacto que va a usar cada supervisor.
3. Ir a **Usuarios y permisos** → "⚡ Generar supervisores desde la nómina" para crear un usuario por
   cada evaluador detectado en la columna Evaluador (o crearlos manualmente).
4. Ir a **Calendario laboral** para ajustar la jornada (horas por tipo de día) y los feriados si difieren
   de los feriados nacionales 2026 precargados.
5. Ir a **Configuración** para revisar el bono base, el peso de los tres factores (deben sumar 100%),
   los criterios de Predisposición/S&H con sus rúbricas, y la escala de niveles.

## Operación mensual

1. Cada evaluador (Producción, supervisores, Seg. e Higiene) carga su parte en **Evaluaciones** y
   opcionalmente marca "✓ Finalizar mi evaluación" cuando termina (no bloquea, es solo informativo
   para el admin en **Inicio**).
2. El administrador revisa **Resultados** y el **Dashboard**.
3. Al cierre del mes, el administrador va a **Historial** → "Cerrar período" para archivar el mes
   (esto no borra las evaluaciones, solo guarda una foto del resultado de ese mes).
4. Cambiar el mes en curso desde cualquiera de los selectores de mes (Personal, Evaluaciones,
   Calendario o Configuración) — es un valor global compartido por todo el sistema.

## Backups

Los datos viven en `./data/postgres` (montado como volumen de Docker). Para respaldar, basta con copiar
esa carpeta con los contenedores detenidos, o usar `pg_dump`:

```bash
docker compose exec db pg_dump -U sica sica_bonos > backup_$(date +%Y%m%d).sql
```

Para restaurar:

```bash
cat backup_20260101.sql | docker compose exec -T db psql -U sica sica_bonos
```

## Correr los tests del backend

> **PELIGRO — los tests BORRAN la base de datos.** La suite corre contra la misma base
> (`sica_bonos`) que usa la aplicación, y antes de cada archivo de tests hace un
> `TRUNCATE` de **todas** las tablas. Correr `npm test` sobre una instalación en uso
> **destruye toda la información real**: nómina, evaluaciones del mes, calendario,
> configuración, historial y hasta los usuarios (después de correrlo no queda ni el
> usuario `admin`, así que nadie puede volver a entrar) y además deja datos de prueba.
>
> Los tests son para desarrollo. **No correrlos nunca contra la instalación de producción.**
> Si hace falta ejecutarlos en la misma máquina, hacer primero un backup (ver *Backups*)
> y después restaurarlo, o levantar una base aparte apuntando `DATABASE_URL` a otro
> nombre de base de datos.

```bash
docker compose up -d db
docker compose run --rm backend npm test
```

Para volver a dejar el sistema usable después de correr los tests hay que re-sembrar los
datos iniciales y volver a cargar la nómina:

```bash
docker compose run --rm backend npm run seed
```

## Apagar el sistema

```bash
docker compose down
```

(Los datos de Postgres persisten en `./data/postgres` aunque se bajen los contenedores; `docker compose down -v`
NO borra ese volumen porque es un bind mount a una carpeta del host, no un volumen nombrado de Docker —
para borrar los datos hay que eliminar la carpeta `./data/postgres` manualmente.)

## Variables de entorno (`.env`)

| Variable      | Descripción                                              |
|---------------|-----------------------------------------------------------|
| `DB_PASSWORD` | Contraseña del usuario `sica` en Postgres                 |
| `JWT_SECRET`  | Secreto para firmar los JWT de sesión (cookie httpOnly)   |

## Estructura del repositorio

```
docker-compose.yml       Orquesta db + backend + frontend
db/init.sql              Esquema de Postgres (se corre automáticamente al crear el volumen)
backend/                 API REST (Express) + seed.js + tests (Jest/Supertest)
frontend/                HTML/CSS/JS estático + nginx.conf + Dockerfile
```
