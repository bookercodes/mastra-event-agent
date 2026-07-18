import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { uploadLumaImageFromDataUrl } from '../../../lib/luma/images';

const uploadLumaImageTool = createTool({
  id: 'upload-luma-image',
  description: 'Upload an image to Luma CDN. Returns a URL that can be used as a cover image when creating or updating events.',
  inputSchema: z.object({
    imageData: z.string().describe('Base64 data URL (e.g., data:image/png;base64,...)'),
  }),
  outputSchema: z.object({
    imageUrl: z.string().describe('Luma CDN URL for the uploaded image'),
  }),
  execute: async ({ imageData }) => {
    return {
      imageUrl: await uploadLumaImageFromDataUrl(imageData),
    };
  },
});

export default uploadLumaImageTool;
