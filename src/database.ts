import { count, desc, eq } from 'drizzle-orm';

import { drizzleDb } from './drizzle';
import { contests, reactions } from './schema';

export async function saveContest(startDate: string, endDate: string): Promise<void> {
    await drizzleDb.insert(contests).values({ startDate, endDate }).execute();
}

export async function getCurrentContest(): Promise<{ startDate: string; endDate: string } | null> {
    const result = await drizzleDb.select(contests).orderBy(desc(contests.id)).limit(1).run();
    return result.length > 0 ? result[0] : null;
}

export async function saveReaction(messageId: string, userId: string, type: string): Promise<void> {
    await drizzleDb
        .insert(reactions)
        .values({ messageId, userId, type })
        .onConflict('ignore')
        .run();
}

export async function removeReaction(
    messageId: string,
    userId: string,
    type: string
): Promise<void> {
    await drizzleDb
        .delete(reactions)
        .where(
            eq(reactions.messageId, messageId),
            eq(reactions.userId, userId),
            eq(reactions.type, type)
        )
        .run();
}

export async function getLeaderboard(
    type: string
): Promise<{ messageId: string; count: number }[]> {
    const result = await drizzleDb
        .select(reactions.messageId, count(reactions.messageId).as('count'))
        .where(eq(reactions.type, type))
        .groupBy(reactions.messageId)
        .orderBy(desc('count'))
        .run();
    return result;
}
