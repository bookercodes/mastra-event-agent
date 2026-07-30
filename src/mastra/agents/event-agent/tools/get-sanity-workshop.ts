import { createTool } from '@mastra/core/tools';
import type { QueryParams } from '@sanity/client';
import { z } from 'zod';
import { getSanityClient } from '../../../lib/sanity/client';

const sanityWorkshopSchema = z.object({
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

type SanityWorkshop = z.infer<typeof sanityWorkshopSchema>;

const getSanityWorkshopTool = createTool({
  id: 'get-sanity-workshop',
  description: 'Get one published Sanity workshop document by ID. Always use this immediately before update-sanity-workshop so the update has a current revision and values.',
  inputSchema: z.object({
    documentId: z.string().min(1).describe('Sanity workshop document ID'),
  }),
  outputSchema: sanityWorkshopSchema,
  execute: async ({ documentId }) => {
    const client = getSanityClient();
    const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
    const params: QueryParams = { documentId, docType };
    const workshop = await client.fetch<SanityWorkshop | null, QueryParams>(
      `*[
        _id == $documentId &&
        _type == $docType &&
        !(_id in path("drafts.**"))
      ][0]{
        "documentId": _id,
        "title": coalesce(title, ""),
        "description": coalesce(description, ""),
        "shortDescription": coalesce(shortDescription, ""),
        "eventDate": coalesce(eventDate, ""),
        "duration": coalesce(duration, ""),
        "lumaUrl": coalesce(lumaUrl, ""),
        "revision": _rev,
        "updatedAt": _updatedAt
      }`,
      params,
    );

    if (!workshop) {
      throw new Error(`Published Sanity workshop not found: ${documentId}`);
    }

    return workshop;
  },
});

export default getSanityWorkshopTool;
