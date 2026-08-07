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

export type FollowUp = { id: string; followedUpAt: string; isDone: boolean };

export type PublicTask = {
  id: string;
  name: string;
  isCompleted: boolean;
  completedAt: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  projectId: string | null;
  projectName: string | null;
  matterNumber: string | null;
  statusId: string | null;
  status: string | null;
  statusColor: string | null;
  teamId: string | null;
  team: string | null;
  isMonetary: boolean;
  estimatedCost: number | null;
  dateEntered: string | null;
  createdBy: string | null;
  notes: string | null;
  awaitingFollowUp: boolean;
  followUpDate: string | null;
  syncToCompanyCalendar: boolean;
  followUps: FollowUp[];
  isWatcher: boolean;
  watcherIds: string[];
};

export type TaskFormOptions = {
  projects: { id: string; name: string; matterNumber: string | null }[];
  statuses: { id: string; name: string; color?: string }[];
  teams: { id: string; team_name: string }[];
  assignees: { id: string; name: string }[];
};

export type TaskPageDetail = {
  title: string;
  scopeName: string;
  scope: TaskPageSummary['scope'];
  columns: string[];
  tabs: { userId: string; userName: string; tasks: PublicTask[] }[];
  formOptions: TaskFormOptions;
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

// One shared mutation for any subset of a task's patchable fields --
// mirrors the web version's single PATCH endpoint accepting a partial body
// (name, dueDate, dueTime, statusId, teamId, isMonetary, estimatedCost,
// isCompleted, awaitingFollowUp, followUpDate, notes,
// syncToCompanyCalendar, assigneeId, watcherIds).
export function useUpdateTask(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Record<string, unknown> }) => {
      const res = await callApi(`/api/public-tasks/${pageId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}

// Kept as its own hook (rather than folding into useUpdateTask everywhere)
// since the swipe-to-complete row action and the tap-to-toggle checkbox
// both want the exact same {taskId, isCompleted} shape without building a
// patch object at every call site.
export function useToggleTaskComplete(pageId: string) {
  const update = useUpdateTask(pageId);
  return {
    ...update,
    mutate: ({ taskId, isCompleted }: { taskId: string; isCompleted: boolean }) => update.mutate({ taskId, patch: { isCompleted } }),
  };
}

export function useDeleteTask(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await callApi(`/api/public-tasks/${pageId}/tasks/${taskId}`, { method: 'DELETE' });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}

export function useCreateTask(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      projectId: string;
      dueDate?: string;
      dueTime?: string;
      teamId?: string;
      assigneeId?: string;
      notes?: string;
    }) => {
      const res = await callApi(`/api/public-tasks/${pageId}`, { method: 'POST', body: JSON.stringify(body) });
      return unwrap<{ ok: boolean; task: PublicTask }>(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}

export function useAddFollowUp(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, followedUpAt }: { taskId: string; followedUpAt?: string }) => {
      const res = await callApi(`/api/public-tasks/${pageId}/tasks/${taskId}/follow-ups`, {
        method: 'POST',
        body: JSON.stringify({ followedUpAt }),
      });
      return unwrap<{ ok: boolean; entry: FollowUp }>(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}

export function useRemoveFollowUp(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, followUpId }: { taskId: string; followUpId: string }) => {
      const res = await callApi(`/api/public-tasks/${pageId}/tasks/${taskId}/follow-ups/${followUpId}`, { method: 'DELETE' });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}

export function useMarkFollowUpDone(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, followUpId }: { taskId: string; followUpId: string }) => {
      const res = await callApi(`/api/public-tasks/${pageId}/tasks/${taskId}/follow-ups/${followUpId}`, { method: 'PATCH' });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-task-page', pageId] }),
  });
}
