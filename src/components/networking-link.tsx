import { ArrowUpRight } from "lucide-react";

export function JobSearchLink() {
  return (
    <div className="networking-tool">
      <a
        href="https://www.linkedin.com/jobs/"
        target="_blank"
        rel="noopener noreferrer"
      >
        打开 LinkedIn Jobs <ArrowUpRight size={16} />
        <span className="sr-only">（新标签页）</span>
      </a>
      <small>浏览和投递职位。完成后回来记录实际投递数量；不会自动同步。</small>
    </div>
  );
}

export function NetworkingLink() {
  return (
    <div className="networking-tool">
      <a
        href="https://www.networkbunny.app/"
        target="_blank"
        rel="noopener noreferrer"
      >
        打开 NetworkBunny <ArrowUpRight size={16} />
        <span className="sr-only">（新标签页）</span>
      </a>
      <small>
        寻找联系人、准备消息。完成后回来记录实际联系人数；不会自动同步。
      </small>
    </div>
  );
}
