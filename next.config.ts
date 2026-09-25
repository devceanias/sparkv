import type { NextConfig } from 'next';
import { env } from './src/env';

const pages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = {
    output: pages ? 'export' : 'standalone',
    basePath: pages ? '/sparkv' : undefined,
    trailingSlash: pages,
    images: { unoptimized: pages },
    env: {
        NEXT_PUBLIC_BASE_PATH: pages ? '/sparkv' : '',
        NEXT_PUBLIC_SPARK_DOCS_URL: env.SPARK_DOCS_URL,
        NEXT_PUBLIC_SPARK_THUMBNAIL_SERVICE_URL:
            env.SPARK_THUMBNAIL_SERVICE_URL,
    },
    webpack: config => {
        config.module.rules.push({
            test: /\.svg$/,
            use: [{ loader: '@svgr/webpack', options: { dimensions: false } }],
        });
        return config;
    },
    rewrites: pages
        ? undefined
        : async () => [
              {
                  source: '/docs/:path*',
                  destination: env.SPARK_DOCS_URL + '/:path*',
              },
              {
                  source: '/thumb/:slug',
                  destination: env.SPARK_THUMBNAIL_SERVICE_URL + '/:slug',
              },
              {
                  source: '/:slug',
                  has: [{ type: 'query', key: 'raw' }],
                  destination: env.SPARK_JSON_SERVICE_URL + '/:slug',
              },
          ],
};

export default nextConfig;
