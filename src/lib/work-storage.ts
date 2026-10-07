import 'server-only';
import {
  nodes, fieldDefinitions, fieldOptions, projects, notifications,
  defectNodes, defectFieldDefinitions, defectFieldOptions, defectSettings, defectNotifications,
} from '@/db/schema';
import type { WorkKind } from '@/lib/work-kind';

/** SQL identifiers are fixed here, never taken from a request. */
export function workStorage(kind: WorkKind) {
  return kind === 'defect' ? {
    nodes: defectNodes, fieldDefinitions: defectFieldDefinitions, fieldOptions: defectFieldOptions,
    settings: defectSettings, notifications: defectNotifications,
    nodeTable: 'pmt_defect_nodes', fieldTable: 'pmt_defect_field_definitions', optionTable: 'pmt_defect_field_options',
    ledgerFunction: 'pmf_defect_project_ledger', descendantsFunction: 'pmf_defect_descendants',
    moveProcedure: 'pmp_defect_move_subtree', archiveProcedure: 'pmp_defect_archive_subtree', restoreProcedure: 'pmp_defect_restore_subtree',
  } as const : {
    nodes, fieldDefinitions, fieldOptions, settings: projects, notifications,
    nodeTable: 'pmt_nodes', fieldTable: 'pmt_field_definitions', optionTable: 'pmt_field_options',
    ledgerFunction: 'pmf_project_ledger', descendantsFunction: 'pmf_descendants',
    moveProcedure: 'pmp_move_subtree', archiveProcedure: 'pmp_archive_subtree', restoreProcedure: 'pmp_restore_subtree',
  } as const;
}
