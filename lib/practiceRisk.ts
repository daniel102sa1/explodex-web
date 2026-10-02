export type RiskPlan = {
  quantity: number; notional: number; margin: number; riskUsdt: number; riskPctActual: number;
  rewardUsdt: number; rr: number; capped: boolean;
};

/** One entry, SL and TP. Conservative simulated round-trip taker fees and slippage. */
export function sizePaperPosition(args: {
  equity: number; availableMargin: number; riskPct: number; leverage: number;
  entry: number; stop: number; target: number; feePerSide?: number; slippagePerSide?: number;
}): RiskPlan | null {
  const {equity,availableMargin,riskPct,leverage,entry,stop,target}=args;
  const fee=args.feePerSide??0.0005;
  const slippage=args.slippagePerSide??0.0002;
  if (![equity,availableMargin,riskPct,leverage,entry,stop,target,fee,slippage].every(Number.isFinite)
    || equity<=0||availableMargin<=0||riskPct<=0||riskPct>10
    || leverage<1||leverage>20||entry<=0||stop<=0||target<=0
    || (stop-entry)*(target-entry)>=0
    || fee<0||fee>.01||slippage<0||slippage>.01) return null;
  const riskPerCoin=Math.abs(entry-stop)+(entry+stop)*fee+entry*2*slippage;
  const rewardPerCoin=Math.abs(target-entry)-(entry+target)*fee-entry*2*slippage;
  if (riskPerCoin<=0||rewardPerCoin<=0) return null;
  const desiredQuantity=equity*(riskPct/100)/riskPerCoin;
  const maxQuantity=availableMargin*leverage/entry;
  const quantity=Math.min(desiredQuantity,maxQuantity);
  if (quantity<=0) return null;
  const notional=quantity*entry, margin=notional/leverage, riskUsdt=quantity*riskPerCoin;
  return {quantity,notional,margin,riskUsdt,riskPctActual:riskUsdt/equity*100,
    rewardUsdt:quantity*rewardPerCoin,rr:rewardPerCoin/riskPerCoin,
    capped:desiredQuantity>maxQuantity};
}
