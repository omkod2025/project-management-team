import type { LedgerRow } from '@/db/schema';
import type { FieldDef, Person } from './ledger';

export type TaskDetail = {
  row: LedgerRow;
  projectName: string;
  fields: FieldDef[];
  people: Person[];
  permissions: { rename: boolean; dates: boolean; values: boolean };
};
