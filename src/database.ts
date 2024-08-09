import { Pool } from 'pg';

// Use the connection URL provided by Railway
const pool = new Pool({
    connectionString: process.env.RAILWAY_DATABASE_URL,
});

pool.query(
    `
  CREATE TABLE IF NOT EXISTS contests (
      id SERIAL PRIMARY KEY,
      start_date TEXT,
      end_date TEXT
  )
`
);

pool.query(
    `
  CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT,
      user_id TEXT,
      type TEXT,
      contest_id INTEGER,

      UNIQUE(message_id, user_id, type),
      FOREIGN KEY (contest_id) REFERENCES contests(id)
  )
`
);

export async function saveContest(startDate: string, endDate: string): Promise<void> {
    await pool.query('INSERT INTO contests (start_date, end_date) VALUES ($1, $2)', [
        startDate,
        endDate,
    ]);
}

export async function getCurrentContest(): Promise<{
    id: number;
    startDate: string;
    endDate: string;
} | null> {
    const result = await pool.query(
        'SELECT id, start_date, end_date FROM contests ORDER BY id DESC LIMIT 1'
    );
    const row = result.rows[0];
    return row ? { id: row.id, startDate: row.start_date, endDate: row.end_date } : null;
}

export async function saveReaction(
    messageId: string,
    userId: string,
    type: string,
    contestId: number
): Promise<void> {
    await pool.query(
        'INSERT INTO reactions (message_id, user_id, type, contest_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [messageId, userId, type, contestId]
    );
}

export async function removeReaction(
    messageId: string,
    userId: string,
    type: string
): Promise<void> {
    await pool.query('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND type = $3', [
        messageId,
        userId,
        type,
    ]);
}

export async function getLeaderboard(
    type: string,
    contestId: number
): Promise<{ messageId: string; count: number }[]> {
    const result = await pool.query(
        `
    SELECT message_id, COUNT(*) as count
    FROM reactions
    WHERE type = $1
    AND contest_id = $2
    GROUP BY message_id
    ORDER BY count DESC
  `,
        [type, contestId]
    );
    return result.rows.map(row => ({ messageId: row.message_id, count: row.count }));
}
