import { RecordListView } from '@/components/records/RecordListView';

export default function MattersScreen() {
  return <RecordListView tableName="projects" basePath="/matters" />;
}
