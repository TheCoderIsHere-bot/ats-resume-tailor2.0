import type { MetadataRoute } from 'next';

const BLOCKED_SCRAPER_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'CCBot',
  'Google-Extended',
  'anthropic-ai',
  'ClaudeBot',
  'Bytespider',
  'PetalBot',
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'Scrapy',
  'HTTrack',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...BLOCKED_SCRAPER_BOTS.map((userAgent) => ({
        userAgent,
        disallow: '/',
      })),
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/'],
      },
    ],
    sitemap: 'https://tailor-ai.app/sitemap.xml',
  };
}
