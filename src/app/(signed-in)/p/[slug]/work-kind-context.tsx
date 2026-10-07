'use client';
import { createContext, useContext } from 'react';
import type { WorkKind } from '@/lib/work-kind';

const WorkKindContext = createContext<WorkKind>('task');
export const WorkKindProvider = WorkKindContext.Provider;
export const useWorkKind = () => useContext(WorkKindContext);
