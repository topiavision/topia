import type { Metadata } from 'next';
import PageShell from '../../components/PageShell';
import { getToolsList } from '@/lib/tools/list';
import ToolsList from './ToolsList';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Tools | TOPIA',
  description: 'Software, hardware, platforms — what creators use to build worlds.',
  alternates: { canonical: 'https://topia.vision/resources/tools' },
};

export default async function ToolsPage() {
  const initialTools = await getToolsList();

  return (
    <PageShell>
      <ToolsList initialTools={initialTools.map((t) => ({ ...t, featured: t.featured ?? false }))} />
    </PageShell>
  );
}
