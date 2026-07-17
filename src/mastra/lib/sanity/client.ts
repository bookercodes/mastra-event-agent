import { createClient, type SanityClient } from '@sanity/client';

let sanityClient: SanityClient | undefined;

export function getSanityClient(): SanityClient {
  if (sanityClient) {
    return sanityClient;
  }

  const projectId = process.env.SANITY_PROJECT_ID;
  if (!projectId) {
    throw new Error('SANITY_PROJECT_ID environment variable is not set');
  }

  const token = process.env.SANITY_API_TOKEN;
  if (!token) {
    throw new Error('SANITY_API_TOKEN environment variable is not set');
  }

  sanityClient = createClient({
    projectId,
    dataset: process.env.SANITY_DATASET || 'production',
    apiVersion: '2024-01-01',
    token,
    useCdn: false,
  });

  return sanityClient;
}
