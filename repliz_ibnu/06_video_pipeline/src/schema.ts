import {z} from 'zod';

export const sceneBlockSchema = z.object({
  kind: z.enum(['hook', 'feature-list', 'audience', 'cta']),
  title: z.string(),
  body: z.string().optional(),
  items: z.array(z.string()).optional(),
  durationInFrames: z.number().int().positive(),
});

export const shortVideoPropsSchema = z.object({
  meta: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    ratio: z.literal('9:16'),
    fps: z.number().int().positive(),
  }),
  palette: z.object({
    background: z.string(),
    panel: z.string(),
    primary: z.string(),
    secondary: z.string(),
    text: z.string(),
    mutedText: z.string(),
  }),
  brand: z.object({
    name: z.string(),
    handle: z.string().optional(),
  }),
  cta: z.object({
    label: z.string(),
    keyword: z.string(),
  }),
  scenes: z.array(sceneBlockSchema).min(1),
});

export type ShortVideoPropsInput = z.infer<typeof shortVideoPropsSchema>;
