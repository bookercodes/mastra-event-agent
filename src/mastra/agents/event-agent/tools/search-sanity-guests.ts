import { createTool } from '@mastra/core/tools';
import type { QueryParams } from '@sanity/client';
import { z } from 'zod';
import { getSanityClient } from '../../../lib/sanity/client';

const guestSchema = z.object({
  _id: z.string(),
  name: z.string(),
  area: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  xHandle: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

type Guest = z.infer<typeof guestSchema>;

const searchSanityGuestsTool = createTool({
  id: 'search-sanity-guests',
  description: 'Search for guests in Sanity CMS by name or partial name',
  inputSchema: z.object({
    query: z.string().describe('Name or partial name to search for'),
  }),
  outputSchema: z.object({
    guests: z.array(guestSchema),
  }),
  execute: async ({ query }) => {
    const client = getSanityClient();
    const params: QueryParams = { searchTerm: `${query}*` };
    const guests = await client.fetch<Guest[], QueryParams>(
      `*[_type == "guest" && name match $searchTerm]{
        _id,
        name,
        "area": coalesce(area, role, jobTitle, title),
        company,
        "slug": slug.current,
        xHandle,
        website
      }`,
      params,
    );

    return { guests };
  },
});

export default searchSanityGuestsTool;
