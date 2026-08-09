"""临时脚本：查询所有数据库表的数据量和样本"""
import sqlite3

conn = sqlite3.connect('data/smart_cabin.db')
c = conn.cursor()

c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in c.fetchall()]

print('=' * 60)
print(f'数据库表清单: {tables}')
print('=' * 60)

for table in tables:
    c.execute(f'SELECT COUNT(*) FROM {table}')
    count = c.fetchone()[0]
    print(f'\n--- {table} ({count} 条记录) ---')
    if count > 0:
        c.execute(f'SELECT * FROM {table} ORDER BY rowid DESC LIMIT 3')
        cols = [d[0] for d in c.description]
        print(f'字段: {cols}')
        for row in c.fetchall():
            print(f'  {row}')
    else:
        print('  (空表)')

conn.close()
print('\n' + '=' * 60)
print('查询完毕')
