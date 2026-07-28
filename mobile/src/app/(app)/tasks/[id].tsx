import { useLocalSearchParams } from 'expo-router';

import { RecordDetailView } from '@/components/records/RecordDetailView';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordDetailView tableName="tasks" recordId={id} />;
}
