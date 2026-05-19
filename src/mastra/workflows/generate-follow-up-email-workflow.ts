import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { followUpEmailAgent } from '../agents/follow-up-email-agent';
import {
  findLatestPastWorkshopForFollowUpEmail,
  findNextUpcomingWorkshopForFollowUpEmail,
} from '../lib/sanity/workshops';

const WORKSHOPS_SLIDES_URL = 'https://github.com/mastra-ai/workshops';
const MASTRA_X_URL = 'https://x.com/mastra';
const BOOKER_X_URL = 'https://x.com/bookercodes';

const generateFollowUpEmailInputSchema = z.object({});

const emailWorkshopSchema = z.object({
  docId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  eventDate: z.string(),
  lumaUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
});

const followUpContextSchema = z.object({
  latestWorkshop: emailWorkshopSchema.nullable(),
  nextWorkshop: emailWorkshopSchema.nullable(),
});

const generateFollowUpEmailOutputSchema = z.object({
  text: z.string(),
});

const followUpPromptSchema = z.object({
  prompt: z.string(),
});

function toEmailWorkshop(workshop: {
  _id: string;
  title: string;
  description?: string;
  shortDescription?: string;
  eventDate: string;
  lumaUrl?: string;
  youtubeUrl?: string;
} | undefined): z.infer<typeof emailWorkshopSchema> | null {
  if (!workshop) {
    return null;
  }

  return {
    docId: workshop._id,
    title: workshop.title,
    ...(workshop.description && { description: workshop.description }),
    ...(workshop.shortDescription && { shortDescription: workshop.shortDescription }),
    eventDate: workshop.eventDate,
    ...(workshop.lumaUrl && { lumaUrl: workshop.lumaUrl }),
    ...(workshop.youtubeUrl && { youtubeUrl: workshop.youtubeUrl }),
  };
}

function formatEventDay(eventDate: string): string {
  const date = new Date(eventDate);
  if (!Number.isFinite(date.getTime())) {
    return 'Next Thursday';
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/London',
  }).format(date);
}

function buildFollowUpPrompt(input: z.infer<typeof followUpContextSchema>): string {
  const latest = input.latestWorkshop;
  if (!latest) {
    return [
      'No past workshop was found.',
      'Return this exact text:',
      'No past workshop was found, so there is no follow-up email to generate yet.',
    ].join('\n');
  }

  const recordingUrl = latest.youtubeUrl || latest.lumaUrl || 'RECORDING_URL';
  const next = input.nextWorkshop;
  return [
    'Write the follow-up email copy.',
    '',
    'Use this data:',
    `- Latest workshop title: ${latest.title}`,
    `- Recording URL: ${recordingUrl}`,
    `- Slides URL: ${WORKSHOPS_SLIDES_URL}`,
    next
      ? [
          `- Next workshop title: ${next.title}`,
          `- Next workshop date: ${formatEventDay(next.eventDate)}`,
          next.shortDescription ? `- Next workshop short description: ${next.shortDescription}` : undefined,
          next.description ? `- Next workshop description: ${next.description}` : undefined,
          next.lumaUrl ? `- Next workshop URL: ${next.lumaUrl}` : undefined,
        ].filter(Boolean).join('\n')
      : '- Next workshop: none scheduled yet',
    `- Mastra X URL: ${MASTRA_X_URL}`,
    `- Alex Booker X URL: ${BOOKER_X_URL}`,
    '',
    'Write exactly one Markdown message. Keep it natural and copy-ready for Luma.',
    'The email is from Alex Booker, so refer to Alex as "me", not "Alex Booker".',
    'Thank people for registering. Do not assume they attended live.',
    'Avoid attendee-only phrases like "thanks for joining", "coming along", "tuning in", or "hanging out with us".',
    'Use the next workshop title and description to write a specific, compelling one-liner for the invite.',
    'Avoid stiff phrasing like "we\'re diving into [full workshop title]". Prefer a natural phrase with a short link such as **[join us next Thursday](url)**.',
    'Do not say "building alongside y\'all"; not every workshop is hands-on building.',
    'When asking people to follow the X accounts, put **[me](https://x.com/bookercodes)** before **[Mastra](https://x.com/mastra)**.',
    'Every link must be both bold and inline, like **[recording](https://example.com)**.',
    'Use contractions. Never write "you will"; write "you\'ll".',
  ].join('\n');
}

const findFollowUpEmailContextStep = createStep({
  id: 'find-follow-up-email-context',
  description: 'Find the latest past workshop and the next upcoming workshop.',
  inputSchema: generateFollowUpEmailInputSchema,
  outputSchema: followUpContextSchema,
  execute: async () => {
    const [latestWorkshop, nextWorkshop] = await Promise.all([
      findLatestPastWorkshopForFollowUpEmail(),
      findNextUpcomingWorkshopForFollowUpEmail(),
    ]);

    return {
      latestWorkshop: toEmailWorkshop(latestWorkshop),
      nextWorkshop: toEmailWorkshop(nextWorkshop),
    };
  },
});

const prepareFollowUpEmailPromptStep = createStep({
  id: 'prepare-follow-up-email-prompt',
  description: 'Prepare the writing prompt for the follow-up email agent.',
  inputSchema: followUpContextSchema,
  outputSchema: followUpPromptSchema,
  execute: async ({ inputData }) => ({
    prompt: buildFollowUpPrompt(inputData),
  }),
});

const writeFollowUpEmailStep = createStep(followUpEmailAgent, {
  structuredOutput: { schema: generateFollowUpEmailOutputSchema },
});

function normalizeLumaEmailFormatting(text: string): string {
  const normalized = text
    .replace(/\byou will\b/gi, "you'll")
    .replace(/\by'all\b/gi, 'you')
    .replace(/\bthanks again for joining\b/gi, 'thanks again for registering')
    .replace(/\bthanks for joining\b/gi, 'thanks for registering')
    .replace(/\bcoming along\b/gi, 'registering')
    .replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*/g, '**[$1]($2)**')
    .replace(/\*\*\[Alex Booker\]\(https:\/\/x\.com\/bookercodes\)\*\*/g, '**[me](https://x.com/bookercodes)**')
    .replace(/\[Alex Booker\]\(https:\/\/x\.com\/bookercodes\)/g, '**[me](https://x.com/bookercodes)**')
    .replace(/(?<!\*)\[([^\]]+)\]\(([^)]+)\)(?!\*)/g, '**[$1]($2)**')
    .trim();

  return normalized.replace(
    /\*\*\[Mastra\]\(https:\/\/x\.com\/mastra\)\*\*\s*(?:and|,)\s*\*\*\[me\]\(https:\/\/x\.com\/bookercodes\)\*\*/gi,
    '**[me](https://x.com/bookercodes)** and **[Mastra](https://x.com/mastra)**',
  );
}

const normalizeFollowUpEmailFormattingStep = createStep({
  id: 'normalize-follow-up-email-formatting',
  description: 'Ensure the final Luma email copy uses bold Markdown links and requested contractions.',
  inputSchema: generateFollowUpEmailOutputSchema,
  outputSchema: generateFollowUpEmailOutputSchema,
  execute: async ({ inputData }) => ({
    text: normalizeLumaEmailFormatting(inputData.text),
  }),
});

export const generateFollowUpEmailWorkflow = createWorkflow({
  id: 'generate-follow-up-email',
  inputSchema: generateFollowUpEmailInputSchema,
  outputSchema: generateFollowUpEmailOutputSchema,
})
  .then(findFollowUpEmailContextStep)
  .then(prepareFollowUpEmailPromptStep)
  .then(writeFollowUpEmailStep)
  .then(normalizeFollowUpEmailFormattingStep)
  .commit();
