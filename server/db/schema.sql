-- Скрипт генерации базы данных веб-приложения «Атлантис»
-- СУБД: PostgreSQL 16+. Ссылочная целостность обеспечивается внешними ключами и ограничениями.
-- Запуск: npm run db:init (или psql -f db/schema.sql)

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------- Файлы (картинки, фото, справки хранятся в БД) ----------
CREATE TABLE files (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  size        INTEGER NOT NULL CHECK (size > 0),
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Точки (филиалы) и кабинеты ----------
CREATE TABLE branches (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  address     VARCHAR(255) NOT NULL,
  phone       VARCHAR(40),
  hours       VARCHAR(120),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE rooms (
  id          SERIAL PRIMARY KEY,
  branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name        VARCHAR(60) NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 10 CHECK (capacity > 0),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (branch_id, name)
);

-- ---------- Продукты (направления, курсы) ----------
CREATE TABLE categories (
  id          VARCHAR(30) PRIMARY KEY,
  title       VARCHAR(60) NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(60) NOT NULL UNIQUE,
  title           VARCHAR(120) NOT NULL,
  code            VARCHAR(12) NOT NULL,              -- короткая метка в расписании
  color           VARCHAR(7) NOT NULL DEFAULT '#469E3E',
  category_id     VARCHAR(30) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  short           VARCHAR(255),
  program         TEXT[] NOT NULL DEFAULT '{}',
  for_whom        TEXT[] NOT NULL DEFAULT '{}',
  age_label       VARCHAR(40),
  age_from        INTEGER CHECK (age_from BETWEEN 1 AND 18),
  age_to          INTEGER CHECK (age_to BETWEEN 1 AND 18),
  duration_min    INTEGER NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  duration_label  VARCHAR(60),
  group_label     VARCHAR(40),
  price           NUMERIC(8,2) NOT NULL CHECK (price >= 0),  -- цена одного занятия
  price_label     NUMERIC(8,2),                               -- цена для витрины (за курс и т.п.)
  price_unit      VARCHAR(60) NOT NULL DEFAULT 'за занятие',
  link            VARCHAR(255),
  image_id        INTEGER REFERENCES files(id) ON DELETE SET NULL,
  is_online       BOOLEAN NOT NULL DEFAULT FALSE,
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  show_on_site    BOOLEAN NOT NULL DEFAULT TRUE,
  sort            INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (age_from IS NULL OR age_to IS NULL OR age_from <= age_to)
);

-- ---------- Льготы ----------
CREATE TABLE benefits (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(120) NOT NULL UNIQUE,
  discount_pct  NUMERIC(5,2) NOT NULL CHECK (discount_pct BETWEEN 0 AND 100),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Пользователи и роли ----------
CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  email                 VARCHAR(160) NOT NULL,
  password_hash         VARCHAR(100) NOT NULL,
  role                  VARCHAR(10) NOT NULL CHECK (role IN ('PARENT', 'TEACHER', 'DIRECTOR')),
  full_name             VARCHAR(160) NOT NULL,
  phone_enc             TEXT,                       -- телефон зашифрован AES-256-GCM
  branch_id             INTEGER REFERENCES branches(id) ON DELETE RESTRICT,  -- для директора: NULL = все точки
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins         INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE email_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(10) NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash   VARCHAR(100) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE
);

-- Страница учителя на сайте
CREATE TABLE teacher_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug          VARCHAR(60) NOT NULL UNIQUE,
  position      VARCHAR(120),
  lead          VARCHAR(400),
  education     VARCHAR(255),
  experience_years INTEGER CHECK (experience_years >= 0),
  achievements  TEXT[] NOT NULL DEFAULT '{}',        -- регалии и достижения
  motto         VARCHAR(255),
  photo_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
  photo_url     VARCHAR(255),
  show_on_site  BOOLEAN NOT NULL DEFAULT TRUE,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE teacher_branches (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id  INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

-- ---------- Дети ----------
CREATE TABLE children (
  id              SERIAL PRIMARY KEY,
  parent_id       INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  full_name       VARCHAR(160) NOT NULL,
  birth_date_enc  TEXT,                         -- дата рождения зашифрована
  grade           VARCHAR(30),
  benefit_id      INTEGER REFERENCES benefits(id) ON DELETE SET NULL,
  rating_consent  BOOLEAN NOT NULL DEFAULT FALSE, -- согласие родителя на показ в рейтинге на сайте
  note            VARCHAR(500),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Группы и расписание ----------
CREATE TABLE groups (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(120) NOT NULL,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  price       NUMERIC(8,2) CHECK (price >= 0),        -- NULL = цена продукта
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (branch_id, title),
  CHECK (start_date <= end_date)
);

CREATE TABLE schedule_slots (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- 1 = понедельник
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  CHECK (start_time < end_time)
);

CREATE TABLE enrollments (
  id          SERIAL PRIMARY KEY,
  child_id    INTEGER NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  status      VARCHAR(10) NOT NULL CHECK (status IN ('trial', 'active', 'waiting', 'finished')),
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE,
  price       NUMERIC(8,2) CHECK (price >= 0),        -- индивидуальная цена занятия
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX enrollments_open_uq ON enrollments (child_id, group_id) WHERE status <> 'finished';

-- ---------- Занятия, посещаемость, рейтинг ----------
CREATE TABLE lessons (
  id           SERIAL PRIMARY KEY,
  group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  slot_id      INTEGER REFERENCES schedule_slots(id) ON DELETE SET NULL,
  lesson_date  DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  room_id      INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  teacher_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status       VARCHAR(10) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'cancelled')),
  topic        VARCHAR(255),
  note         VARCHAR(255),
  UNIQUE (group_id, lesson_date, start_time),
  CHECK (start_time < end_time)
);
CREATE INDEX lessons_date_idx ON lessons (lesson_date);

CREATE TABLE attendance (
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  child_id    INTEGER NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  status      VARCHAR(10) NOT NULL CHECK (status IN ('present', 'absent', 'sick', 'excused')),
  points      SMALLINT CHECK (points BETWEEN 0 AND 10),
  comment     VARCHAR(255),
  marked_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, child_id)
);

CREATE TABLE sick_notes (
  id           SERIAL PRIMARY KEY,
  child_id     INTEGER NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  date_from    DATE NOT NULL,
  date_to      DATE NOT NULL,
  file_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  comment      VARCHAR(255),
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_from <= date_to)
);

CREATE TABLE homework (
  id          SERIAL PRIMARY KEY,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  file_id     INTEGER REFERENCES files(id) ON DELETE SET NULL,
  due_date    DATE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Деньги ----------
CREATE TABLE charges (
  id          SERIAL PRIMARY KEY,
  child_id    INTEGER NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  amount      NUMERIC(8,2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, lesson_id)
);

CREATE TABLE payments (
  id           SERIAL PRIMARY KEY,
  child_id     INTEGER NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  group_id     INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  amount       NUMERIC(8,2) NOT NULL CHECK (amount > 0),
  paid_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  method       VARCHAR(10) NOT NULL CHECK (method IN ('cash', 'card', 'erip')),
  branch_id    INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  received_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  comment      VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Заявки, уведомления, контент сайта, журнал действий ----------
CREATE TABLE requests (
  id            SERIAL PRIMARY KEY,
  parent_name   VARCHAR(160) NOT NULL,
  phone_enc     TEXT NOT NULL,
  child_age     VARCHAR(60),
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_work', 'done', 'rejected')),
  comment       VARCHAR(255),
  processed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        VARCHAR(500) NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key    VARCHAR(40) PRIMARY KEY,
  title  VARCHAR(120) NOT NULL,
  value  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE price_cards (
  id        SERIAL PRIMARY KEY,
  title     VARCHAR(120) NOT NULL,
  value     NUMERIC(8,2) NOT NULL CHECK (value >= 0),
  unit      VARCHAR(60) NOT NULL,
  note      VARCHAR(255),
  items     TEXT[] NOT NULL DEFAULT '{}',
  featured  BOOLEAN NOT NULL DEFAULT FALSE,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reviews (
  id      SERIAL PRIMARY KEY,
  text    VARCHAR(1000) NOT NULL,
  author  VARCHAR(120) NOT NULL,
  about   VARCHAR(160),
  source  VARCHAR(60),
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE faq (
  id      SERIAL PRIMARY KEY,
  q       VARCHAR(255) NOT NULL,
  a       VARCHAR(1000) NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(60) NOT NULL,
  entity      VARCHAR(40),
  entity_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сессии (express-session + connect-pg-simple)
CREATE TABLE session (
  sid     VARCHAR NOT NULL PRIMARY KEY,
  sess    JSON NOT NULL,
  expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);
