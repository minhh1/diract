import { useLocalSearchParams } from 'expo-router';

import { RecordDetailView } from '@/components/records/RecordDetailView';

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordDetailView tableName="properties" recordId={id} />;
}
