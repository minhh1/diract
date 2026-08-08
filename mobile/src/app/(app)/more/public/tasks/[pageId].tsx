import { useLocalSearchParams } from 'expo-router';

import { TaskPageContent } from '@/components/tasks/TaskPageContent';

export default function TaskPageScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  return <TaskPageContent pageId={pageId} />;
}
