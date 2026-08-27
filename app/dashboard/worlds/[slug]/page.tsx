import { redirect } from 'next/navigation';

export default async function WorldOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/dashboard/worlds/${slug}/in-process`);
}
