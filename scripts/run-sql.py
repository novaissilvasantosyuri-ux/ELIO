"""Executa arquivos .sql em ordem num Postgres local (para no 1º erro).

Uso (com um Postgres rodando em 127.0.0.1:5544, usuário/senha postgres):
  python3 scripts/run-sql.py tests/db/stubs.sql supabase/migrations/*.sql tests/db/smoke*.sql

Requer: pip install pglast "psycopg[binary]"
"""

import os
import sys

import psycopg
from pglast import split

BASE = os.environ.get("ELIO_PG", "host=127.0.0.1 port=5544 user=postgres password=postgres")

admin = psycopg.connect(f"{BASE} dbname=postgres", autocommit=True)
admin.execute("DROP DATABASE IF EXISTS elio_test")
admin.execute("CREATE DATABASE elio_test WITH ENCODING 'UTF8' TEMPLATE template0 LOCALE 'C.UTF-8'")
admin.close()

conn = psycopg.connect(f"{BASE} dbname=elio_test", autocommit=True)
cur = conn.cursor()
for f in sys.argv[1:]:
    src = open(f).read()
    src = "\n".join(line for line in src.splitlines() if not line.startswith("\\"))
    stmts = split(src)
    print(f"== {f}: {len(stmts)} comandos", flush=True)
    for i, st in enumerate(stmts):
        try:
            cur.execute(st)
            if cur.description:
                for row in cur.fetchall():
                    print(f"   [{f.split('/')[-1]}:{i}] {row[0] if len(row) == 1 else row}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"FAILED {f} comando {i}: {e}\n---\n{st[:800]}")
            sys.exit(1)
conn.close()
print("ALL-SQL-OK")
