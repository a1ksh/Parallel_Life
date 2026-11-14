"""One-time cutover between dedicated Parallel Life PostgreSQL databases."""
import hashlib
import json

from sqlalchemy import select, text

from app.models.database import Base


def digest_and_copy(connection, table, destination=None):
    checksum = hashlib.sha256()
    count = 0
    query = select(table).order_by(*table.primary_key.columns)
    for batch in connection.execute(query).mappings().partitions(100):
        rows = [dict(row) for row in batch]
        if destination is not None:
            destination.execute(table.insert(), rows)
        for row in rows:
            checksum.update(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode())
            checksum.update(b"\n")
        count += len(rows)
    return count, checksum.hexdigest()


def migrate_once(source_engine, target_engine):
    """Stop old writers at the snapshot boundary, including in-flight deployments."""
    tables = sorted(Base.metadata.tables.values(), key=lambda table: table.name)
    with target_engine.begin() as target:
        target.execute(text("SELECT pg_advisory_xact_lock(1153887931)"))
        target.execute(text("CREATE TABLE IF NOT EXISTS parallel_life_cutover (id integer PRIMARY KEY)"))
        if target.scalar(text("SELECT id FROM parallel_life_cutover WHERE id = 1")):
            return
        for table in tables:
            if target.execute(select(table.primary_key.columns.values()[0]).limit(1)).first():
                raise RuntimeError("Migration requires an empty destination")
        with source_engine.begin() as source:
            names = ", ".join(t.name for t in tables)
            source.execute(text(f"LOCK TABLE {names} IN SHARE ROW EXCLUSIVE MODE"))
            source.execute(text("""CREATE OR REPLACE FUNCTION parallel_life_read_only()
                RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Parallel Life moved to a new database'; END;
                $$"""))
            for table in tables:
                source.execute(text(f"DROP TRIGGER IF EXISTS parallel_life_moved ON {table.name}"))
                source.execute(text(f"""CREATE TRIGGER parallel_life_moved BEFORE INSERT OR UPDATE OR DELETE
                    ON {table.name} FOR EACH STATEMENT EXECUTE FUNCTION parallel_life_read_only()"""))
                original = digest_and_copy(source, table, target)
                if digest_and_copy(target, table) != original:
                    raise RuntimeError(f"Verification failed for {table.name}")
            target.execute(text("INSERT INTO parallel_life_cutover (id) VALUES (1)"))
