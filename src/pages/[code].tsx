import { GetStaticPaths, GetStaticProps } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Suspense } from 'react';
import SparkLayout from '../components/SparkLayout';
import TextBox from '../components/TextBox';
import { env } from '../env';

const SparkViewer = dynamic(() => import('../viewer/SparkViewer'));

interface ViewerPageProps {
    code: string;
}

export default function ViewerPage({ code }: ViewerPageProps) {
    return (
        <>
            {code !== '_' && <ThumbnailMetaTags code={code} />}
            <Suspense
                fallback={
                    <SparkLayout>
                        <TextBox>Loading...</TextBox>
                    </SparkLayout>
                }
            >
                <SparkViewer />
            </Suspense>
        </>
    );
}

const ThumbnailMetaTags = ({ code }: ViewerPageProps) => {
    const thumbnailUrl = process.env.NEXT_PUBLIC_BASE_PATH
        ? process.env.NEXT_PUBLIC_SPARK_THUMBNAIL_SERVICE_URL
        : `${env.NEXT_PUBLIC_SPARK_BASE_URL}/thumb`;

    return (
        <Head>
            <title>{`spark | ${code}`}</title>
            <meta
                property="og:image"
                content={`${thumbnailUrl}/${code}.png`}
                key="og-image"
            />
            <meta
                name="twitter:image"
                content={`${thumbnailUrl}/${code}.png`}
                key="twitter-image"
            />
            <meta
                name="twitter:card"
                content="summary_large_image"
                key="twitter-card"
            />
        </Head>
    );
};

export const getStaticPaths: GetStaticPaths = async () => ({
    paths: [{ params: { code: '_' } }],
    fallback: process.env.GITHUB_PAGES === 'true' ? false : 'blocking',
});

export const getStaticProps: GetStaticProps<ViewerPageProps> = async ({
    params,
}) => ({
    props: { code: params?.code as string },
    revalidate: process.env.GITHUB_PAGES === 'true' ? false : 31536000,
});
