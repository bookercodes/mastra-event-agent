import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { getLumaEvent, updateLumaEvent, type LumaUpdateEventInput } from '../../../lib/luma/client';
import { uploadLumaImageFromRemoteUrl } from '../../../lib/luma/images';
import { upsertWorkshopFromLumaEvent } from '../../../lib/sanity/workshops';

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
  customDescription: string
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

function getCustomDescription(description: string): string {
  return description.split('\n---\n**Hosted by**\n', 1)[0].trim();
}

const updateWorkshopTool = createTool({
  id: 'update-workshop',
  description: 'Update a workshop in Luma and Sanity using a complete, non-null snapshot of its current values plus any requested changes',
  requireApproval: true,
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event to update'),
    title: z.string().min(1).describe('Final workshop title; pass the existing title when unchanged. Never null'),
    hosts: z.array(hostSchema).min(1).describe('Complete final array of hosts; pass the existing hosts from get-luma-event or message history when unchanged. Never null'),
    description: z.string().describe('Final custom description body, without the generated Hosted by section; pass the existing customDescription from get-luma-event when unchanged. Never null'),
    startAt: z.string().min(1).describe('Final start date and time in ISO 8601 format; pass the existing startAt when unchanged. For weekly workshops, use 17:00 Europe/London local time (DST-aware). Never null'),
    duration: z.number().positive().describe('Final duration in minutes; pass the existing duration from get-luma-event when unchanged. Never null'),
    coverImageUrl: z.string().describe('Final cover image URL; pass the existing coverUrl when unchanged, or an empty string only when the event has no cover. Never null'),
  }),
  outputSchema: z.object({
    eventId: z.string().describe('Luma API ID for the event'),
    eventUrl: z.string().describe('Public URL for the event'),
    updatedFields: z.array(z.string()).describe('List of fields that were updated'),
    sanityDocId: z.string().optional().describe('Sanity document ID created or updated for this workshop'),
    sanityAction: z.enum(['created', 'updated']).optional().describe('Whether the related Sanity workshop doc was created or updated'),
  }),
  execute: async ({ eventId, title, hosts, description, startAt, duration, coverImageUrl }) => {
    const currentEvent = await getLumaEvent(eventId);
    const updatePayload: LumaUpdateEventInput = {};
    const updatedFields: string[] = [];

    if (title !== currentEvent.name) {
      updatePayload.name = title;
      updatedFields.push('title');
    }

    const fullDescription = buildDescription(hosts, getCustomDescription(description));
    if (fullDescription !== (currentEvent.description_md || '')) {
      updatePayload.description_md = fullDescription;
      updatedFields.push('description', 'hosts');
    }

    const startDate = new Date(startAt);
    if (!Number.isFinite(startDate.getTime())) {
      throw new Error(`Invalid startAt value: ${startAt}`);
    }

    const nextStartAt = startDate.toISOString();
    const nextEndAt = addMinutes(startDate, duration).toISOString();
    if (nextStartAt !== currentEvent.start_at) {
      updatePayload.start_at = nextStartAt;
      updatedFields.push('startAt');
    }

    if (nextEndAt !== currentEvent.end_at) {
      updatePayload.end_at = nextEndAt;
      updatedFields.push('duration');
    }

    if (coverImageUrl && coverImageUrl !== currentEvent.cover_url) {
      updatePayload.cover_url = await uploadLumaImageFromRemoteUrl(coverImageUrl);
      updatedFields.push('coverImage');
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error('No fields changed. Pass the current event values and at least one requested change.');
    }

    await updateLumaEvent(eventId, updatePayload);
    const event = await getLumaEvent(eventId);
    const sanitySync = await upsertWorkshopFromLumaEvent(event, hosts);

    return {
      eventId,
      eventUrl: event.url,
      updatedFields,
      sanityDocId: sanitySync.docId,
      sanityAction: sanitySync.action,
    };
  },
});

export default updateWorkshopTool;
