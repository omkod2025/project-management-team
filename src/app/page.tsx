import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { rawQuery } from '@/db/client';

/**
 * The shelf: every project this user is a member of.
 *
 * Scoped by membership, so a project with no membership row is not merely
 * hidden — it is absent from the query (spec 05 §4).
 */

type Row = {
  project_id: string;
  project_name: string;
  project_slug: string;
  member_role: string;
  node_count: string;
  dated_count: string;
};

export default async function Home() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const rows = await rawQuery<Row>(
    `SELECT p.project_id, p.project_name, p.project_slug, m.member_role,
            count(n.node_id) FILTER (WHERE n.node_archived_at IS NULL)                              AS node_count,
            count(n.node_id) FILTER (WHERE n.node_archived_at IS NULL
                                       AND n.node_estimate_end IS NOT NULL)                         AS dated_count
       FROM pmt_projects p
       JOIN pmt_project_members m ON m.member_project_id = p.project_id
       LEFT JOIN pmt_nodes n      ON n.node_project_id  = p.project_id
      WHERE m.member_user_id = $1
        AND p.project_archived_at IS NULL
      GROUP BY p.project_id, p.project_name, p.project_slug, m.member_role
      ORDER BY p.project_name`,
    [userId],
  );

  return (
    <main className="page" style={{ padding: '32px 20px' }}>
      <h1 style={{ fontFamily: 'var(--font-struct)', fontSize: 'var(--type-headline-size)', margin: 0 }}>
        Field Book
      </h1>

      <table style={{ borderCollapse: 'separate', borderSpacing: 0, marginTop: 24, width: '100%' }}>
        <thead>
          <tr className="label">
            {['Project', 'Role', 'Nodes', 'Dated'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: h === 'Nodes' || h === 'Dated' ? 'right' : 'left',
                  height: 26,
                  padding: '0 10px',
                  color: 'var(--color-ink-graphite-soft)',
                  // the signature double rule, and it appears nowhere else
                  boxShadow: 'inset 0 -1px 0 var(--color-rule-major), 0 2px 0 -1px var(--color-rule-major)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.project_id}>
              <td style={cell}>
                <Link href={`/p/${r.project_slug}`}>{r.project_name}</Link>
              </td>
              <td style={{ ...cell, color: 'var(--color-ink-graphite-soft)' }} className="label">
                {r.member_role}
              </td>
              <td style={{ ...cell, textAlign: 'right' }} className="figure">{r.node_count}</td>
              <td style={{ ...cell, textAlign: 'right' }} className="figure">{r.dated_count}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...cell, color: 'var(--color-ink-graphite-soft)' }}>
                No projects yet. An admin adds you to one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const cell: React.CSSProperties = {
  height: 'var(--space-row)',
  padding: '0 10px',
  borderBottom: '1px solid var(--color-rule)',
  whiteSpace: 'nowrap',
};
