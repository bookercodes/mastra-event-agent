const LUMA_API_BASE = 'https://public-api.luma.com/v1';

export interface LumaEvent {
  api_id: string;
  name: string;
  description_md?: string;
  start_at: string;
  end_at: string;
  url: string;
  cover_url?: string;
  meeting_url?: string;
  timezone?: string;
}

interface LumaEventDetailsResponse {
  event: LumaEvent;
}

interface LumaListEventsResponse {
  entries: {
    event: LumaEvent;
  }[];
  has_more: boolean;
  next_cursor?: string;
}

interface LumaCreateEventResponse {
  api_id: string;
}

interface LumaCancelRequestResponse {
  cancellation_token?: string;
  cancellationToken?: string;
}

export interface LumaCreateEventInput {
  name: string;
  description_md: string;
  start_at: string;
  end_at: string;
  timezone: string;
  cover_url: string;
  visibility: 'public' | 'private';
  meeting_url?: string;
  tint_color?: string;
  show_guest_list?: boolean;
}

export interface LumaUpdateEventInput {
  name?: string;
  description_md?: string;
  start_at?: string;
  end_at?: string;
  cover_url?: string;
  meeting_url?: string;
}

export interface LumaDeleteEventOptions {
  shouldRefund?: boolean;
}

interface UploadUrlResponse {
  upload_url: string;
  file_url: string;
}

export class LumaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'LumaRequestError';
  }
}

export function isLumaNotFoundError(error: unknown): boolean {
  return error instanceof LumaRequestError && error.status === 404;
}

function getLumaHeaders(): Record<string, string> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) {
    throw new Error('LUMA_API_KEY environment variable is not set');
  }

  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-luma-api-key': apiKey,
  };
}

async function lumaRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${LUMA_API_BASE}${path}`, {
    ...init,
    headers: {
      ...getLumaHeaders(),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new LumaRequestError(
      `Luma request failed ${path}: ${response.status} ${response.statusText} - ${errorText}`,
      response.status,
      path,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function listLumaEvents(afterDate?: string): Promise<LumaEvent[]> {
  const params = new URLSearchParams();
  if (afterDate) {
    params.set('after', afterDate);
  }

  const allEvents: LumaEvent[] = [];
  let cursor: string | undefined;

  while (true) {
    const query = cursor
      ? `?pagination_cursor=${encodeURIComponent(cursor)}`
      : (params.toString() ? `?${params.toString()}` : '');

    const data = await lumaRequest<LumaListEventsResponse>(`/calendar/list-events${query}`, {
      method: 'GET',
    });

    for (const entry of data.entries || []) {
      allEvents.push(entry.event);
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }

    cursor = data.next_cursor;
  }

  return allEvents;
}

export async function getLumaEvent(eventId: string): Promise<LumaEvent> {
  const data = await lumaRequest<LumaEventDetailsResponse>(`/event/get?id=${encodeURIComponent(eventId)}`, {
    method: 'GET',
  });

  return data.event;
}

export async function createLumaEvent(input: LumaCreateEventInput): Promise<LumaCreateEventResponse> {
  return lumaRequest<LumaCreateEventResponse>('/event/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateLumaEvent(eventId: string, input: LumaUpdateEventInput): Promise<void> {
  await lumaRequest('/event/update', {
    method: 'POST',
    body: JSON.stringify({
      event_api_id: eventId,
      ...input,
    }),
  });
}

export async function deleteLumaEvent(eventId: string, options: LumaDeleteEventOptions = {}): Promise<void> {
  const request = await lumaRequest<LumaCancelRequestResponse>('/event/cancel/request', {
    method: 'POST',
    body: JSON.stringify({
      event_id: eventId,
    }),
  });

  const cancellationToken = request.cancellation_token || request.cancellationToken;
  if (!cancellationToken) {
    throw new Error(`Luma cancellation request for ${eventId} did not return a cancellation token`);
  }

  await lumaRequest('/event/cancel', {
    method: 'POST',
    body: JSON.stringify({
      event_id: eventId,
      cancellation_token: cancellationToken,
      ...(options.shouldRefund !== undefined && { should_refund: options.shouldRefund }),
    }),
  });
}

export async function createLumaImageUploadUrl(): Promise<UploadUrlResponse> {
  return lumaRequest<UploadUrlResponse>('/images/create-upload-url', {
    method: 'POST',
    body: JSON.stringify({ purpose: 'event-cover' }),
  });
}

export async function uploadLumaBinary(uploadUrl: string, data: BodyInit, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: data,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload Luma image: ${response.status} ${response.statusText} - ${errorText}`);
  }
}
