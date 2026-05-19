import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_YOUTUBE_STREAMS_URL = 'https://www.youtube.com/@mastra-ai/streams';

export interface YouTubeStream {
  videoId: string;
  url: string;
  title: string;
  timestamp?: string;
  liveStatus?: string;
}

export interface YouTubeStreamMatch {
  stream: YouTubeStream;
  score: number;
  reason: string;
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  webpage_url?: string;
  original_url?: string;
  release_timestamp?: number;
  timestamp?: number;
  live_status?: string;
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(value: string): string[] {
  return normalizeTitle(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function tokenSimilarity(a: string, b: string): number {
  const aTokens = titleTokens(a);
  const bTokens = titleTokens(b);

  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }

  const bCounts = new Map<string, number>();
  for (const token of bTokens) {
    bCounts.set(token, (bCounts.get(token) || 0) + 1);
  }

  let shared = 0;
  for (const token of aTokens) {
    const count = bCounts.get(token) || 0;
    if (count > 0) {
      shared += 1;
      bCounts.set(token, count - 1);
    }
  }

  return (2 * shared) / (aTokens.length + bTokens.length);
}

function titleScore(expectedTitle: string, streamTitle: string): { score: number; reason: string } {
  const expected = normalizeTitle(expectedTitle);
  const actual = normalizeTitle(streamTitle);

  if (!expected || !actual) {
    return { score: 0, reason: 'missing-title' };
  }

  if (expected === actual) {
    return { score: 1, reason: 'exact-title' };
  }

  if (expected.length >= 12 && actual.includes(expected)) {
    return { score: 0.95, reason: 'stream-title-contains-event-title' };
  }

  if (actual.length >= 12 && expected.includes(actual)) {
    return { score: 0.9, reason: 'event-title-contains-stream-title' };
  }

  const score = tokenSimilarity(expectedTitle, streamTitle);
  return { score, reason: 'token-similarity' };
}

function parseYtDlpEntry(line: string): YouTubeStream | undefined {
  const entry = JSON.parse(line) as YtDlpEntry;
  if (!entry.id || !entry.title) {
    return undefined;
  }

  const timestamp = entry.release_timestamp || entry.timestamp;

  return {
    videoId: entry.id,
    url: entry.webpage_url || entry.original_url || `https://www.youtube.com/watch?v=${entry.id}`,
    title: entry.title,
    ...(timestamp && { timestamp: new Date(timestamp * 1000).toISOString() }),
    ...(entry.live_status && { liveStatus: entry.live_status }),
  };
}

export async function fetchYouTubeStreams(input: {
  streamsUrl?: string;
  limit?: number;
  ytDlpBinary?: string;
  timeoutMs?: number;
} = {}): Promise<YouTubeStream[]> {
  const streamsUrl = input.streamsUrl || process.env.YOUTUBE_STREAMS_URL || DEFAULT_YOUTUBE_STREAMS_URL;
  const envLimit = Number(process.env.YOUTUBE_STREAM_LIMIT);
  const limit = input.limit || (Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 3);
  const ytDlpBinary = input.ytDlpBinary || process.env.YT_DLP_BINARY || 'yt-dlp';

  try {
    const { stdout } = await execFileAsync(ytDlpBinary, [
      '--dump-json',
      '--skip-download',
      '--ignore-errors',
      '--playlist-end',
      String(limit),
      streamsUrl,
    ], {
      maxBuffer: 1024 * 1024 * 10,
      timeout: input.timeoutMs || 90_000,
    });

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return parseYtDlpEntry(line);
        } catch {
          return undefined;
        }
      })
      .filter((stream): stream is YouTubeStream => Boolean(stream));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch YouTube streams with ${ytDlpBinary}. Make sure yt-dlp is installed and on PATH. ${message}`);
  }
}

export function findMatchingYouTubeStream(input: {
  title: string;
  streams: YouTubeStream[];
  minScore?: number;
}): YouTubeStreamMatch | undefined {
  const envMinScore = Number(process.env.YOUTUBE_TITLE_MATCH_MIN_SCORE);
  const minScore = input.minScore ?? (Number.isFinite(envMinScore) && envMinScore > 0 ? envMinScore : 0.82);
  const best = input.streams
    .map((stream) => {
      const score = titleScore(input.title, stream.title);
      return { stream, ...score };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < minScore) {
    return undefined;
  }

  return best;
}
