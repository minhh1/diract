import { useLocalSearchParams } from 'expo-router';

import { RecordDetailView } from '@/components/records/RecordDetailView';

export default function MatterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordDetailView tableName="projects" recordId={id} />;
}
