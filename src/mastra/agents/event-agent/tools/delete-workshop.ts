import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { deleteLumaEvent, getLumaEvent, isLumaNotFoundError } from '../../../lib/luma/client';
import { deleteWorkshopFromSanity } from '../../../lib/sanity/workshops';

const deleteWorkshopTool = createTool({
  id: 'delete-workshop',
  description: 'Delete a workshop in Luma and remove its corresponding workshop document in Sanity',
  requireApproval: true,
  inputSchema: z.object({
    workshopName: z.string().optional().describe('Optional workshop name for UI visibility only'),
    eventId: z.string().describe('Luma API ID of the event to delete'),
    sanityDocId: z.string().optional().describe('Optional Sanity workshop document ID to delete directly'),
    shouldRefund: z.boolean().optional().describe('Whether to refund paid guests when canceling a paid Luma event'),
  }),
  outputSchema: z.object({
    eventId: z.string(),
    eventTitle: z.string().optional(),
    lumaDeleted: z.boolean(),
    sanityDeleted: z.boolean(),
    sanityDocId: z.string().optional(),
  }),
  execute: async ({ eventId, sanityDocId, shouldRefund }) => {
    let eventTitle: string | undefined;
    let eventUrl: string | undefined;

    try {
      const event = await getLumaEvent(eventId);
      eventTitle = event.name;
      eventUrl = event.url;
    } catch (error) {
      if (isLumaNotFoundError(error)) {
        throw new Error(
          `Luma event ${eventId} was not found during preflight lookup, so Sanity was not deleted. Confirm you are using the Luma API ID, not the public URL slug.`,
        );
      }

      throw error;
    }

    await deleteLumaEvent(eventId, { shouldRefund });

    const sanityResult = await deleteWorkshopFromSanity({
      docId: sanityDocId,
      eventUrl,
    });

    return {
      eventId,
      eventTitle,
      lumaDeleted: true,
      sanityDeleted: sanityResult.deleted,
      sanityDocId: sanityResult.docId,
    };
  },
});

export default deleteWorkshopTool;
