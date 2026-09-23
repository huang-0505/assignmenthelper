import { ChevronDown, Database, Link2, Table2 } from "lucide-react";
import styles from "./sql-schema.module.css";

const tableLabels: Record<string, string> = {
  accounts: "账户",
  sessions: "访问会话",
  orders: "订单",
  contacts: "联系记录",
};

const fieldLabels: Record<string, string> = {
  account_id: "账户 ID",
  signup_date: "注册日期",
  region: "地区",
  session_id: "会话 ID",
  started_at: "会话开始时间",
  converted: "是否转化",
  order_id: "订单 ID",
  ordered_at: "下单时间",
  amount: "订单收入",
  status: "订单状态",
  contact_id: "联系记录 ID",
  contacted_at: "联系时间",
  channel: "联系渠道",
};

const ruleLabels: Record<string, string> = {
  "All timestamps are instants.": "所有时间戳都表示一个确定的时间点。",
  "Amount is order revenue.": "amount 表示订单收入。",
  "Use America/New_York for local-date questions.":
    "涉及本地日期时，使用 America/New_York（纽约）时区。",
  "Use PostgreSQL.": "使用 PostgreSQL 语法。",
  "Unless stated otherwise, include only status = 'paid' orders;":
    "除非题目另有说明，只统计 status = 'paid' 的已付款订单。",
  "NULL amounts contribute zero revenue.": "amount 为 NULL 时，收入按 0 计算。",
};

// Read the question bank's compact schema notation, not arbitrary SQL DDL.
// Keep unsupported lines intact so a new schema never silently loses details.
function readSchema(schema: string) {
  const tables = [];
  const notes: string[] = [];
  for (const line of schema
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)) {
    const table = line.match(/^(\w+)\((.+)\)$/);
    const fields = table?.[2].split(/,(?![^()]*\))/).map((field) => {
      const match = field
        .trim()
        .match(
          /^(\w+)\s+([A-Z][A-Z0-9]*(?:\(\d+(?:,\s*\d+)?\))?)(?:\s+(PRIMARY KEY))?$/i,
        );
      return match
        ? { name: match[1], type: match[2], primaryKey: Boolean(match[3]) }
        : null;
    });
    if (table && fields?.every((field) => field !== null)) {
      tables.push({ name: table[1], fields });
    } else {
      notes.push(line);
    }
  }
  return { tables, notes };
}

export function SqlSchema({ schema }: { schema: string }) {
  const { tables, notes } = readSchema(schema);
  const accountTable = tables.find((table) => table.name === "accounts");
  const relatedTables = accountTable?.fields.some(
    (field) => field.name === "account_id" && field.primaryKey,
  )
    ? tables.filter(
        (table) =>
          table.name !== "accounts" &&
          table.fields.some((field) => field.name === "account_id"),
      )
    : [];

  return (
    <details className={styles.schema} open>
      <summary className={styles.summary}>
        <Database size={17} aria-hidden="true" />
        <span>数据表结构</span>
        {tables.length > 0 && (
          <span className={styles.count}>{tables.length} 张表</span>
        )}
        <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
      </summary>
      <div className={styles.content}>
        {relatedTables.length > 0 && (
          <p className={styles.relationship}>
            <Link2 size={16} aria-hidden="true" />
            <span>
              {relatedTables.map((table) => table.name).join("、")} 中的{" "}
              <code>account_id</code> 对应 <code>accounts.account_id</code>。
            </span>
          </p>
        )}
        <div className={styles.grid}>
          {tables.map((table) => (
            <div className={styles.card} key={table.name}>
              <table className={styles.table}>
                <caption>
                  <span className={styles.tableName}>
                    <Table2 size={16} aria-hidden="true" />
                    <code>{table.name}</code>
                    <span>{tableLabels[table.name]}</span>
                  </span>
                  <span className={styles.fieldCount}>
                    {table.fields.length} 个字段
                  </span>
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      字段<span className={styles.mobileLabel}> / 说明</span>
                    </th>
                    <th scope="col">类型</th>
                    <th scope="col">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {table.fields.map((field) => (
                    <tr key={field.name}>
                      <th scope="row">
                        <code>{field.name}</code>
                        <span className={styles.mobileDescription}>
                          {fieldLabels[field.name] || "—"}
                          {field.primaryKey && (
                            <span className={styles.key}>主键</span>
                          )}
                        </span>
                      </th>
                      <td>
                        <code className={styles.type}>{field.type}</code>
                      </td>
                      <td>
                        {fieldLabels[field.name] || "—"}
                        {field.primaryKey && (
                          <span className={styles.key}>主键</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {notes.length > 0 && (
          <aside className={styles.rules} aria-label="答题约定">
            <h4>答题约定</h4>
            <ul>
              {notes
                .flatMap((note) => note.split(/(?<=[.;])\s+/))
                .map((rule, index) => (
                  <li key={index} lang={ruleLabels[rule] ? "zh-CN" : "en"}>
                    {ruleLabels[rule] || rule}
                  </li>
                ))}
            </ul>
          </aside>
        )}
      </div>
    </details>
  );
}
