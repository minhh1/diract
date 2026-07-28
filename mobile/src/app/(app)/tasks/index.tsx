import { RecordListView } from '@/components/records/RecordListView';

export default function TasksScreen() {
  return <RecordListView tableName="tasks" basePath="/tasks" />;
}
