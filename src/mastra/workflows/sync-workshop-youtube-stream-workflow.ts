import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { findWorkshopForYoutubeSync, updateWorkshopYoutubeUrl } from '../lib/sanity/workshops';
import { fetchYouTubeStreams, findMatchingYouTubeStream } from '../lib/youtube/streams';

const syncWorkshopYoutubeStreamInputSchema = z.object({
});

const workshopOutputSchema = z.object({
  docId: z.string(),
  title: z.string(),
  eventDate: z.string(),
  lumaUrl: z.string().optional(),
});

const youtubeOutputSchema = z.object({
  videoId: z.string(),
  url: z.string(),
  title: z.string(),
  score: z.number(),
  reason: z.string(),
});

const youtubeStreamSchema = z.object({
  videoId: z.string(),
  url: z.string(),
  title: z.string(),
  timestamp: z.string().optional(),
  liveStatus: z.string().optional(),
});

const syncWorkshopYoutubeStreamOutputSchema = z.object({
  status: z.enum(['updated', 'unchanged', 'skipped', 'not-found']),
  message: z.string(),
  workshop: workshopOutputSchema.nullable(),
  youtube: youtubeOutputSchema.nullable(),
});

const syncStateSchema = z.object({
  status: z.enum(['ready', 'matched', 'updated', 'unchanged', 'skipped', 'not-found']),
  message: z.string(),
  workshop: workshopOutputSchema.extend({
    existingYoutubeUrl: z.string().optional(),
  }).nullable(),
  streams: z.array(youtubeStreamSchema),
  youtube: youtubeOutputSchema.nullable(),
});

type SyncState = z.infer<typeof syncStateSchema>;

function toFinalOutput(state: SyncState): z.infer<typeof syncWorkshopYoutubeStreamOutputSchema> {
  const status = state.status === 'matched' || state.status === 'ready' ? 'skipped' : state.status;
  const workshop = state.workshop
    ? {
        docId: state.workshop.docId,
        title: state.workshop.title,
        eventDate: state.workshop.eventDate,
        ...(state.workshop.lumaUrl && { lumaUrl: state.workshop.lumaUrl }),
      }
    : null;

  return {
    status,
    message: state.message,
    workshop,
    youtube: state.youtube,
  };
}

const findLatestPastWorkshopStep = createStep({
  id: 'find-latest-past-workshop',
  description: 'Find the most recent workshop whose event date has already passed.',
  inputSchema: syncWorkshopYoutubeStreamInputSchema,
  outputSchema: syncStateSchema,
  execute: async () => {
    const workshop = await findWorkshopForYoutubeSync();

    if (!workshop) {
      return {
        status: 'not-found' as const,
        message: 'No past workshop was found.',
        workshop: null,
        streams: [],
        youtube: null,
      };
    }

    return {
      status: 'ready' as const,
      message: `Found latest past workshop: ${workshop.title}.`,
      workshop: {
        docId: workshop._id,
        title: workshop.title,
        eventDate: workshop.eventDate,
        ...(workshop.lumaUrl && { lumaUrl: workshop.lumaUrl }),
        ...(workshop.youtubeUrl && { existingYoutubeUrl: workshop.youtubeUrl }),
      },
      streams: [],
      youtube: null,
    };
  },
});

const fetchRecentStreamsStep = createStep({
  id: 'fetch-recent-youtube-streams',
  description: 'Fetch the latest streams from the Mastra YouTube channel.',
  inputSchema: syncStateSchema,
  outputSchema: syncStateSchema,
  execute: async ({ inputData }) => {
    if (!inputData.workshop) {
      return inputData;
    }

    const streams = await fetchYouTubeStreams();

    return {
      ...inputData,
      message: `Fetched ${streams.length} recent YouTube stream${streams.length === 1 ? '' : 's'}.`,
      streams,
    };
  },
});

const matchWorkshopStreamStep = createStep({
  id: 'match-workshop-youtube-stream',
  description: 'Match the workshop title against recent YouTube stream titles.',
  inputSchema: syncStateSchema,
  outputSchema: syncStateSchema,
  execute: async ({ inputData }) => {
    if (!inputData.workshop) {
      return inputData;
    }

    const match = findMatchingYouTubeStream({
      title: inputData.workshop.title,
      streams: inputData.streams,
    });

    if (!match) {
      return {
        ...inputData,
        status: 'skipped' as const,
        message: `No confident YouTube stream title match was found for "${inputData.workshop.title}".`,
        youtube: null,
      };
    }

    return {
      ...inputData,
      status: 'matched' as const,
      message: `Matched YouTube stream: ${match.stream.title}.`,
      youtube: {
        videoId: match.stream.videoId,
        url: match.stream.url,
        title: match.stream.title,
        score: match.score,
        reason: match.reason,
      },
    };
  },
});

const updateSanityYoutubeUrlStep = createStep({
  id: 'update-sanity-youtube-url',
  description: 'Write the matched YouTube URL to the workshop document in Sanity.',
  inputSchema: syncStateSchema,
  outputSchema: syncWorkshopYoutubeStreamOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData.workshop || !inputData.youtube) {
      return toFinalOutput(inputData);
    }

    if (inputData.workshop.existingYoutubeUrl === inputData.youtube.url) {
      return toFinalOutput({
        ...inputData,
        status: 'unchanged' as const,
        message: 'Sanity already has the matching YouTube stream URL.',
      });
    }

    await updateWorkshopYoutubeUrl({
      docId: inputData.workshop.docId,
      youtubeUrl: inputData.youtube.url,
    });

    return toFinalOutput({
      ...inputData,
      status: 'updated' as const,
      message: 'Updated Sanity with the matching YouTube stream URL.',
    });
  },
});

export const syncWorkshopYoutubeStreamWorkflow = createWorkflow({
  id: 'sync-workshop-youtube-stream',
  inputSchema: syncWorkshopYoutubeStreamInputSchema,
  outputSchema: syncWorkshopYoutubeStreamOutputSchema,
})
  .then(findLatestPastWorkshopStep)
  .then(fetchRecentStreamsStep)
  .then(matchWorkshopStreamStep)
  .then(updateSanityYoutubeUrlStep)
  .commit();
