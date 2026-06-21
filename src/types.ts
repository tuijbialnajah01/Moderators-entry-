export interface Mod {
  id: string;
  name: string;
  phoneNumber?: string;
  phone?: string;
  avatarUrl?: string;
  lastEntryAt: number;
  deadlineAt: number;
  createdAt: number;
  updatedAt: number;
  status?: 'active' | 'blacklisted';
  role?: 'moderator' | 'officer';
  group?: string;
  groups?: string[];
  officerId?: string; // Legacy
  officerIds?: string[];
  totalPoints?: number;
  honorScore?: number;
  entryCount: number;
}

export interface Entry {
  id: string;
  text: string;
  createdAt: number;
  createdBy: string;
  points?: number;
}

export interface HonorLog {
  id: string;
  amount: number;
  reason: string;
  createdAt: number;
  createdBy: string;
  type: 'entry_auto' | 'manual';
  evidenceUrl?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

import { auth } from './lib/firebase';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
