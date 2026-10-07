import styles from './loading-status.module.css';

export default function LoadingStatus({ label = 'กำลังโหลดข้อมูล…' }: {
  label?: string;
}) {
  return (
    <div className={styles.inline} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
