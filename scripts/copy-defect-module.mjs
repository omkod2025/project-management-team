import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

pg.types.setTypeParser(pg.types.builtins.DATE, value => value);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const modules = (await client.query(`SELECT n.node_id,n.node_name,p.project_id,p.project_name,p.project_slug
    FROM pmt_nodes n JOIN pmt_projects p ON p.project_id=n.node_project_id
    WHERE n.node_depth=2 AND n.node_archived_at IS NULL AND p.project_archived_at IS NULL
      AND lower(trim(n.node_name))='defect'`)).rows;
  const report = [];
  if (process.argv.includes('--apply')) {
    if (modules.length !== 1) throw new Error('Expected one unambiguous Defect module.');
    const module = modules[0];
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,571))', [module.project_id]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,572))', [module.project_id]);
      const nodes = (await client.query(`WITH RECURSIVE tree AS (
        SELECT node_id FROM pmt_nodes WHERE node_id=$1
        UNION ALL SELECT n.node_id FROM pmt_nodes n JOIN tree t ON n.node_parent_id=t.node_id
      ) SELECT n.* FROM pmt_nodes n JOIN tree t USING(node_id)
        ORDER BY node_depth,node_sort_order,node_id FOR SHARE OF n`, [module.node_id])).rows;
      const sourceSnapshot = JSON.stringify(nodes);
      const target = (await client.query('SELECT * FROM pmt_defect_nodes WHERE node_project_id=$1 FOR UPDATE', [module.project_id])).rows;
      const root = target.find(n=>n.node_depth===1 && !n.node_archived_at);
      if (!root) throw new Error('Open the Defect tab to initialize its root before copying.');
      if (target.some(n=>nodes.some(s=>n.node_custom_values._copied_from_task_id===s.node_id))) {
        throw new Error('This module has already been copied; refusing duplicate copies.');
      }
      const fields = (await client.query('SELECT * FROM pmt_field_definitions WHERE field_project_id=$1 FOR SHARE', [module.project_id])).rows;
      const targetFields = (await client.query('SELECT * FROM pmt_defect_field_definitions WHERE field_project_id=$1 FOR SHARE', [module.project_id])).rows;
      const options = (await client.query('SELECT o.* FROM pmt_field_options o JOIN pmt_field_definitions f ON f.field_id=o.option_field_id WHERE f.field_project_id=$1 FOR SHARE OF o', [module.project_id])).rows;
      const targetOptions = (await client.query('SELECT o.* FROM pmt_defect_field_options o JOIN pmt_defect_field_definitions f ON f.field_id=o.option_field_id WHERE f.field_project_id=$1 FOR SHARE OF o', [module.project_id])).rows;
      const fieldMap = new Map();
      const optionMap = new Map();
      for (const field of fields) {
        const matches = targetFields.filter(f=>f.field_name===field.field_name && f.field_kind===field.field_kind);
        if (matches.length!==1) throw new Error(`Ambiguous or missing destination field: ${field.field_name}`);
        const dest = matches[0];
        fieldMap.set(field.field_id, dest.field_id);
        for (const option of options.filter(o=>o.option_field_id===field.field_id)) {
          const matchingOptions = targetOptions.filter(o=>o.option_field_id===dest.field_id && o.option_label===option.option_label && o.option_stage===option.option_stage && !!o.option_archived_at===!!option.option_archived_at);
          if (matchingOptions.length!==1) throw new Error(`Ambiguous or missing option: ${field.field_name}/${option.option_label}`);
          optionMap.set(option.option_id, matchingOptions[0].option_id);
        }
      }
      const remapValues = source => Object.fromEntries([
        ...Object.entries(source.node_custom_values).map(([key,value])=>{
          if (key.startsWith('_')) return [key,value];
          const field = fields.find(f=>f.field_id===key);
          if (!field) throw new Error(`Unknown source field ${key}`);
          const remap = id => { if (!optionMap.has(id)) throw new Error(`Unmapped option ${id}`); return optionMap.get(id); };
          return [fieldMap.get(key), value===null ? null : field.field_kind==='select' ? remap(value) : field.field_kind==='multi_select' ? value.map(remap) : value];
        }),
        ['_copied_from_task_id',source.node_id],
      ]);
      const nodeMap = new Map(nodes.map(n=>[n.node_id,randomUUID()]));
      const columns = ['node_id','node_project_id','node_parent_id','node_depth','node_name','node_sort_order',
        'node_estimate_start','node_estimate_end','node_actual_start','node_actual_end',
        'node_actual_start_raw','node_actual_end_raw','node_actual_source_start','node_actual_source_end',
        'node_custom_values','node_archived_at','node_created_by'];
      const copies = nodes.map(source=>({ ...source, node_id:nodeMap.get(source.node_id),
        node_parent_id:source.node_id===module.node_id ? root.node_id : nodeMap.get(source.node_parent_id),
        node_sort_order:source.node_id===module.node_id ? Math.max(-1,...target.filter(n=>n.node_depth===2).map(n=>n.node_sort_order))+1 : source.node_sort_order,
        node_custom_values:remapValues(source) }));
      const snapshotFile = `data/defect-copy-${Date.now()}.json`;
      mkdirSync('data',{recursive:true});
      writeFileSync(snapshotFile,JSON.stringify({module,source:nodes,targetBefore:target,mapping:Object.fromEntries(nodeMap)},null,2));
      for (const copy of copies) {
        if (!copy.node_parent_id) throw new Error(`Missing copied parent for ${copy.node_name}`);
        await client.query(`INSERT INTO pmt_defect_nodes (${columns.join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')})`,columns.map(c=>c==='node_custom_values'?JSON.stringify(copy[c]):copy[c]));
      }
      const inserted = (await client.query('SELECT * FROM pmt_defect_nodes WHERE node_id=ANY($1::uuid[])',[copies.map(n=>n.node_id)])).rows;
      if (inserted.length!==copies.length) throw new Error('Copied count mismatch.');
      for (const copy of copies) {
        const actual=inserted.find(n=>n.node_id===copy.node_id);
        for (const column of columns) {
          if (column==='node_custom_values') {
            for (const key of new Set([...Object.keys(actual[column]),...Object.keys(copy[column])])) {
              if (JSON.stringify(actual[column][key])!==JSON.stringify(copy[column][key])) throw new Error(`Copied value mismatch: ${key}`);
            }
          } else if (String(actual[column])!==String(copy[column])) throw new Error(`Copied column mismatch: ${column}`);
        }
      }
      const unchanged = (await client.query('SELECT * FROM pmt_nodes WHERE node_id=ANY($1::uuid[]) ORDER BY node_depth,node_sort_order,node_id',[nodes.map(n=>n.node_id)])).rows;
      if (JSON.stringify(unchanged)!==sourceSnapshot) throw new Error('Source changed during copy.');
      await client.query('COMMIT');
      console.log(JSON.stringify({project:module.project_name,url:`http://localhost:3010/p/${module.project_slug}/defects`,copiedModule:module.node_name,tasks:copies.length-1,activeTasks:copies.filter(n=>n.node_depth>2&&!n.node_archived_at).length,archivedTasks:copies.filter(n=>n.node_archived_at).length,sourceUnchanged:true,snapshotFile},null,2));
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    process.exitCode=0;
  } else {
  for (const module of modules) {
    const nodes = (await client.query(`WITH RECURSIVE tree AS (
      SELECT * FROM pmt_nodes WHERE node_id=$1
      UNION ALL SELECT n.* FROM pmt_nodes n JOIN tree t ON n.node_parent_id=t.node_id
    ) SELECT * FROM tree ORDER BY node_depth,node_sort_order,node_id`, [module.node_id])).rows;
    const fields = (await client.query('SELECT * FROM pmt_field_definitions WHERE field_project_id=$1 ORDER BY field_position', [module.project_id])).rows;
    const targetFields = (await client.query('SELECT * FROM pmt_defect_field_definitions WHERE field_project_id=$1 ORDER BY field_position', [module.project_id])).rows;
    const target = (await client.query('SELECT node_id,node_name,node_depth,node_custom_values FROM pmt_defect_nodes WHERE node_project_id=$1 ORDER BY node_depth,node_sort_order', [module.project_id])).rows;
    report.push({ ...module, count: nodes.length - 1, archived: nodes.filter(n=>n.node_archived_at).length,
      fields: fields.map(f=>({id:f.field_id,name:f.field_name,kind:f.field_kind})),
      targetFields: targetFields.map(f=>({id:f.field_id,name:f.field_name,kind:f.field_kind})), target,
      valueKeys: [...new Set(nodes.flatMap(n=>Object.keys(n.node_custom_values)))],
      sample: nodes.slice(1,4).map(n=>({name:n.node_name,values:n.node_custom_values})) });
  }
  console.log(JSON.stringify(report, null, 2));
  }
} finally { await client.end(); }
