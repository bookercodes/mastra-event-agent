import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { getLumaEvent, updateLumaEvent, type LumaUpdateEventInput } from '../../../lib/luma/client';
import { buildLumaDescription } from '../../../lib/luma/descriptions';
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

const updateWorkshopTool = createTool({
  id: 'update-workshop',
  description: 'Update a workshop or webinar event in Luma and its corresponding Sanity document using a complete, non-null snapshot of current values plus requested changes',
  requireApproval: true,
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event to update'),
    title: z.string().min(1).describe('Final event title; pass the existing title when unchanged. Never null'),
    hosts: z.array(hostSchema).min(1).describe('Complete final array of event hosts; pass the existing hosts from get-luma-event or message history when unchanged. Never null'),
    description: z.string().describe('Final custom description body only, without the generated Hosted by section or recording notice; pass the existing customDescription from get-luma-event when unchanged. Never null'),
    startAt: z.string().min(1).describe('Final start date and time in ISO 8601 format; pass the existing startAt when unchanged. Use 17:00 Europe/London local time (DST-aware), normally Tuesday for webinars and Thursday for workshops. Never null'),
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

    const fullDescription = buildLumaDescription(hosts, description);
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
