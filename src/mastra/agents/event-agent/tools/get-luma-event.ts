import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getLumaEvent } from '../../../lib/luma/client';

const getLumaEventTool = createTool({
  id: 'get-luma-event',
  description: 'Get full details of a Luma event including its description. Use this before updating an event to see what information is already there.',
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event'),
  }),
  outputSchema: z.object({
    eventId: z.string(),
    title: z.string(),
    description: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    url: z.string(),
    coverUrl: z.string().optional(),
    timezone: z.string(),
  }),
  execute: async ({ eventId }) => {
    const event = await getLumaEvent(eventId);

    return {
      eventId: event.api_id,
      title: event.name,
      description: event.description_md || '',
      startAt: event.start_at,
      endAt: event.end_at,
      url: event.url,
      coverUrl: event.cover_url,
      timezone: event.timezone || 'Europe/London',
    };
  },
});

export default getLumaEventTool;
