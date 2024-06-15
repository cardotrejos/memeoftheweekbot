import Database from 'better-sqlite3';

const db = new Database('memebot.db');

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS contests (
        id INTEGER PRIMARY KEY,
        start_date TEXT,
        end_date TEXT
    )
`
).run();

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS reactions (
        message_id TEXT,
        user_id TEXT,
        type TEXT,
        UNIQUE(message_id, user_id, type)
    )
`
).run();

export function saveContest(startDate: string, endDate: string): void {
    db.prepare('INSERT INTO contests (start_date, end_date) VALUES (?, ?)').run(startDate, endDate);
}

export function getCurrentContest(): { startDate: string; endDate: string } | null {
    const row = db
        .prepare('SELECT start_date, end_date FROM contests ORDER BY id DESC LIMIT 1')
        .get() as { startDate: string; endDate: string } | null;
    return row ? { startDate: row.startDate, endDate: row.endDate } : null;
}

export function saveReaction(messageId: string, userId: string, type: string): void {
    db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, type) VALUES (?, ?, ?)').run(
        messageId,
        userId,
        type
    );
}

export function removeReaction(messageId: string, userId: string, type: string): void {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND type = ?').run(
        messageId,
        userId,
        type
    );
}

export function getLeaderboard(type: string): { messageId: string; count: number }[] {
    return db
        .prepare(
            `
        SELECT message_id, COUNT(*) as count
        FROM reactions
        WHERE type = ?
        GROUP BY message_id
        ORDER BY count DESC
    `
        )
        .all(type) as { messageId: string; count: number }[];
}
