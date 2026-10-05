"use client";

import { Gift } from "lucide-react";
import { useGame } from "./provider";

export function RewardBalance() {
  const balance = useGame().snapshot.state.rewardBalance ?? 0;
  if (balance === 0) return null;

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(balance);

  return (
    <section className="white-panel reward-balance" aria-label="奖励余额">
      <span className="task-icon green" aria-hidden="true">
        <Gift size={23} />
      </span>
      <h2>奖励余额</h2>
      <strong>{amount}</strong>
    </section>
  );
}
