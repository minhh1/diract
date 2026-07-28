import { RecordListView } from '@/components/records/RecordListView';

export default function LeadsScreen() {
  return <RecordListView tableName="entities" basePath="/leads" />;
}
