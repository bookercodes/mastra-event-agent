import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getLumaEvent } from '../../../lib/luma/client';
import { GENERATED_HOSTS_SEPARATOR, getCustomDescription } from '../../../lib/luma/descriptions';

const hostSchema = z.object({
  name: z.string(),
  area: z.string().optional(),
  company: z.string().optional(),
  xHandle: z.string().optional(),
  website: z.string().optional(),
});

function getHosts(description: string): z.infer<typeof hostSchema>[] {
  const hostsSection = description.split(GENERATED_HOSTS_SEPARATOR)[1];
  if (!hostsSection) {
    return [];
  }

  const hosts: z.infer<typeof hostSchema>[] = [];
  for (const line of hostsSection.split('\n')) {
    if (line.startsWith('- ')) {
      const [name, area, ...companyParts] = line.slice(2).split(', ');
      hosts.push({
        name,
        ...(area && { area }),
        ...(companyParts.length > 0 && { company: companyParts.join(', ') }),
      });
      continue;
    }

    const currentHost = hosts.at(-1);
    const url = line.trim().replace(/^- /, '');
    if (!currentHost || !url.startsWith('http')) {
      continue;
    }

    const xMatch = url.match(/^https?:\/\/(?:www\.)?x\.com\/([^/?#]+)/i);
    if (xMatch) {
      currentHost.xHandle = xMatch[1];
    } else {
      currentHost.website = url;
    }
  }

  return hosts;
}

function getDurationMinutes(startAt: string, endAt: string): number {
  return Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
}

const getLumaEventTool = createTool({
  id: 'get-luma-event',
  description: 'Get the complete reusable values of a Luma event. Always use this before update-workshop and pass its current values through for fields the user did not change.',
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event'),
  }),
  outputSchema: z.object({
    eventId: z.string(),
    title: z.string(),
    description: z.string().describe('Full Luma Markdown description, including the generated host section'),
    customDescription: z.string().describe('Description body without the generated host section or recording notice; pass this to update-workshop'),
    hosts: z.array(hostSchema).describe('Hosts parsed from the generated host section; use message history if this is empty or incomplete'),
    startAt: z.string(),
    endAt: z.string(),
    duration: z.number().describe('Event duration in minutes; pass this to update-workshop when unchanged'),
    url: z.string(),
    coverUrl: z.string().describe('Current cover URL, or an empty string when the event has no cover'),
    meetingUrl: z.string().describe('Current virtual meeting URL, or an empty string when the event has no meeting URL'),
    timezone: z.string(),
  }),
  execute: async ({ eventId }) => {
    const event = await getLumaEvent(eventId);
    const description = event.description_md || '';

    return {
      eventId: event.api_id,
      title: event.name,
      description,
      customDescription: getCustomDescription(description),
      hosts: getHosts(description),
      startAt: event.start_at,
      endAt: event.end_at,
      duration: getDurationMinutes(event.start_at, event.end_at),
      url: event.url,
      coverUrl: event.cover_url || '',
      meetingUrl: event.meeting_url || '',
      timezone: event.timezone || 'Europe/London',
    };
  },
});

export default getLumaEventTool;
