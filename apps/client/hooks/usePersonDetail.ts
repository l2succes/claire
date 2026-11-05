import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { contactsApi, type PersonContact } from '../services/contacts';
import { userFacingErrorMessage } from '../services/api-errors';
import { useAuthStore } from '../stores/authStore';

export function usePersonDetail(contactId: string | undefined) {
  const userId = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  const queryKey = ['person', userId, contactId] as const;
  const person = useQuery({ queryKey, enabled: !!userId && !!contactId,
    staleTime: 60_000, queryFn: () => contactsApi.get(contactId!) });
  const [notes, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editorKey = `${userId ?? ''}:${contactId ?? ''}`;
  const activeKey = useRef(editorKey);
  activeKey.current = editorKey;
  const initializedFor = useRef<string | null>(null);
  const draft = useRef(notes);
  const pendingFor = useRef<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSaving(false); setSaved(false); setSaveError(null);
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  }, [editorKey]);

  useEffect(() => {
    if (!person.data || initializedFor.current === editorKey) return;
    initializedFor.current = editorKey;
    draft.current = person.data.notes || '';
    setDraft(draft.current);
  }, [person.data, editorKey]);

  const setNotes = (value: string) => {
    draft.current = value;
    setDraft(value);
    setSaved(false);
  };

  const saveNotes = async () => {
    if (!userId || !contactId || pendingFor.current === editorKey) return;
    const submitted = draft.current;
    pendingFor.current = editorKey;
    setSaving(true); setSaveError(null);
    try {
      const result = await contactsApi.saveNotes(contactId, submitted);
      // Do not repopulate a cleared cache after logout/account switching.
      if (useAuthStore.getState().user?.id !== userId) return;
      client.setQueryData<PersonContact>(queryKey, current => current ? { ...current, notes: result.notes } : current);
      if (activeKey.current === editorKey && draft.current === submitted) {
        draft.current = result.notes || '';
        setDraft(draft.current);
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1800);
      }
    } catch (error) {
      if (activeKey.current === editorKey) setSaveError(userFacingErrorMessage(error, 'Could not save. Try again.'));
    } finally {
      if (pendingFor.current === editorKey) pendingFor.current = null;
      if (activeKey.current === editorKey) setSaving(false);
    }
  };

  return { person, notes, setNotes, saving, saveError, saved, saveNotes };
}
