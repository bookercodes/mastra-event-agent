import type { SanityClient } from '@sanity/client';
import { randomUUID } from 'node:crypto';
import type { LumaEvent } from '../luma/client';
import { getSanityClient } from './client';

export interface WorkshopHostInput {
  guestId?: string;
  name: string;
  area?: string;
  company?: string;
  xHandle?: string;
  website?: string;
}

interface ExistingWorkshopDoc {
  _id: string;
  lumaUrl?: string;
  image?: {
    asset?: {
      originalFilename?: string;
      url?: string;
    };
  };
}

export interface WorkshopYoutubeSyncCandidate {
  _id: string;
  title: string;
  eventDate: string;
  lumaUrl?: string;
  youtubeUrl?: string;
}

export interface WorkshopFollowUpEmailCandidate {
  _id: string;
  title: string;
  description?: string;
  shortDescription?: string;
  eventDate: string;
  lumaUrl?: string;
  youtubeUrl?: string;
}

type WorkshopPeopleField = 'hostReferences' | 'speakers' | 'hosts' | 'guests';
type WorkshopGuestReference = { _key: string; _type: 'reference'; _ref: string };
const DEFAULT_WORKSHOP_PEOPLE_FIELD: WorkshopPeopleField = 'hostReferences';
const WORKSHOP_PEOPLE_FIELDS: WorkshopPeopleField[] = ['hostReferences', 'speakers', 'hosts', 'guests'];
const LEGACY_WORKSHOP_PEOPLE_FIELDS: WorkshopPeopleField[] = ['speakers', 'hosts'];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeLumaUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^lu\.ma$/, 'luma.com');
    const path = parsed.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return undefined;
  }
}

function toShortDescription(markdown: string): string {
  const cleaned = markdown
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  return cleaned.length <= 180 ? cleaned : `${cleaned.slice(0, 177).trimEnd()}...`;
}

function getDurationMinutes(startAt: string, endAt: string): number | undefined {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined;
  }

  return Math.round((end - start) / 60000);
}

function getFileNameFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.at(-1);
  } catch {
    return undefined;
  }
}

function buildCreateSlug(event: LumaEvent): string {
  const titleSlug = slugify(event.name || 'workshop');
  const datePrefix = event.start_at ? new Date(event.start_at).toISOString().slice(0, 10) : undefined;
  return [titleSlug, datePrefix].filter(Boolean).join('-') || `workshop-${event.api_id}`;
}

async function uploadLumaCoverImage(client: SanityClient, event: LumaEvent) {
  if (!event.cover_url) {
    return undefined;
  }

  const response = await fetch(event.cover_url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download Luma cover image: ${response.status} ${response.statusText} - ${text}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const filename = getFileNameFromUrl(event.cover_url) || `luma-cover-${event.api_id}.png`;

  const asset = await client.assets.upload('image', imageBuffer, {
    filename,
    contentType,
    source: {
      id: event.api_id,
      name: 'luma-tool-sync',
      url: event.url,
    },
  });

  return {
    _type: 'image' as const,
    asset: {
      _type: 'reference' as const,
      _ref: asset._id,
    },
  };
}

function getWorkshopPeopleField(): WorkshopPeopleField {
  const configured = process.env.SANITY_WORKSHOP_PEOPLE_FIELD;
  if (!configured) {
    return DEFAULT_WORKSHOP_PEOPLE_FIELD;
  }

  if (WORKSHOP_PEOPLE_FIELDS.includes(configured as WorkshopPeopleField)) {
    return configured as WorkshopPeopleField;
  }

  throw new Error(
    `SANITY_WORKSHOP_PEOPLE_FIELD must be one of: ${WORKSHOP_PEOPLE_FIELDS.join(', ')}`,
  );
}

async function findOrCreateGuest(client: SanityClient, host: WorkshopHostInput): Promise<string> {
  if (host.guestId) {
    return host.guestId;
  }

  const slug = slugify(host.name);
  const existingGuest = await client.fetch(
    `*[_type == "guest" && (name == $name || slug.current == $slug)][0]{_id}`,
    { name: host.name, slug },
  ) as { _id: string } | null;

  if (existingGuest?._id) {
    return existingGuest._id;
  }

  const created = await client.create({
    _type: 'guest',
    name: host.name,
    slug: { _type: 'slug', current: slug },
    ...(host.company && { company: host.company }),
    ...(host.xHandle && { xHandle: host.xHandle }),
    ...(host.website && { website: host.website }),
  });

  return created._id;
}

async function buildGuestReferences(client: SanityClient, hosts: WorkshopHostInput[]): Promise<WorkshopGuestReference[]> {
  const refs: WorkshopGuestReference[] = [];
  const seen = new Set<string>();

  for (const host of hosts) {
    const guestId = await findOrCreateGuest(client, host);
    if (!guestId || seen.has(guestId)) {
      continue;
    }

    seen.add(guestId);
    refs.push({ _key: randomUUID().replace(/-/g, ''), _type: 'reference', _ref: guestId });
  }

  return refs;
}

function shouldUpdateImage(existingDoc: ExistingWorkshopDoc | undefined, event: LumaEvent): boolean {
  if (!event.cover_url) {
    return false;
  }

  const nextFilename = getFileNameFromUrl(event.cover_url);
  const currentFilename = existingDoc?.image?.asset?.originalFilename;
  return !(currentFilename && nextFilename && currentFilename === nextFilename);
}

function mapLumaEventToSanityFields(event: LumaEvent): Record<string, unknown> {
  const description = event.description_md || '';
  const duration = getDurationMinutes(event.start_at, event.end_at);
  const fields: Record<string, unknown> = {
    title: event.name,
    description,
    shortDescription: toShortDescription(description),
    eventDate: event.start_at,
    lumaUrl: event.url,
  };

  if (duration !== undefined) {
    fields.duration = `${duration} minutes`;
  }

  return fields;
}

async function findExistingWorkshopDoc(client: SanityClient, docType: string, eventUrl: string): Promise<ExistingWorkshopDoc | undefined> {
  const normalizedEventUrl = normalizeLumaUrl(eventUrl);
  if (!normalizedEventUrl) {
    return undefined;
  }

  const candidates = await client.fetch(
    `*[_type == $docType && defined(lumaUrl)]{
      _id,
      lumaUrl,
      image {
        asset-> {
          originalFilename,
          url
        }
      }
    }`,
    { docType },
  ) as ExistingWorkshopDoc[];

  return candidates.find((doc) => normalizeLumaUrl(doc.lumaUrl) === normalizedEventUrl);
}

async function findWorkshopDocByIdOrUrl(
  client: SanityClient,
  docType: string,
  docId?: string,
  eventUrl?: string,
): Promise<ExistingWorkshopDoc | undefined> {
  if (docId) {
    const byId = await client.fetch(
      `*[_id == $docId && _type == $docType][0]{
        _id,
        lumaUrl,
        image {
          asset-> {
            originalFilename,
            url
          }
        }
      }`,
      { docId, docType },
    ) as ExistingWorkshopDoc | null;

    if (byId?._id) {
      return byId;
    }
  }

  if (eventUrl) {
    return findExistingWorkshopDoc(client, docType, eventUrl);
  }

  return undefined;
}

export async function upsertWorkshopFromLumaEvent(
  event: LumaEvent,
  hosts?: WorkshopHostInput[],
): Promise<{ docId: string; action: 'created' | 'updated' }> {
  const client = getSanityClient();
  const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
  const existingDoc = await findExistingWorkshopDoc(client, docType, event.url);

  const setFields = mapLumaEventToSanityFields(event);
  if (hosts && hosts.length > 0) {
    const peopleField = getWorkshopPeopleField();
    setFields[peopleField] = await buildGuestReferences(client, hosts);
  }

  if (shouldUpdateImage(existingDoc, event)) {
    const image = await uploadLumaCoverImage(client, event);
    if (image) {
      setFields.image = image;
    }
  }

  if (existingDoc?._id) {
    const peopleField = getWorkshopPeopleField();
    const stalePeopleFields = LEGACY_WORKSHOP_PEOPLE_FIELDS.filter((field) => field !== peopleField);
    await client.patch(existingDoc._id).set(setFields).unset(stalePeopleFields).commit();
    return { docId: existingDoc._id, action: 'updated' };
  }

  const createdDoc = await client.create({
    _type: docType,
    ...setFields,
    slug: { _type: 'slug', current: buildCreateSlug(event) },
  });

  return { docId: createdDoc._id, action: 'created' };
}

export async function deleteWorkshopFromSanity(input: {
  docId?: string;
  eventUrl?: string;
}): Promise<{ deleted: boolean; docId?: string }> {
  const client = getSanityClient();
  const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
  const existingDoc = await findWorkshopDocByIdOrUrl(client, docType, input.docId, input.eventUrl);

  if (!existingDoc?._id) {
    return { deleted: false };
  }

  await client.delete(existingDoc._id);
  return { deleted: true, docId: existingDoc._id };
}

async function findLatestPastWorkshopDoc<T>(): Promise<T | undefined> {
  const client = getSanityClient();
  const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
  const now = new Date().toISOString();

  const doc = await client.fetch(
    `*[_type == $docType && defined(title) && defined(eventDate) && dateTime(eventDate) <= dateTime($now)] | order(dateTime(eventDate) desc)[0]{
      _id,
      title,
      description,
      shortDescription,
      eventDate,
      lumaUrl,
      youtubeUrl
    }`,
    { docType, now },
  ) as T | null;

  return doc || undefined;
}

export async function findWorkshopForYoutubeSync(): Promise<WorkshopYoutubeSyncCandidate | undefined> {
  return findLatestPastWorkshopDoc<WorkshopYoutubeSyncCandidate>();
}

export async function findLatestPastWorkshopForFollowUpEmail(): Promise<WorkshopFollowUpEmailCandidate | undefined> {
  return findLatestPastWorkshopDoc<WorkshopFollowUpEmailCandidate>();
}

export async function findNextUpcomingWorkshopForFollowUpEmail(): Promise<WorkshopFollowUpEmailCandidate | undefined> {
  const client = getSanityClient();
  const docType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';
  const now = new Date().toISOString();

  const doc = await client.fetch(
    `*[_type == $docType && defined(title) && defined(eventDate) && dateTime(eventDate) > dateTime($now)] | order(dateTime(eventDate) asc)[0]{
      _id,
      title,
      description,
      shortDescription,
      eventDate,
      lumaUrl,
      youtubeUrl
    }`,
    { docType, now },
  ) as WorkshopFollowUpEmailCandidate | null;

  return doc || undefined;
}

export async function updateWorkshopYoutubeUrl(input: {
  docId: string;
  youtubeUrl: string;
}): Promise<void> {
  const client = getSanityClient();
  await client.patch(input.docId).set({ youtubeUrl: input.youtubeUrl }).commit();
}
