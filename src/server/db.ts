// glorr Postgres 连接池
// 仅在 DATABASE_URL 存在时创建真实连接;否则返回占位(本地 JSON 模式不会用到)。
import pg from 'pg';

export const pool =
  process.env.DATABASE_URL
    ? new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
      })
    : (null as unknown as pg.Pool);
