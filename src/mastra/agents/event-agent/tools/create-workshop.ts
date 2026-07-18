import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { createLumaEvent, getLumaEvent } from '../../../lib/luma/client';
import { uploadLumaImageFromRemoteUrl } from '../../../lib/luma/images';
import { upsertWorkshopFromLumaEvent } from '../../../lib/sanity/workshops';

const DEFAULT_COVER_IMAGE_URL = 'https://images.lumacdn.com/event-covers/g3/9cd7b6f5-3556-4a1b-8985-3cbdb27e3a33.png';

const hostSchema = z.object({
  guestId: z.string().optional().describe('Sanity guest document ID (recommended when available)'),
  name: z.string().describe('Host name'),
  area: z.string().optional().describe('Host role or area to show in Luma, without seniority (for example: Developer Experience, Customer Engineering)'),
  company: z.string().optional().describe('Company or organization'),
  xHandle: z.string().optional().describe('X (Twitter) handle without @'),
  website: z.string().optional().describe('Personal or company website URL'),
});

function buildHostsSection(hosts: z.infer<typeof hostSchema>[]): string {
  return hosts.map(host => {
    const hostDetails = [host.name, host.area, host.company].filter(Boolean).join(', ');
    const subItems: string[] = [];
    if (host.xHandle) {
      subItems.push(`  - https://x.com/${host.xHandle}`);
    }
    if (host.website) {
      subItems.push(`  - ${host.website}`);
    }
    const line = `- ${hostDetails}`;
    return subItems.length > 0 ? `${line}\n${subItems.join('\n')}` : line;
  }).join('\n');
}

function buildDescription(
  hosts: z.infer<typeof hostSchema>[],
  customDescription?: string
): string {
  const parts: string[] = [];

  if (customDescription) {
    parts.push(customDescription);
  }

  parts.push('');
  parts.push('---');
  parts.push('**Hosted by**');
  parts.push('');
  parts.push(buildHostsSection(hosts));
  parts.push('');
  parts.push('*Recording and code examples will be available to everyone who registers.*');

  return parts.join('\n');
}

const createWorkshopTool = createTool({
  id: 'create-workshop',
  description: 'Create a workshop in Luma, then create or update its corresponding workshop document in Sanity',
  requireApproval: true,
  inputSchema: z.object({
    title: z.string().describe('Workshop title'),
    hosts: z.array(hostSchema).min(1).describe('Array of hosts for the workshop'),
    description: z.string().optional().describe('Custom description body (hosts section is auto-generated)'),
    startAt: z.string().describe('Start date and time in ISO 8601 format; for weekly workshops, use 17:00 Europe/London local time (DST-aware)'),
    duration: z.number().default(60).describe('Duration in minutes (default: 60)'),
    coverImageUrl: z.string().optional().describe('URL to an image to use as the event cover'),
  }),
  outputSchema: z.object({
    eventId: z.string().describe('Luma API ID for the event'),
    eventUrl: z.string().describe('Public URL for the event'),
    sanityDocId: z.string().optional().describe('Sanity document ID created or updated for this workshop'),
    sanityAction: z.enum(['created', 'updated']).optional().describe('Whether the related Sanity workshop doc was created or updated'),
  }),
  execute: async ({ title, hosts, description, startAt, duration = 60, coverImageUrl }) => {
    const startDate = new Date(startAt);
    const endDate = addMinutes(startDate, duration);
    const fullDescription = buildDescription(hosts, description);

    console.log('Creating event with description:', fullDescription);

    let coverUrl: string;
    if (coverImageUrl) {
      coverUrl = await uploadLumaImageFromRemoteUrl(coverImageUrl);
    } else {
      coverUrl = DEFAULT_COVER_IMAGE_URL;
    }

    const meetingUrl = process.env.WORKSHOP_MEETING_URL;

    const lumaResult = await createLumaEvent({
      name: title,
      description_md: fullDescription,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      timezone: 'Europe/London',
      cover_url: coverUrl,
      visibility: 'public',
      meeting_url: meetingUrl,
      tint_color: '#D3D4D7',
      show_guest_list: true,
    });

    const event = await getLumaEvent(lumaResult.api_id);
    const sanitySync = await upsertWorkshopFromLumaEvent(event, hosts);

    return {
      eventId: lumaResult.api_id,
      eventUrl: event.url,
      sanityDocId: sanitySync.docId,
      sanityAction: sanitySync.action,
    };
  },
});

export default createWorkshopTool;
