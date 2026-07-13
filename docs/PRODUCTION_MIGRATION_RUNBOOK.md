# Runbook de migración 0005

Este runbook es el único procedimiento autorizado para preparar la migración de
presentación. No autoriza una escritura por sí mismo: requiere ventana aprobada,
snapshot/restauración disponible y revisión humana de la salida de cada paso.
No despliegues la aplicación antes de completar la verificación de base de datos.

## Estado observado y regla de bloqueo

La evidencia de producción recolectada por Bob el 13 de julio de 2026 es:

- no existe `drizzle.__drizzle_migrations` ni `public.__drizzle_migrations`;
- existen el índice único por evento/email, el FK de evento, el trigger de
  capacidad, `display_title`, `require_plus_one_name` y `plus_one_name`;
- no existe `presentation_mode`;
- hay cero grupos duplicados por `(event_id, lower(email))`.

Esto debe clasificarse como `unregistered-historical-schema`. Un migrador normal
intentaría repetir migraciones históricas, por lo que queda prohibido hasta crear
una línea base única de `0000` a `0004`. El preflight es solo lectura, no carga
archivos de entorno y no tiene modo `--apply`:

```bash
DATABASE_URL='<inyectada por el operador>' npm run db:preflight -- --json
```

La salida esperada antes de la línea base es:

```text
classification: unregistered-historical-schema
canBaseline0000Through0004: true
canApply0005: false
```

El exit code es distinto de cero porque la ausencia del registro bloquea una
migración. Detente si falta un objeto histórico, aparece cualquier objeto de
presentación, hay huérfanos/duplicados, existe un registro alterno en `public`, o
la clasificación difiere. La utilidad comprueba las seis tablas base, constraints
únicos, columnas de 0001/0004, índice de deduplicación, FK, función/trigger de
capacidad, huérfanos, duplicados y ausencia/presencia completa de 0005.

## Línea base única 0000–0004

Solo después del preflight anterior, revisado contra el mismo destino y dentro de
la ventana aprobada:

1. congela despliegues y toda actividad de schema/migración hasta terminar la
   verificación posterior a `0005`;
2. registra en el ticket de operación el `target.fingerprint` no secreto emitido
   por el preflight y el SHA del checkout revisado;
3. confirma con otra persona que el fingerprint y el checkout son los aprobados;
4. pasa ese valor a `psql` como `--set
   expected_target_fingerprint='<fingerprint-revisado>'`.

El fingerprint es MD5 de identidad de conexión (base, usuario, dirección y puerto
del servidor), no de una URL ni de credenciales. No pegues la URL de conexión en
el ticket. Ejecuta exactamente este SQL en una sola sesión `psql -X` con
`ON_ERROR_STOP=1`. Los hashes de la inserción son SHA-256 del contenido exacto de
cada archivo y los timestamps son los del journal actual.

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

SELECT pg_advisory_xact_lock(134770013, 4);
SELECT set_config(
  'partytime.expected_target_fingerprint',
  :'expected_target_fingerprint',
  true
);

LOCK TABLE
  public.app_settings,
  public.events,
  public.rsvps,
  public.user_event_assignments,
  public.user_sessions,
  public.users
IN SHARE MODE;

DO $baseline_guard$
DECLARE
  invalid_objects text[];
  actual_fingerprint text;
BEGIN
  actual_fingerprint := md5(
    current_database() || '|' || current_user || '|'
    || coalesce(inet_server_addr()::text, 'local') || '|'
    || coalesce(inet_server_port()::text, 'local')
  );
  IF current_schema() <> 'public'
     OR current_setting('partytime.expected_target_fingerprint', true) IS NULL
     OR current_setting('partytime.expected_target_fingerprint', true) !~ '^[0-9a-f]{32}$'
     OR actual_fingerprint <> current_setting('partytime.expected_target_fingerprint', true) THEN
    RAISE EXCEPTION 'target fingerprint/schema mismatch';
  END IF;

  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
     OR to_regclass('public.__drizzle_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'migration registry appeared after preflight';
  END IF;

  SELECT array_agg(expected.table_name || '.' || expected.column_name ORDER BY 1)
  INTO invalid_objects
  FROM (VALUES
    ('app_settings', 'id'), ('app_settings', 'value'), ('app_settings', 'updated_at'),
    ('events', 'id'), ('events', 'slug'), ('events', 'title'),
    ('events', 'display_title'), ('events', 'subtitle'), ('events', 'date'),
    ('events', 'time'), ('events', 'location'), ('events', 'details'),
    ('events', 'price_enabled'), ('events', 'price_amount'), ('events', 'price_currency'),
    ('events', 'capacity_enabled'), ('events', 'capacity_limit'),
    ('events', 'background_image_url'), ('events', 'og_image_url'), ('events', 'theme'),
    ('events', 'host_name'), ('events', 'host_email'), ('events', 'host_phone'),
    ('events', 'is_active'), ('events', 'rsvp_closed'), ('events', 'rsvp_closed_message'),
    ('events', 'require_plus_one_name'), ('events', 'email_confirmation_enabled'),
    ('events', 'reminder_enabled'), ('events', 'reminder_scheduled_at'),
    ('events', 'reminder_sent_at'), ('events', 'created_at'), ('events', 'updated_at'),
    ('rsvps', 'id'), ('rsvps', 'event_id'), ('rsvps', 'name'), ('rsvps', 'email'),
    ('rsvps', 'phone'), ('rsvps', 'plus_one'), ('rsvps', 'plus_one_name'),
    ('rsvps', 'status'), ('rsvps', 'email_sent'), ('rsvps', 'email_history'),
    ('rsvps', 'cancel_token'), ('rsvps', 'created_at'),
    ('user_event_assignments', 'id'), ('user_event_assignments', 'user_id'),
    ('user_event_assignments', 'event_id'), ('user_event_assignments', 'role'),
    ('user_event_assignments', 'assigned_by'), ('user_event_assignments', 'assigned_at'),
    ('user_sessions', 'id'), ('user_sessions', 'user_id'), ('user_sessions', 'token'),
    ('user_sessions', 'expires_at'), ('user_sessions', 'created_at'),
    ('user_sessions', 'user_agent'), ('user_sessions', 'ip_address'),
    ('users', 'id'), ('users', 'email'), ('users', 'password_hash'), ('users', 'name'),
    ('users', 'role'), ('users', 'is_active'), ('users', 'invited_by'),
    ('users', 'created_at'), ('users', 'last_login_at')
  ) AS expected(table_name, column_name)
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name
  WHERE actual.column_name IS NULL;
  IF invalid_objects IS NOT NULL THEN
    RAISE EXCEPTION 'missing historical columns: %', array_to_string(invalid_objects, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events'
      AND column_name = 'display_title' AND data_type = 'text'
      AND is_nullable = 'YES' AND column_default = quote_literal(''::text) || '::text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events'
      AND column_name = 'require_plus_one_name' AND data_type = 'boolean'
      AND is_nullable = 'YES' AND column_default IN ('false', 'false::boolean')
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps'
      AND column_name = 'plus_one_name' AND data_type = 'text'
      AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'foundation column semantics differ from migration 0004';
  END IF;

  WITH expected(check_name, object_name, relation_oid, constraint_type, column_names) AS (
    VALUES
      ('app_settings_pkey', 'app_settings_pkey', to_regclass('public.app_settings')::oid, 'p'::"char", ARRAY['id']::text[]),
      ('events_pkey', 'events_pkey', to_regclass('public.events')::oid, 'p'::"char", ARRAY['id']::text[]),
      ('events_slug_unique', 'events_slug_unique', to_regclass('public.events')::oid, 'u'::"char", ARRAY['slug']::text[]),
      ('rsvps_pkey', 'rsvps_pkey', to_regclass('public.rsvps')::oid, 'p'::"char", ARRAY['id']::text[]),
      ('user_event_assignments_pkey', 'user_event_assignments_pkey', to_regclass('public.user_event_assignments')::oid, 'p'::"char", ARRAY['id']::text[]),
      ('user_sessions_pkey', 'user_sessions_pkey', to_regclass('public.user_sessions')::oid, 'p'::"char", ARRAY['id']::text[]),
      ('user_sessions_token_unique', 'user_sessions_token_unique', to_regclass('public.user_sessions')::oid, 'u'::"char", ARRAY['token']::text[]),
      ('users_pkey', 'users_pkey', to_regclass('public.users')::oid, 'p'::"char", ARRAY['id']::text[]),
      ('users_email_unique', 'users_email_unique', to_regclass('public.users')::oid, 'u'::"char", ARRAY['email']::text[])
  ),
  actual AS (
    SELECT c.*,
      ARRAY(
        SELECT attribute.attname
        FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_attribute attribute
          ON attribute.attrelid = c.conrelid AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) AS column_names
    FROM pg_constraint c
    WHERE c.connamespace = to_regnamespace('public')
  )
  SELECT array_agg(expected.check_name ORDER BY expected.check_name)
  INTO invalid_objects
  FROM expected
  WHERE (SELECT count(*) FROM actual WHERE conname = expected.object_name) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM actual
       WHERE conname = expected.object_name
         AND conrelid = expected.relation_oid
         AND contype = expected.constraint_type
         AND column_names = expected.column_names
         AND convalidated
     );
  IF invalid_objects IS NOT NULL THEN
    RAISE EXCEPTION 'invalid historical constraints: %', array_to_string(invalid_objects, ', ');
  END IF;

  IF NOT (
    WITH fk AS (
      SELECT c.*,
        ARRAY(
          SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, position)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          ORDER BY k.position
        ) AS columns,
        ARRAY(
          SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, position)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum
          ORDER BY k.position
        ) AS referenced_columns,
        regexp_replace(
          lower(replace(replace(pg_get_constraintdef(c.oid, false), '"', ''), 'public.', '')),
          '[[:space:]]+', ' ', 'g'
        ) AS definition
      FROM pg_constraint c
      WHERE c.connamespace = to_regnamespace('public')
        AND c.conname = 'rsvps_event_id_events_slug_fk'
    )
    SELECT count(*) = 1 AND coalesce(bool_and(
      contype = 'f' AND conrelid = to_regclass('public.rsvps')
      AND confrelid = to_regclass('public.events')
      AND columns = ARRAY['event_id']::text[]
      AND referenced_columns = ARRAY['slug']::text[]
      AND confupdtype = 'c' AND confdeltype = 'r' AND confmatchtype = 's'
      AND NOT condeferrable AND NOT condeferred AND convalidated
      AND definition = 'foreign key (event_id) references events(slug) on update cascade on delete restrict'
    ), false) FROM fk
  ) THEN
    RAISE EXCEPTION 'FK semantics differ from migration 0003';
  END IF;

  IF NOT (
    WITH idx AS (
      SELECT i.oid, x.*,
        regexp_replace(
          lower(replace(replace(pg_get_indexdef(i.oid), '"', ''), 'public.', '')),
          '[[:space:]]+', ' ', 'g'
        ) AS definition,
        regexp_replace(lower(replace(pg_get_indexdef(i.oid, 1, true), '"', '')), '[[:space:]]+', ' ', 'g') AS key1,
        regexp_replace(lower(replace(pg_get_indexdef(i.oid, 2, true), '"', '')), '[[:space:]]+', ' ', 'g') AS key2
      FROM pg_class i
      JOIN pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public' AND i.relname = 'rsvps_event_email_unique'
    )
    SELECT count(*) = 1 AND coalesce(bool_and(
      indrelid = to_regclass('public.rsvps') AND indisunique AND indisvalid
      AND indisready AND indislive AND indpred IS NULL
      AND indnkeyatts = 2 AND indnatts = 2
      AND key1 = 'event_id' AND key2 = 'lower(email)'
      AND definition = 'create unique index rsvps_event_email_unique on rsvps using btree (event_id, lower(email))'
    ), false) FROM idx
  ) THEN
    RAISE EXCEPTION 'dedup index semantics differ from migration 0004';
  END IF;

  IF NOT (
    WITH trg AS (
      SELECT t.*,
        ARRAY(
          SELECT a.attname FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY AS k(attnum, position)
          JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = k.attnum
          ORDER BY k.position
        ) AS update_columns,
        regexp_replace(
          lower(replace(replace(pg_get_triggerdef(t.oid, false), '"', ''), 'public.', '')),
          '[[:space:]]+', ' ', 'g'
        ) AS definition
      FROM pg_trigger t
      JOIN pg_class r ON r.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public' AND t.tgname = 'rsvps_capacity_check' AND NOT t.tgisinternal
    )
    SELECT count(*) = 1 AND coalesce(bool_and(
      tgrelid = to_regclass('public.rsvps')
      AND tgfoid = to_regprocedure('public.enforce_event_capacity()')
      AND tgenabled = 'O' AND tgtype = 23 AND tgnargs = 0
      AND update_columns = ARRAY['status', 'plus_one']::text[]
      AND definition = 'create trigger rsvps_capacity_check before insert or update of status, plus_one on rsvps for each row execute function enforce_event_capacity()'
    ), false) FROM trg
  ) THEN
    RAISE EXCEPTION 'capacity trigger semantics/enabled state differ from migration 0002';
  END IF;

  IF NOT (
    SELECT count(*) = 1 AND coalesce(bool_and(
      pg_get_function_identity_arguments(p.oid) = ''
      AND pg_get_function_result(p.oid) = 'trigger'
      AND p.prorettype = 'trigger'::regtype AND p.prokind = 'f'
      AND l.lanname = 'plpgsql' AND p.provolatile = 'v' AND NOT p.prosecdef
      AND md5(regexp_replace(btrim(prosrc, E' \t\n\r\f'), '[[:space:]]+', ' ', 'g'))
        = 'cc8ef90ba771e3ee7713166327b0d3fa'
    ), false)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = 'enforce_event_capacity'
  ) THEN
    RAISE EXCEPTION 'capacity function signature/body differ from migration 0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rsvps r
    WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.slug = r.event_id)
  ) THEN
    RAISE EXCEPTION 'orphan RSVPs detected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT event_id, lower(email)
      FROM public.rsvps
      GROUP BY event_id, lower(email)
      HAVING count(*) > 1
    ) duplicate_groups
  ) THEN
    RAISE EXCEPTION 'duplicate event/email groups detected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events'
      AND column_name IN (
        'presentation_mode', 'rsvp_title', 'rsvp_button_label',
        'background_overlay_strength', 'background_image_fit'
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = to_regnamespace('public') AND conname IN (
      'events_presentation_mode_check', 'events_background_image_fit_check',
      'events_background_overlay_strength_check', 'events_rsvp_button_label_check'
    )
  ) THEN
    RAISE EXCEPTION '0005 objects already exist';
  END IF;

  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
     OR to_regclass('public.__drizzle_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'migration registry appeared during baseline guard';
  END IF;
END
$baseline_guard$;

CREATE SCHEMA drizzle;
CREATE TABLE drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('fac98b037bbf7a0fd612ddbd8de297be9b5b212dae369ab62157476464d7221f', 1769835675204),
  ('fd7c7a2f524651d6fbbce58a6e003af81b0f1610fafeb36c21ac7ce96d92ae72', 1772324897000),
  ('e1cba23cee11637e9a9c46cffe5526280dbf0834805b105202bfe984f32ec84e', 1783729900000),
  ('598b27a173aa98779955192430144d24fdf2cf835f9b203d86aee8dd95ff4380', 1783730776000),
  ('3c6c7d033d02b925e546599240fc2cd1d94508f77c5aa5a0fa5d2c359a3b7475', 1783939800000);

COMMIT;
```

Vuelve a ejecutar el preflight. Debe salir
`registered-foundation-ready`, con `canApply0005: true`. Cualquier otro resultado
es un stop obligatorio. El `target.fingerprint` debe seguir siendo idéntico al
registrado. Mantén congelada la actividad de schema/deploy hasta terminar `0005`
y su verificación.

## Aplicación transaccional de 0005

Con el mismo checkout revisado y la aprobación explícita de escritura, aplica el
SQL y registra su hash dentro de una sola transacción:

```bash
psql "$DATABASE_URL" -X --set ON_ERROR_STOP=1 --single-transaction \
  --file drizzle/0005_invitation_presentation.sql \
  --command "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('96f9df242f36bea51a3566ce9b364d3feee518d727daadb196c61f0eb2df130b', 1783940004620)"
```

Después:

```bash
DATABASE_URL='<misma conexión inyectada>' npm run db:preflight -- --json
DATABASE_URL='<misma conexión inyectada>' npm run verify:db
```

La clasificación debe ser `registered-current-schema` y `verify:db` debe terminar
en exit 0. Solo entonces se puede desplegar la aplicación. El deploy sigue siendo
una autorización separada.

## Rollback

Ante una regresión, revierte primero el código de aplicación y conserva las cinco
columnas y constraints aditivos. No elimines columnas durante el incidente: pueden
contener configuración ya capturada. Una eliminación posterior requiere otra
migración revisada, aceptación explícita de pérdida de datos y su propia ventana.

## Separación de revisión

La fundación (0004, journal/snapshots, pruebas y este runbook) y la aplicación que
depende de ella deben revisarse como cambios separados. Los artefactos patch no
sustituyen ramas/PRs reales; crear esas ramas y publicarlas sigue siendo un gate de
release hasta recibir autorización explícita para commit y push.
