-- 001_platform.sql
-- Users, roles, permissions, audit trail and the file store.
-- Nothing here is specific to running rooms; it is the platform every other
-- migration leans on.

CREATE TABLE roles (
  id              TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(40)  NOT NULL,
  name            VARCHAR(100) NOT NULL,
  description     VARCHAR(255) NULL,
  scope_level     ENUM('cr','division','running_room','contractor','self') NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(60)  NOT NULL,
  description     VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_id         TINYINT UNSIGNED  NOT NULL,
  permission_id   SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scope columns are filled according to the role's scope_level:
-- division roles carry division_id, RR roles carry running_room_id,
-- contractor roles carry contractor_id. Enforced in application code and
-- re-checked by the reporting views.
CREATE TABLE users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username        VARCHAR(60)  NOT NULL,
  email           VARCHAR(150) NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(150) NOT NULL,
  designation     VARCHAR(120) NULL,
  phone           VARCHAR(20)  NULL,
  role_id         TINYINT UNSIGNED NOT NULL,
  division_id     SMALLINT UNSIGNED NULL,
  running_room_id SMALLINT UNSIGNED NULL,
  contractor_id   SMALLINT UNSIGNED NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  must_change_pw  TINYINT(1) NOT NULL DEFAULT 1,
  failed_logins   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until    DATETIME NULL,
  last_login_at   DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY ix_users_role (role_id),
  KEY ix_users_division (division_id),
  KEY ix_users_rr (running_room_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id              CHAR(36) NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  ip_address      VARCHAR(45) NULL,
  user_agent      VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME NOT NULL,
  revoked_at      DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generic audit trail. This system produces evidence used in contractual
-- disputes, so every mutation is recorded with before/after state.
CREATE TABLE audit_log (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NULL,
  entity_table    VARCHAR(64) NOT NULL,
  entity_id       BIGINT UNSIGNED NULL,
  action          ENUM('insert','update','delete','login','logout','export','sign') NOT NULL,
  before_json     JSON NULL,
  after_json      JSON NULL,
  ip_address      VARCHAR(45) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_table, entity_id),
  KEY ix_audit_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Files are stored on disk; only metadata lives here. entity_table/entity_id
-- are deliberately loose so any module can attach evidence without a new table.
CREATE TABLE files (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid            CHAR(36) NOT NULL,
  original_name   VARCHAR(255) NOT NULL,
  stored_path     VARCHAR(500) NOT NULL,
  mime_type       VARCHAR(120) NOT NULL,
  size_bytes      INT UNSIGNED NOT NULL,
  sha256          CHAR(64) NULL,
  entity_table    VARCHAR(64) NULL,
  entity_id       BIGINT UNSIGNED NULL,
  uploaded_by     BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_uuid (uuid),
  KEY ix_files_entity (entity_table, entity_id),
  CONSTRAINT fk_files_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
