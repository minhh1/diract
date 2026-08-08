import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useIsTabletLayout } from '@/hooks/use-tablet-layout';
import { RecordListView } from '@/components/records/RecordListView';
import { RecordDetailView } from '@/components/records/RecordDetailView';
import { MasterDetailLayout } from '@/components/records/MasterDetailLayout';

export default function PropertiesScreen() {
  const theme = useTheme();
  const isTablet = useIsTabletLayout();
  const { selected } = useLocalSearchParams<{ selected?: string }>();
  const router = useRouter();

  if (!isTablet) return <RecordListView tableName="properties" basePath="/more/properties" />;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MasterDetailLayout
        list={
          <>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', padding: 16, paddingBottom: 4 }}>Properties</Text>
            <RecordListView
              tableName="properties"
              basePath="/more/properties"
              selectedId={selected}
              onSelect={(id) => router.setParams({ selected: id })}
            />
          </>
        }
        detail={
          selected ? (
            <RecordDetailView tableName="properties" recordId={selected} />
          ) : (
            <Text style={{ color: theme.textSecondary, padding: 16 }}>No properties yet.</Text>
          )
        }
      />
    </>
  );
}
