import { pgTable, serial, text } from 'drizzle-orm/pg-core';

export const contests = pgTable('contests', {
    id: serial('id').primaryKey().notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
});

export const reactions = pgTable('reactions', {
    messageId: text('message_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
});

