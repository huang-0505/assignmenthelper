import type { ReactNode } from "react";
import { SqlSchema } from "./sql-schema";
import styles from "./interview-workspace.module.css";

export function InterviewWorkspace({
  schema,
  children,
}: {
  schema?: string;
  children: ReactNode;
}) {
  if (!schema) return children;

  return (
    <div className={styles.container}>
      <div className={styles.workspace}>
        <SqlSchema key={schema} schema={schema} />
        <div className={styles.answer}>{children}</div>
      </div>
    </div>
  );
}
