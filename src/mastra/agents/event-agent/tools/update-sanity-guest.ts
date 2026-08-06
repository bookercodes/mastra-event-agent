import { createTool } from '@mastra/core/tools';
import type { QueryParams } from '@sanity/client';
import { z } from 'zod';
import { getSanityClient } from '../../../lib/sanity/client';

const guestSchema = z.object({
  _id: z.string(),
  revision: z.string(),
  name: z.string(),
  area: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  xHandle: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

type Guest = z.infer<typeof guestSchema>;

async function getGuest(guestId: string): Promise<Guest | null> {
  const client = getSanityClient();
  const params: QueryParams = { guestId };

  return client.fetch<Guest | null, QueryParams>(
    `*[_id == $guestId && _type == "guest"][0]{
      _id,
      "revision": _rev,
      name,
      area,
      title,
      company,
      "slug": slug.current,
      xHandle,
      website
    }`,
    params,
  );
}

const updateSanityGuestTool = createTool({
  id: 'update-sanity-guest',
  description: 'Update the area and/or title of an existing Sanity guest using the current revision returned by search-sanity-guests',
  requireApproval: true,
  inputSchema: z.object({
    guestId: z.string().min(1).describe('Sanity guest document ID'),
    expectedRevision: z.string().min(1).describe('Current revision returned by search-sanity-guests'),
    area: z.string().min(1).optional().describe('Broad functional area, such as Engineering or Marketing'),
    title: z.string().min(1).optional().describe('Specific job title, such as Co-Founder and CTO'),
  }).refine(
    ({ area, title }) => area !== undefined || title !== undefined,
    { message: 'Provide area, title, or both' },
  ),
  outputSchema: z.object({
    guest: guestSchema,
    updatedFields: z.array(z.enum(['area', 'title'])),
  }),
  execute: async ({ guestId, expectedRevision, area, title }) => {
    const client = getSanityClient();
    const current = await getGuest(guestId);
    if (!current) {
      throw new Error(`Sanity guest not found: ${guestId}`);
    }

    if (current.revision !== expectedRevision) {
      throw new Error(`Sanity guest ${guestId} changed since it was read. Search for the guest again before updating.`);
    }

    const changedValues: Partial<Record<'area' | 'title', string>> = {};
    if (area !== undefined && area !== current.area) {
      changedValues.area = area;
    }
    if (title !== undefined && title !== current.title) {
      changedValues.title = title;
    }

    const updatedFields = Object.keys(changedValues) as ('area' | 'title')[];
    if (updatedFields.length === 0) {
      throw new Error('No Sanity guest fields changed.');
    }

    await client
      .patch(guestId)
      .ifRevisionId(expectedRevision)
      .set(changedValues)
      .commit();

    const guest = await getGuest(guestId);
    if (!guest) {
      throw new Error(`Sanity guest disappeared after update: ${guestId}`);
    }

    return { guest, updatedFields };
  },
});

export default updateSanityGuestTool;
