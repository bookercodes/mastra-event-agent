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

const updateWorkshopTool = createTool({
  id: 'update-workshop',
  description: 'Update a workshop in Luma, then update its corresponding workshop document in Sanity',
  requireApproval: true,
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event to update'),
    title: z.string().optional().describe('New workshop title'),
    hosts: z.array(hostSchema).optional().describe('New array of hosts for the workshop'),
    description: z.string().optional().describe('New custom description body'),
    startAt: z.string().optional().describe('New start date and time in ISO 8601 format; for weekly workshops, use 17:00 Europe/London local time (DST-aware)'),
    duration: z.number().optional().describe('New duration in minutes'),
    coverImageUrl: z.string().optional().describe('URL to a new image to use as the event cover'),
  }),
  outputSchema: z.object({
    eventId: z.string().describe('Luma API ID for the event'),
    eventUrl: z.string().describe('Public URL for the event'),
    updatedFields: z.array(z.string()).describe('List of fields that were updated'),
    sanityDocId: z.string().optional().describe('Sanity document ID created or updated for this workshop'),
    sanityAction: z.enum(['created', 'updated']).optional().describe('Whether the related Sanity workshop doc was created or updated'),
  }),
  execute: async ({ eventId, title, hosts, description, startAt, duration, coverImageUrl }) => {
    const updatePayload: LumaUpdateEventInput = {};
    const updatedFields: string[] = [];

    if (title !== undefined) {
      updatePayload.name = title;
      updatedFields.push('title');
    }

    if (hosts !== undefined || description !== undefined) {
      // If either hosts or description is provided, we need to rebuild the full description
      // For simplicity, we require hosts if description needs to be updated
      if (hosts !== undefined) {
        updatePayload.description_md = buildDescription(hosts, description);
        updatedFields.push('description');
        if (!updatedFields.includes('hosts')) {
          updatedFields.push('hosts');
        }
      } else if (description !== undefined) {
        // Description without hosts - just update the description part
        // Note: This will lose the hosts section formatting. Ideally hosts should always be provided.
        updatePayload.description_md = description;
        updatedFields.push('description');
      }
    }

    if (startAt !== undefined) {
      const startDate = new Date(startAt);
      updatePayload.start_at = startDate.toISOString();
      updatedFields.push('startAt');

      if (duration !== undefined) {
        const endDate = addMinutes(startDate, duration);
        updatePayload.end_at = endDate.toISOString();
        updatedFields.push('duration');
      }
    } else if (duration !== undefined) {
      // Duration provided but no startAt - we'd need to fetch current start time
      // For now, just note that duration was requested but couldn't be updated without startAt
      console.warn('Duration update requires startAt to be provided as well');
    }

    if (coverImageUrl !== undefined) {
      updatePayload.cover_url = await uploadLumaImageFromRemoteUrl(coverImageUrl);
      updatedFields.push('coverImage');
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error('No fields to update. Provide at least one field to change.');
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
