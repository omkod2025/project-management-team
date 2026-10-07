import ListPage from './list-page';
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <ListPage params={params} kind="task" />;
}
