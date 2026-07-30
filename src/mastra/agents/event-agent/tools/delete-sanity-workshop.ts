import { createTool } from '@mastra/core/tools';
import type { QueryParams } from '@sanity/client';
import { z } from 'zod';
import { getSanityClient } from '../../../lib/sanity/client';

interface SanityWorkshopIdentity {
  documentId: string;
  title: string;
  revision: string;
}

async function getWorkshopIdentity(documentId: string): Promise<SanityWorkshopIdentity | null> {
  const client = getSanityClient();
  const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
  const params: QueryParams = { documentId, docType };

  return client.fetch<SanityWorkshopIdentity | null, QueryParams>(
    `*[
      _id == $documentId &&
      _type == $docType &&
      !(_id in path("drafts.**"))
    ][0]{
      "documentId": _id,
      "title": coalesce(title, ""),
      "revision": _rev
    }`,
    params,
  );
}

const deleteSanityWorkshopTool = createTool({
  id: 'delete-sanity-workshop',
  description: 'Delete only a published Sanity workshop document without requiring or changing a Luma event. Requires the current title and revision from get-sanity-workshop.',
  requireApproval: true,
  inputSchema: z.object({
    documentId: z.string().min(1).describe('Sanity workshop document ID'),
    expectedTitle: z.string().min(1).describe('Current workshop title returned by get-sanity-workshop, shown for approval and checked before deletion'),
    expectedRevision: z.string().min(1).describe('Current revision returned by get-sanity-workshop; prevents deleting a document that changed after it was read'),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    title: z.string(),
    deleted: z.boolean(),
  }),
  execute: async ({ documentId, expectedTitle, expectedRevision }) => {
    const client = getSanityClient();
    const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
    const current = await getWorkshopIdentity(documentId);
    if (!current) {
      throw new Error(`Published Sanity workshop not found: ${documentId}`);
    }

    if (current.revision !== expectedRevision) {
      throw new Error(`Sanity workshop ${documentId} changed since it was read. Call get-sanity-workshop again before deleting.`);
    }

    if (current.title !== expectedTitle) {
      throw new Error(`Sanity workshop title changed from "${expectedTitle}" to "${current.title}". Confirm the document again before deleting.`);
    }

    const result = await client.delete(
      {
        query: `*[
          _id == $documentId &&
          _type == $docType &&
          _rev == $expectedRevision &&
          title == $expectedTitle &&
          !(_id in path("drafts.**"))
        ]`,
        params: { documentId, docType, expectedRevision, expectedTitle },
      },
      { returnFirst: false, returnDocuments: false },
    );

    if (!result.documentIds.includes(documentId)) {
      throw new Error(`Sanity workshop ${documentId} was not deleted because it changed before execution.`);
    }

    return {
      documentId,
      title: current.title,
      deleted: true,
    };
  },
});

export default deleteSanityWorkshopTool;
