import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listLumaEvents } from '../../../lib/luma/client';

const listLumaEventsTool = createTool({
  id: 'list-luma-events',
  description: 'List upcoming events from Luma calendar. Use this to find scheduled events and identify available dates.',
  inputSchema: z.object({
    afterDate: z.string().optional().describe('Only return events after this ISO 8601 date'),
    limit: z.number().default(50).describe('Maximum number of events to return (default: 50)'),
  }),
  outputSchema: z.object({
    events: z.array(z.object({
      eventId: z.string(),
      title: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      url: z.string(),
    })),
  }),
  execute: async ({ afterDate, limit }) => {
    const events = await listLumaEvents(afterDate);
    const latestEvents = events
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
      .slice(0, limit);

    return {
      events: latestEvents.map(event => ({
        eventId: event.api_id,
        title: event.name,
        startAt: event.start_at,
        endAt: event.end_at,
        url: event.url,
      })),
    };
  },
});

export default listLumaEventsTool;
