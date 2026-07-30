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
type EditableWorkshopField = 'title' | 'description' | 'shortDescription' | 'eventDate' | 'duration' | 'lumaUrl';

const changeSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('title'), value: z.string().min(1) }),
  z.object({ field: z.literal('description'), value: z.string() }),
  z.object({ field: z.literal('shortDescription'), value: z.string() }),
  z.object({ field: z.literal('eventDate'), value: z.iso.datetime() }),
  z.object({ field: z.literal('duration'), value: z.string().min(1) }),
  z.object({ field: z.literal('lumaUrl'), value: z.union([z.url(), z.literal('')]) }),
]);

async function getWorkshop(documentId: string): Promise<SanityWorkshop | null> {
  const client = getSanityClient();
  const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
  const params: QueryParams = { documentId, docType };

  return client.fetch<SanityWorkshop | null, QueryParams>(
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
}

const updateSanityWorkshopTool = createTool({
  id: 'update-sanity-workshop',
  description: 'Update only a published Sanity workshop document without changing Luma. Requires a current revision from get-sanity-workshop and patches only explicitly listed fields.',
  requireApproval: true,
  inputSchema: z.object({
    documentId: z.string().min(1).describe('Sanity workshop document ID'),
    expectedRevision: z.string().min(1).describe('Current revision returned by get-sanity-workshop; prevents overwriting a newer edit'),
    changes: z.array(changeSchema).min(1).describe('Fields to patch in Sanity. Every value is required and non-null; fields not listed remain unchanged'),
  }),
  outputSchema: z.object({
    workshop: sanityWorkshopSchema,
    updatedFields: z.array(z.string()),
  }),
  execute: async ({ documentId, expectedRevision, changes }) => {
    const client = getSanityClient();
    const current = await getWorkshop(documentId);
    if (!current) {
      throw new Error(`Published Sanity workshop not found: ${documentId}`);
    }

    if (current.revision !== expectedRevision) {
      throw new Error(`Sanity workshop ${documentId} changed since it was read. Call get-sanity-workshop again before updating.`);
    }

    const currentValues: Record<EditableWorkshopField, string> = {
      title: current.title,
      description: current.description,
      shortDescription: current.shortDescription,
      eventDate: current.eventDate,
      duration: current.duration,
      lumaUrl: current.lumaUrl,
    };
    const changedValues: Partial<Record<EditableWorkshopField, string>> = {};

    for (const change of changes) {
      if (change.value !== currentValues[change.field]) {
        changedValues[change.field] = change.value;
      }
    }

    const updatedFields = Object.keys(changedValues);
    if (updatedFields.length === 0) {
      throw new Error('No Sanity fields changed.');
    }

    await client
      .patch(documentId)
      .ifRevisionId(expectedRevision)
      .set(changedValues)
      .commit();

    const workshop = await getWorkshop(documentId);
    if (!workshop) {
      throw new Error(`Sanity workshop disappeared after update: ${documentId}`);
    }

    return { workshop, updatedFields };
  },
});

export default updateSanityWorkshopTool;
