import { createTool } from '@mastra/core/tools';
import type { QueryParams } from '@sanity/client';
import { z } from 'zod';
import { getSanityClient } from '../../../lib/sanity/client';

const workshopSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  description: z.string(),
  shortDescription: z.string(),
  eventDate: z.string(),
  duration: z.string(),
  lumaUrl: z.string(),
  revision: z.string(),
  updatedAt: z.string(),
});

type Workshop = z.infer<typeof workshopSchema>;

const listSanityWorkshopsTool = createTool({
  id: 'list-sanity-workshops',
  description: 'Read-only search and listing for published Sanity workshop documents. Use it to inspect existing workshops or compare Sanity with Luma without making changes.',
  inputSchema: z.object({
    query: z.string().optional().describe('Optional text to match against title, description, or short description'),
    lumaUrl: z.string().optional().describe('Optional exact Luma URL to match'),
    afterDate: z.string().optional().describe('Optional inclusive lower bound for eventDate in ISO 8601 format'),
    beforeDate: z.string().optional().describe('Optional inclusive upper bound for eventDate in ISO 8601 format'),
    limit: z.number().int().positive().max(250).default(100).describe('Maximum number of workshops to return (default: 100, maximum: 250)'),
  }),
  outputSchema: z.object({
    workshops: z.array(workshopSchema),
    totalWorkshops: z.number().describe('Total matching published workshop documents before applying limit'),
    truncated: z.boolean().describe('Whether additional matching workshop documents were omitted by limit'),
  }),
  execute: async ({ query, lumaUrl, afterDate, beforeDate, limit }) => {
    const client = getSanityClient();
    const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
    const filters = [
      '_type == $docType',
      '!(_id in path("drafts.**"))',
    ];
    const params: QueryParams = { docType };

    if (query) {
      filters.push('(title match $searchTerm || description match $searchTerm || shortDescription match $searchTerm)');
      params.searchTerm = `*${query}*`;
    }

    if (lumaUrl) {
      filters.push('lumaUrl == $lumaUrl');
      params.lumaUrl = lumaUrl;
    }

    if (afterDate) {
      filters.push('eventDate >= $afterDate');
      params.afterDate = afterDate;
    }

    if (beforeDate) {
      filters.push('eventDate <= $beforeDate');
      params.beforeDate = beforeDate;
    }

    const filter = filters.join(' && ');
    const result = await client.fetch<{
      workshops: Workshop[];
      totalWorkshops: number;
    }, QueryParams>(
      `{
        "workshops": *[${filter}] | order(eventDate desc)[0...${limit}]{
          "documentId": _id,
          "title": coalesce(title, ""),
          "description": coalesce(description, ""),
          "shortDescription": coalesce(shortDescription, ""),
          "eventDate": coalesce(eventDate, ""),
          "duration": coalesce(duration, ""),
          "lumaUrl": coalesce(lumaUrl, ""),
          "revision": _rev,
          "updatedAt": _updatedAt
        },
        "totalWorkshops": count(*[${filter}])
      }`,
      params,
    );

    return {
      workshops: result.workshops,
      totalWorkshops: result.totalWorkshops,
      truncated: result.totalWorkshops > result.workshops.length,
    };
  },
});

export default listSanityWorkshopsTool;
