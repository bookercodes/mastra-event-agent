import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSanityClient } from '../../../lib/sanity/client';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

const createSanityGuestTool = createTool({
  id: 'create-sanity-guest',
  description: 'Create a new guest in Sanity CMS',
  requireApproval: true,
  inputSchema: z.object({
    name: z.string().describe('Guest name'),
    area: z.string().optional().describe('Broad functional area, such as Engineering or Marketing'),
    title: z.string().optional().describe('Specific job title, such as Co-Founder and CTO'),
    company: z.string().optional().describe('Company or organization'),
    xHandle: z.string().optional().describe('X (Twitter) handle without @'),
    website: z.string().optional().describe('Personal or company website URL'),
  }),
  outputSchema: z.object({
    _id: z.string(),
    name: z.string(),
    slug: z.string(),
    area: z.string().optional(),
    title: z.string().optional(),
  }),
  execute: async ({ name, area, title, company, xHandle, website }) => {
    const client = getSanityClient();
    const slug = toSlug(name);

    const doc = await client.create({
      _type: 'guest',
      name,
      slug: { _type: 'slug', current: slug },
      ...(area && { area }),
      ...(title && { title }),
      ...(company && { company }),
      ...(xHandle && { xHandle }),
      ...(website && { website }),
    });

    return {
      _id: doc._id,
      name,
      slug,
      ...(area && { area }),
      ...(title && { title }),
    };
  },
});

export default createSanityGuestTool;
