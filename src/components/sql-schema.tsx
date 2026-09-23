"use client";

import { useId, useRef, useState } from "react";
import { Database, Link2 } from "lucide-react";
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
  const [active, setActive] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = [
    ...tables.map((table) => ({ label: table.name, table })),
    ...(notes.length ? [{ label: "答题约定", table: null }] : []),
  ];
  const selected = Math.min(active, panels.length - 1);
  const hasAccounts = tables.some(
    (table) =>
      table.name === "accounts" &&
      table.fields.some(
        (field) => field.name === "account_id" && field.primaryKey,
      ),
  );

  return (
    <section className={styles.schema} aria-label="SQL 数据参考">
      <div className={styles.heading}>
        <Database size={16} aria-hidden="true" />
        <h4>数据表结构</h4>
        <span>{tables.length} 张表</span>
      </div>
      <div className={styles.mobileSelect}>
        <select
          aria-label="选择数据表或答题约定"
          value={selected}
          onChange={(event) => setActive(Number(event.target.value))}
        >
          {panels.map((panel, index) => (
            <option key={panel.label} value={index}>
              {panel.label}
              {panel.table && tableLabels[panel.label]
                ? ` · ${tableLabels[panel.label]}`
                : ""}
            </option>
          ))}
        </select>
      </div>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="选择数据表或答题约定"
      >
        {panels.map((panel, index) => (
          <button
            key={panel.label}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight")
                next = (index + 1) % panels.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + panels.length) % panels.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = panels.length - 1;
              else return;
              event.preventDefault();
              setActive(next);
              tabs.current[next]?.focus();
            }}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {panels.map(({ label, table }, index) => (
        <div
          key={label}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          className={styles.panel}
          hidden={selected !== index}
          tabIndex={0}
        >
          {table ? (
            <>
              <table className={styles.table}>
                <caption>
                  <span>{tableLabels[table.name] || table.name}</span>
                  <span>{table.fields.length} 个字段</span>
                </caption>
                <thead>
                  <tr>
                    <th scope="col">字段 / 说明</th>
                    <th scope="col">类型</th>
                  </tr>
                </thead>
                <tbody>
                  {table.fields.map((field) => (
                    <tr key={field.name}>
                      <th scope="row">
                        <code>{field.name}</code>
                        <span className={styles.description}>
                          {fieldLabels[field.name] || "—"}
                          {field.primaryKey && (
                            <span className={styles.key}>主键</span>
                          )}
                        </span>
                      </th>
                      <td>
                        <code>{field.type}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasAccounts &&
                table.name !== "accounts" &&
                table.fields.some((field) => field.name === "account_id") && (
                  <p className={styles.relationship}>
                    <Link2 size={14} aria-hidden="true" />
                    <span>
                      <code>account_id</code> 对应{" "}
                      <code>accounts.account_id</code>
                    </span>
                  </p>
                )}
            </>
          ) : (
            <ul className={styles.rules}>
              {notes
                .flatMap((note) => note.split(/(?<=[.;])\s+/))
                .map((rule, index) => (
                  <li key={index} lang={ruleLabels[rule] ? "zh-CN" : "en"}>
                    {ruleLabels[rule] || rule}
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
