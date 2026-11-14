CREATE TABLE IF NOT EXISTS player_profiles (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    data TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_profiles_owner ON player_profiles (owner);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS game_sessions_owner ON game_sessions (owner);
