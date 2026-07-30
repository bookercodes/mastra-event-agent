import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listLumaEvents } from '../../../lib/luma/client';

const listLumaEventsTool = createTool({
  id: 'list-luma-events',
  description: 'List the most recent Luma calendar events, newest first. There is no fixed time cutoff unless afterDate is provided; the default response contains the latest 50 events.',
  inputSchema: z.object({
    afterDate: z.string().optional().describe('Only return events after this ISO 8601 date'),
    limit: z.number().positive().default(50).describe('Maximum number of newest events to return (default: 50). Increase this when truncated is true and an older event may match'),
  }),
  outputSchema: z.object({
    events: z.array(z.object({
      eventId: z.string(),
      title: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      url: z.string(),
    })),
    totalEvents: z.number().describe('Total events Luma returned before applying limit'),
    truncated: z.boolean().describe('Whether older events were omitted by limit'),
    newestReturnedAt: z.string().optional().describe('Start time of the newest returned event'),
    oldestReturnedAt: z.string().optional().describe('Start time of the oldest returned event; a missing event may be older when truncated is true'),
  }),
  execute: async ({ afterDate, limit }) => {
    const events = await listLumaEvents(afterDate);
    const sortedEvents = events.sort(
      (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime(),
    );
    const latestEvents = sortedEvents.slice(0, limit);

    return {
      events: latestEvents.map(event => ({
        eventId: event.api_id,
        title: event.name,
        startAt: event.start_at,
        endAt: event.end_at,
        url: event.url,
      })),
      totalEvents: sortedEvents.length,
      truncated: sortedEvents.length > latestEvents.length,
      newestReturnedAt: latestEvents.at(0)?.start_at,
      oldestReturnedAt: latestEvents.at(-1)?.start_at,
    };
  },
});

export default listLumaEventsTool;
