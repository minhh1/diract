import { useLocalSearchParams } from 'expo-router';

import { RecordDetailView } from '@/components/records/RecordDetailView';

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordDetailView tableName="entities" recordId={id} />;
}
