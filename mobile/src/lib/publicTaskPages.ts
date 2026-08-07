import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from './api';

// Native port of components/public/PublicTasksContent.tsx -- despite the
// "public" name this requires a real signed-in session (see
// lib/publicTaskPageAuth.ts: no access-code/anonymous path exists for this
// one, unlike document-fill/client-update pages below). Access is scoped
// server-side by the page's `scope` (self/team/company/my_and_unassigned);
// the mobile app just calls the same app/api/public-tasks/* routes with
// the session's bearer token and renders whatever tabs/tasks come back.

export type TaskPageSummary = {
  id: string;
  title: string;
  scope: 'self' | 'team' | 'company' | 'my_and_unassigned';
  teamId: string | null;
  teamName: string | null;
  isActive: boolean;
};

export type PublicTask = {
  id: string;
  name: string;
  isCompleted: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  projectId: string | null;
  projectName: string | null;
  matterNumber: string | null;
  team: string | null;
  estimatedCost: number | null;
  dateEntered: string | null;
  createdBy: string | null;
  notes: string | null;
  awaitingFollowUp: boolean;
  followUpDate: string | null;
};

export type TaskPageDetail = {
  title: string;
  scopeName: string;
  scope: TaskPageSummary['scope'];
  columns: string[];
  tabs: { userId: string; userName: string; tasks: PublicTask[] }[];
};

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export function usePublicTaskPagesList() {
  return useQuery({
    queryKey: ['public-task-pages'],
    queryFn: async (): Promise<TaskPageSummary[]> => {
      const res = await callApi('/api/public-tasks/list');
      const json = await unwrap<{ pages: TaskPageSummary[] }>(res);
      return json.pages;
    },
  });
}

export function useTaskPage(pageId: string) {
  return useQuery({
    queryKey: ['public-task-page', pageId],
    enabled: !!pageId,
    queryFn: async (): Promise<TaskPageDetail> => {
      const res = await callApi(`/api/public-tasks/${pageId}`);
      return unwrap<TaskPageDetail>(res);
    },
  });
}

export function useToggleTaskComplete(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, isCompleted }: { taskId: string; isCompleted: boolean }) => {
      const res = await callApi(`/api/public-tasks/${pageId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCompleted }),
      });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}
