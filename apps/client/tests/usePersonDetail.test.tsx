import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePersonDetail } from '../hooks/usePersonDetail';
import { contactsApi, type PersonContact } from '../services/contacts';
import { useAuthStore } from '../stores/authStore';

jest.mock('../services/contacts', () => ({ contactsApi: { get: jest.fn(), saveNotes: jest.fn() } }));
const get = jest.mocked(contactsApi.get);
const save = jest.mocked(contactsApi.saveNotes);
const person: PersonContact = { id: 'person-1', name: 'Priya', notes: 'Old context', phone_number: null, is_group: false };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  get.mockReset();
  save.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } } as never);
  get.mockResolvedValue(person);
  save.mockResolvedValue({ id: person.id, notes: 'Saved context' });
});

it('reopens the saved server notes from a warm cache without restoring the old text', async () => {
  const { wrapper } = setup();
  const first = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(first.result.current.notes).toBe('Old context'));
  act(() => first.result.current.setNotes('Saved context'));
  await act(() => first.result.current.saveNotes());
  first.unmount();
  const reopened = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(reopened.result.current.notes).toBe('Saved context'));
  expect(get).toHaveBeenCalledTimes(1);
});

it('uses normalized server notes and clears Saved as soon as the next edit begins', async () => {
  const { client, wrapper } = setup();
  const { result } = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(result.current.notes).toBe('Old context'));
  act(() => result.current.setNotes('  Saved context  '));
  await act(() => result.current.saveNotes());
  expect(result.current.notes).toBe('Saved context');
  expect(result.current.saved).toBe(true);
  expect(client.getQueryData<PersonContact>(['person', 'user-1', person.id])?.notes).toBe('Saved context');
  act(() => result.current.setNotes('Unsaved edit'));
  expect(result.current.saved).toBe(false);
});

it('does not overwrite a newer draft or claim it was saved when an earlier save finishes', async () => {
  const { client, wrapper } = setup();
  let finish!: (value: { id: string; notes: string }) => void;
  save.mockReturnValueOnce(new Promise((done) => { finish = done; }));
  const { result } = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(result.current.notes).toBe('Old context'));
  act(() => result.current.setNotes('Submitted context'));
  let pending!: Promise<void>;
  act(() => { pending = result.current.saveNotes(); });
  act(() => result.current.setNotes('Newer unsaved draft'));
  await act(async () => { finish({ id: person.id, notes: 'Submitted context' }); await pending; });
  expect(result.current.notes).toBe('Newer unsaved draft');
  expect(result.current.saved).toBe(false);
  expect(client.getQueryData<PersonContact>(['person', 'user-1', person.id])?.notes).toBe('Submitted context');
});

it('keeps the draft and previous cache value when saving fails', async () => {
  const { client, wrapper } = setup();
  save.mockRejectedValueOnce(new Error('Could not save'));
  const { result } = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(result.current.notes).toBe('Old context'));
  act(() => result.current.setNotes('Unsaved edit'));
  await act(() => result.current.saveNotes());
  expect(result.current.notes).toBe('Unsaved edit');
  expect(result.current.saved).toBe(false);
  expect(result.current.saveError).toBe('Could not save');
  expect(client.getQueryData<PersonContact>(['person', 'user-1', person.id])?.notes).toBe('Old context');
});

it('does not repopulate a cleared cache after the account changes during a save', async () => {
  const { client, wrapper } = setup();
  let finish!: (value: { id: string; notes: string }) => void;
  save.mockReturnValueOnce(new Promise((done) => { finish = done; }));
  const hook = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(hook.result.current.notes).toBe('Old context'));
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.saveNotes(); });
  hook.unmount();
  client.clear();
  useAuthStore.setState({ user: { id: 'user-2' } } as never);
  await act(async () => { finish({ id: person.id, notes: 'Saved context' }); await pending; });
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it('keeps a deliberate clearing of notes when the server returns null', async () => {
  const { client, wrapper } = setup();
  save.mockResolvedValueOnce({ id: person.id, notes: null });
  const { result } = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(result.current.notes).toBe('Old context'));
  act(() => result.current.setNotes(''));
  await act(() => result.current.saveNotes());
  expect(result.current.notes).toBe('');
  expect(client.getQueryData<PersonContact>(['person', 'user-1', person.id])?.notes).toBeNull();
});

it('does not replace an unsaved draft when a background refresh changes cached notes', async () => {
  const { client, wrapper } = setup();
  const { result } = renderHook(() => usePersonDetail(person.id), { wrapper });
  await waitFor(() => expect(result.current.notes).toBe('Old context'));
  act(() => result.current.setNotes('Draft being edited'));
  act(() => { client.setQueryData(['person', 'user-1', person.id], { ...person, notes: 'Background result' }); });
  expect(result.current.notes).toBe('Draft being edited');
});
